from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory, flash, abort
from flask_cors import CORS
import sqlite3
import uuid
import os
import datetime
import secrets
from functools import wraps
import shutil
from flask_socketio import SocketIO, emit, join_room, leave_room, close_room
import json
import time
import logging
import hashlib
from werkzeug.utils import secure_filename

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('chat_server')

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.secret_key = secrets.token_hex(16)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(hours=24)
app.config['POLLING_ENABLED'] = True  # Включаем поддержку HTTP-опроса

# Определяем домен для API
API_DOMAIN = os.environ.get('API_DOMAIN', 'online-prava-shop.ru')

# Настройка CORS и Socket.IO для этого домена
socketio = SocketIO(app, cors_allowed_origins=["*", f"https://{API_DOMAIN}", f"http://{API_DOMAIN}"], 
                   async_mode='threading')

# Настройки базы данных
DATABASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'chat_db.sqlite'))

# Создание директории для статических файлов, если её нет
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# Копирование файла виджета чата в статическую директорию при запуске
def copy_chat_widget():
    js_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'js')
    widget_path = os.path.join(js_dir, 'chat-widget.js')
    target_path = os.path.join(STATIC_DIR, 'chat-widget.js')
    
    if os.path.exists(widget_path):
        shutil.copy2(widget_path, target_path)
        print(f"Виджет чата скопирован в {target_path}")
    else:
        print(f"Файл виджета чата не найден по пути {widget_path}")

# Маршрут для доступа к статическим файлам
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

# Создание базы данных, если она не существует
def init_db():
    """Инициализирует базу данных"""
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        
        # Создаем таблицы, если они еще не существуют
        conn.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            chat_id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        )
        ''')
        
        conn.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT,
            is_read INTEGER DEFAULT 0,
            FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
        )
        ''')
        
        conn.execute('''
        CREATE TABLE IF NOT EXISTS forms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            form_data TEXT NOT NULL,
            page_url TEXT,
            site_id TEXT,
            form_name TEXT DEFAULT 'Форма заказа',
            processed INTEGER DEFAULT 0,
            operator_id INTEGER,
            processed_at TEXT,
            comment TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Проверяем и обновляем структуру таблицы форм
        try:
            # Проверяем наличие поля form_name
            conn.execute("SELECT form_name FROM forms LIMIT 1")
        except sqlite3.OperationalError:
            # Если поле не существует, добавляем его
            logger.info("Обновление схемы таблицы forms: добавление поля form_name")
            conn.execute("ALTER TABLE forms ADD COLUMN form_name TEXT DEFAULT 'Форма заказа'")
            
        conn.execute('''
        CREATE TABLE IF NOT EXISTS operators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'operator',
            last_login TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        conn.execute('''
        CREATE TABLE IF NOT EXISTS operator_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator_id INTEGER NOT NULL,
            session_id TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expire_at TEXT,
            FOREIGN KEY (operator_id) REFERENCES operators(id)
        )
        ''')
        
        # Проверяем наличие администратора
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM operators WHERE username = 'admin'")
        admin_count = cursor.fetchone()[0]
        
        # Если администратора нет, создаем его
        if admin_count == 0:
            # Хешируем пароль
            admin_password = hashlib.sha256("admin123".encode()).hexdigest()
            
            conn.execute(
                "INSERT INTO operators (username, password, name, role) VALUES (?, ?, ?, ?)",
                ("admin", admin_password, "Администратор", "admin")
            )
            logger.info("Создан аккаунт администратора (admin/admin123)")
        
        conn.commit()
        conn.close()
        logger.info("База данных инициализирована успешно")
        
    except Exception as e:
        logger.error(f"Ошибка при инициализации базы данных: {e}")
        if conn:
            conn.close()

# Инициализация базы данных при запуске приложения
init_db()
copy_chat_widget()

# Получение соединения с базой данных
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# Декоратор для проверки авторизации
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'operator_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Функция проверки авторизации
def is_authenticated():
    return 'operator_id' in session

# API для чата
@app.route('/chat/start', methods=['POST'])
def start_chat():
    try:
        data = request.get_json()
        if not data or 'name' not in data or 'phone' not in data or 'message' not in data:
            return jsonify({'success': False, 'error': 'Отсутствуют обязательные параметры'})

        name = data['name']
        phone = data['phone']
        message = data['message']
        page_url = data.get('page_url', '')

        # Создаем новый чат
        db = get_db()
        cursor = db.cursor()
        
        # Добавляем created_at при создании чата
        cursor.execute('''
            INSERT INTO chats (name, phone, page_url, status, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        ''', (name, phone, page_url, 'active'))
        
        chat_id = cursor.lastrowid
        
        # Добавляем первое сообщение
        cursor.execute('''
            INSERT INTO chat_messages (chat_id, message, sender, created_at)
            VALUES (?, ?, ?, datetime('now'))
        ''', (chat_id, message, 'user'))
        
        db.commit()
        
        return jsonify({
            'success': True,
            'chat_id': chat_id,
            'message': 'Чат успешно создан'
        })
        
    except Exception as e:
        print(f"Ошибка при создании чата: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/chat/check_new', methods=['GET'])
def check_new_messages():
    chat_id = request.args.get('chat_id')
    last_time = request.args.get('last_time')
    
    if not chat_id:
        return jsonify({'success': False, 'error': "Missing required parameter: chat_id"})
    
    db = get_db()
    cursor = db.cursor()
    
    # Проверяем существование чата
    cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return jsonify({'success': False, 'error': "Chat not found"})
    
    # Обновляем время последней активности
    timestamp = datetime.datetime.now().isoformat()
    cursor.execute('''
    UPDATE chats SET updated_at = ?
    WHERE chat_id = ?
    ''', (timestamp, chat_id))
    db.commit()
    
    # Получаем новые сообщения из базы данных
    if last_time and last_time != '0':
        cursor.execute('''
        SELECT sender, message, timestamp FROM chat_messages
        WHERE chat_id = ? AND timestamp > ? ORDER BY timestamp ASC
        ''', (chat_id, last_time))
    else:
        cursor.execute('''
        SELECT sender, message, timestamp FROM chat_messages
        WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 20
        ''', (chat_id,))
    
    messages = [{'sender': row['sender'], 'message': row['message'], 'timestamp': row['timestamp']} 
                for row in cursor.fetchall()]
    
    # Если это первый запрос, переворачиваем список сообщений, чтобы они шли от старых к новым
    if not last_time or last_time == '0':
        messages.reverse()
    
    db.close()
    
    return jsonify({'success': True, 'messages': messages})

@app.route('/chat/history', methods=['GET'])
def get_chat_history():
    chat_id = request.args.get('chat_id')
    site_id = request.args.get('site_id')
    
    if not chat_id or not site_id:
        return jsonify({'success': False, 'error': "Missing required parameters"})
    
    db = get_db()
    cursor = db.cursor()
    
    # Проверяем существование чата
    cursor.execute("SELECT * FROM chats WHERE chat_id = ? AND site_id = ?", (chat_id, site_id))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return jsonify({'success': False, 'error': "Chat not found"})
    
    # Получаем историю сообщений
    cursor.execute('''
    SELECT sender, message, timestamp FROM chat_messages
    WHERE chat_id = ? ORDER BY timestamp ASC
    ''', (chat_id,))
    
    messages = [{'sender': row['sender'], 'message': row['message'], 'timestamp': row['timestamp']} 
                for row in cursor.fetchall()]
    
    db.close()
    
    return jsonify({'success': True, 'messages': messages})

@app.route('/chat/message', methods=['POST'])
def send_message():
    """Добавить новое сообщение в чат"""
    data = request.get_json()
    
    # Проверяем наличие обязательных параметров
    required_params = ['chat_id', 'site_id', 'sender', 'message']
    for param in required_params:
        if param not in data:
            return jsonify({'success': False, 'error': f'Отсутствует параметр {param}'})
    
    # Получаем текущее время
    current_time = datetime.datetime.now().isoformat()
    
    # Добавляем сообщение в базу
    conn = get_db()
    conn.execute('''
    INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
    VALUES (?, ?, ?, ?, ?)
    ''', (data['chat_id'], data['sender'], data['message'], current_time, 0))
    
    # Обновляем время активности чата
    conn.execute('''
    UPDATE chats 
    SET updated_at = ? 
    WHERE chat_id = ?
    ''', (current_time, data['chat_id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'timestamp': current_time})

# Обработка формы обратной связи
@app.route('/form/submit', methods=['POST'])
def handle_form():
    data = request.json
    
    # Проверяем необходимые поля
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    email = data.get('email', '').strip()
    message = data.get('message', '').strip()
    form_id = data.get('form_id', 'contact_form')
    
    # Проверяем наличие имени и телефона или email
    if not name or (not phone and not email):
        return jsonify({'success': False, 'error': 'Name and either phone or email are required'})
    
    # Дополнительные данные
    site_id = request.headers.get('Origin', '').replace('https://', '').replace('http://', '').split('/')[0]
    page_url = request.headers.get('Referer', '')
    ip_address = request.remote_addr
    user_agent = request.headers.get('User-Agent', '')
    timestamp = datetime.datetime.now().isoformat()
    
    db = get_db()
    cursor = db.cursor()
    
    # Сохраняем данные в базу
    cursor.execute('''
    INSERT INTO form_submissions (site_id, form_id, name, phone, email, message, page_url, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (site_id, form_id, name, phone, email, message, page_url, ip_address, user_agent, timestamp))
    
    db.commit()
    db.close()
    
    return jsonify({'success': True, 'message': 'Form submitted successfully'})

# Маршруты для административной панели
@app.route('/admin/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        
        if not username or not password:
            error = 'Пожалуйста, введите имя пользователя и пароль'
        else:
            from werkzeug.security import check_password_hash
            
            db = get_db()
            cursor = db.cursor()
            cursor.execute("SELECT * FROM operators WHERE username = ?", (username,))
            operator = cursor.fetchone()
            
            if operator and operator['active'] == 1 and check_password_hash(operator['password'], password):
                session['operator_id'] = operator['id']
                session['operator_name'] = operator['name']
                session['operator_role'] = operator['role']
                
                # Обновляем время последнего входа
                cursor.execute("UPDATE operators SET last_login = ? WHERE id = ?", 
                              (datetime.datetime.now().isoformat(), operator['id']))
                
                db.commit()
                db.close()
                
                return redirect(url_for('admin_dashboard'))
            else:
                error = 'Неверное имя пользователя или пароль'
            
            db.close()
    
    return render_template('login.html', error=error)

@app.route('/admin/logout')
def logout():
    if 'operator_id' in session:
        # Очищаем сессию
        session.clear()
    return redirect(url_for('login'))

@app.route('/admin')
@login_required
def admin_dashboard():
    db = get_db()
    cursor = db.cursor()
    
    # Получаем статистику
    cursor.execute("SELECT COUNT(*) as count FROM chats WHERE active = 1")
    active_chats = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM chat_messages WHERE is_read = 0 AND sender = 'user'")
    unread_messages = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM forms WHERE processed = 0")
    unprocessed_forms = cursor.fetchone()['count']
    
    db.close()
    
    return render_template('dashboard.html', 
                           active_chats=active_chats,
                           unread_messages=unread_messages,
                           unprocessed_forms=unprocessed_forms)

@app.route('/admin/chats', methods=['GET'])
@login_required
def admin_chats():
    """Отобразить страницу со списком активных чатов"""
    return render_template('chats.html')

@app.route('/admin/chats_data', methods=['GET'])
@login_required
def admin_chats_data():
    """Получить список активных чатов в формате JSON"""
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_chats'))
    
    conn = get_db()
    chats = conn.execute('''
    SELECT c.*, 
           (SELECT COUNT(*) FROM chat_messages 
            WHERE chat_id = c.chat_id AND sender = 'user' AND is_read = 0) AS unread_count
    FROM chats c
    WHERE c.active = 1
    ORDER BY c.updated_at DESC
    ''').fetchall()
    
    chat_list = []
    for chat in chats:
        # Получаем последнее сообщение для каждого чата
        last_message = conn.execute('''
        SELECT message, sender, timestamp 
        FROM chat_messages 
        WHERE chat_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
        ''', (chat['chat_id'],)).fetchone()
        
        chat_info = {
            'chat_id': chat['chat_id'],
            'customer_name': chat['customer_name'],
            'customer_phone': chat['customer_phone'],
            'page_url': chat['page_url'],
            'created_at': chat['created_at'],
            'updated_at': chat['updated_at'],
            'unread_count': chat['unread_count'],
            'last_message': {
                'message': last_message['message'] if last_message else '',
                'sender': last_message['sender'] if last_message else '',
                'timestamp': last_message['timestamp'] if last_message else ''
            }
        }
        
        chat_list.append(chat_info)
    
    conn.close()
    
    return jsonify({'success': True, 'chats': chat_list})

@app.route('/admin/chat/<chat_id>')
@login_required
def admin_chat(chat_id):
    db = get_db()
    cursor = db.cursor()
    
    # Получаем информацию о чате
    cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return redirect(url_for('admin_chats'))
    
    # Отмечаем сообщения как прочитанные
    cursor.execute('''
    UPDATE chat_messages SET is_read = 1
    WHERE chat_id = ? AND sender = 'user' AND is_read = 0
    ''', (chat_id,))
    
    db.commit()
    db.close()
    
    return render_template('chat.html', chat=chat)

@app.route('/admin/chat_history/<chat_id>')
@login_required
def admin_chat_history(chat_id):
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_chat', chat_id=chat_id))
    
    db = get_db()
    cursor = db.cursor()
    
    # Получаем информацию о чате
    cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return jsonify({"success": False, "error": "Chat not found"})
    
    # Получаем сообщения чата
    cursor.execute('''
    SELECT * FROM chat_messages
    WHERE chat_id = ? ORDER BY timestamp ASC
    ''', (chat_id,))
    
    messages = cursor.fetchall()
    
    # Преобразуем сообщения в список словарей
    message_list = []
    for message in messages:
        message_dict = {
            'id': message['id'],
            'chat_id': message['chat_id'],
            'sender': message['sender'],
            'message': message['message'],
            'timestamp': message['timestamp'],
            'is_read': message['is_read']
        }
        message_list.append(message_dict)
    
    # Отмечаем сообщения как прочитанные
    cursor.execute('''
    UPDATE chat_messages SET is_read = 1
    WHERE chat_id = ? AND sender = 'user' AND is_read = 0
    ''', (chat_id,))
    
    db.commit()
    db.close()
    
    return jsonify({
        "success": True,
        "messages": message_list
    })

@app.route('/admin/new_messages_ajax_json')
@login_required
def admin_new_messages_ajax_json():
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_chats'))
    
    chat_id = request.args.get('chat_id')
    last_timestamp = request.args.get('last_timestamp')
    
    if not chat_id:
        return jsonify({'success': False, 'error': 'Не указан ID чата'})
    
    db = get_db()
    cursor = db.cursor()
    
    # Получаем новые сообщения
    if last_timestamp:
        cursor.execute('''
        SELECT * FROM chat_messages
        WHERE chat_id = ? AND timestamp > ?
        ORDER BY timestamp ASC
        ''', (chat_id, last_timestamp))
    else:
        cursor.execute('''
        SELECT * FROM chat_messages
        WHERE chat_id = ?
        ORDER BY timestamp ASC
        ''', (chat_id,))
    
    messages = cursor.fetchall()
    
    # Отмечаем сообщения как прочитанные
    cursor.execute('''
    UPDATE chat_messages SET is_read = 1
    WHERE chat_id = ? AND sender = 'user' AND is_read = 0
    ''', (chat_id,))
    
    db.commit()
    db.close()
    
    # Преобразуем сообщения в список словарей
    message_list = []
    for message in messages:
        message_dict = {
            'id': message['id'],
            'chat_id': message['chat_id'],
            'sender': message['sender'],
            'message': message['message'],
            'timestamp': message['timestamp'],
            'is_read': message['is_read']
        }
        message_list.append(message_dict)
    
    return jsonify({
        'success': True,
        'messages': message_list
    })

@app.route('/admin/close_chat', methods=['POST'])
@login_required
def admin_close_chat():
    """Закрытие чата оператором"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_chats'))
    
    try:
        data = request.get_json()
        
        if 'chat_id' not in data or not data['chat_id']:
            return jsonify({"success": False, "error": "Missing chat_id"})
        
        chat_id = data['chat_id']
        
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT chat_id FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            return jsonify({"success": False, "error": "Chat not found"})
        
        # Деактивируем чат
        cursor.execute('''
        UPDATE chats SET active = 0 WHERE chat_id = ?
        ''', (chat_id,))
        
        db.commit()
        db.close()
        
        return jsonify({
            "success": True
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/admin/send_message_ajax', methods=['POST'])
@login_required
def admin_send_message_ajax():
    chat_id = request.form.get('chat_id')
    message = request.form.get('message')
    
    if not chat_id or not message:
        return jsonify({'success': False, 'error': 'Не указан ID чата или сообщение'})
    
    timestamp = datetime.datetime.now().isoformat()
    
    db = get_db()
    cursor = db.cursor()
    
    # Проверяем, существует ли чат
    cursor.execute("SELECT id FROM chats WHERE chat_id = ?", (chat_id,))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return jsonify({'success': False, 'error': 'Чат не найден'})
    
    # Обновляем время последней активности
    cursor.execute("UPDATE chats SET last_activity = ? WHERE chat_id = ?", (timestamp, chat_id))
    
    # Добавляем сообщение в базу данных
    cursor.execute('''
    INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
    VALUES (?, 'operator', ?, ?, 1)
    ''', (chat_id, message, timestamp))
    
    db.commit()
    db.close()
    
    return jsonify({'success': True, 'timestamp': timestamp})

@app.route('/admin/new_messages_ajax')
@login_required
def admin_new_messages_ajax():
    chat_id = request.args.get('chat_id')
    last_timestamp = request.args.get('last_timestamp')
    
    if not chat_id:
        return jsonify({'success': False, 'error': 'Не указан ID чата'})
    
    db = get_db()
    cursor = db.cursor()
    
    # Получаем новые сообщения
    if last_timestamp:
        cursor.execute('''
        SELECT * FROM chat_messages
        WHERE chat_id = ? AND timestamp > ?
        ORDER BY timestamp ASC
        ''', (chat_id, last_timestamp))
    else:
        cursor.execute('''
        SELECT * FROM chat_messages
        WHERE chat_id = ?
        ORDER BY timestamp ASC
        ''', (chat_id,))
    
    messages = cursor.fetchall()
    
    # Отмечаем сообщения как прочитанные
    cursor.execute('''
    UPDATE chat_messages SET is_read = 1
    WHERE chat_id = ? AND sender = 'user' AND is_read = 0
    ''', (chat_id,))
    
    db.commit()
    db.close()
    
    # Преобразуем сообщения в список словарей
    message_list = []
    for message in messages:
        message_dict = {
            'id': message['id'],
            'chat_id': message['chat_id'],
            'sender': message['sender'],
            'message': message['message'],
            'timestamp': message['timestamp'],
            'is_read': message['is_read']
        }
        message_list.append(message_dict)
    
    return jsonify({
        'success': True,
        'messages': message_list
    })

@app.route('/admin/send_message', methods=['POST'])
@login_required
def admin_send_message():
    """Отправка сообщения оператором"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_chats'))
    
    try:
        data = request.get_json()
        
        if 'chat_id' not in data or not data['chat_id']:
            return jsonify({"success": False, "error": "Missing chat_id"})
        
        if 'message' not in data or not data['message']:
            return jsonify({"success": False, "error": "Missing message"})
        
        chat_id = data['chat_id']
        message = data['message']
        timestamp = datetime.now().isoformat()
        
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT chat_id FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            return jsonify({"success": False, "error": "Chat not found"})
        
        # Вставляем сообщение
        cursor.execute('''
        INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
        VALUES (?, ?, ?, ?, 1)
        ''', (chat_id, 'operator', message, timestamp))
        
        # Обновляем время последнего обновления чата
        cursor.execute('''
        UPDATE chats SET updated_at = ? WHERE chat_id = ?
        ''', (timestamp, chat_id))
        
        db.commit()
        db.close()
        
        return jsonify({
            "success": True,
            "timestamp": timestamp
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/admin/counters')
@login_required
def admin_counters():
    """Получить счетчики для админ-панели"""
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return redirect(url_for('admin_dashboard'))
    
    db = get_db()
    cursor = db.cursor()
    
    # Получаем количество активных чатов
    cursor.execute("SELECT COUNT(*) as count FROM chats WHERE active = 1")
    active_chats = cursor.fetchone()['count']
    
    # Получаем количество непрочитанных сообщений
    cursor.execute('''
    SELECT COUNT(*) as count FROM chat_messages 
    WHERE sender = 'user' AND is_read = 0
    ''')
    unread_messages = cursor.fetchone()['count']
    
    # Получаем количество необработанных форм
    cursor.execute("SELECT COUNT(*) as count FROM forms WHERE processed = 0")
    unprocessed_forms = cursor.fetchone()['count']
    
    db.close()
    
    return jsonify({
        "success": True,
        "active_chats": active_chats,
        "unread_messages": unread_messages,
        "unprocessed_forms": unprocessed_forms
    })

@app.route('/admin/forms')
@login_required
def admin_forms():
    db = get_db()
    cursor = db.cursor()
    
    # Получаем список форм
    cursor.execute('''
    SELECT * FROM forms
    ORDER BY processed ASC, created_at DESC
    ''')
    
    forms = cursor.fetchall()
    db.close()
    
    return render_template('forms.html', forms=forms)

@app.route('/admin/form/<int:form_id>')
@login_required
def admin_form(form_id):
    db = get_db()
    cursor = db.cursor()
    
    # Получаем информацию о форме
    cursor.execute("SELECT * FROM forms WHERE id = ?", (form_id,))
    form = cursor.fetchone()
    
    if not form:
        db.close()
        return redirect(url_for('admin_forms'))
    
    db.close()
    
    return render_template('form.html', form=form)

@app.route('/admin/process_form', methods=['POST'])
@login_required
def admin_process_form():
    form_id = request.form.get('form_id')
    status = request.form.get('status')
    comment = request.form.get('comment', '')
    
    if not form_id or not status:
        return redirect(url_for('admin_forms'))
    
    processed = 1 if status == 'processed' else 2  # 1 - обработано, 2 - отклонено
    operator_id = session.get('operator_id', '')
    timestamp = datetime.datetime.now().isoformat()
    
    db = get_db()
    cursor = db.cursor()
    
    # Обновляем статус формы
    cursor.execute('''
    UPDATE forms
    SET processed = ?, operator_id = ?, processed_at = ?, comment = ?
    WHERE id = ?
    ''', (processed, operator_id, timestamp, comment, form_id))
    
    db.commit()
    db.close()
    
    return redirect(url_for('admin_forms'))

@app.route('/admin_message', methods=['POST'])
def admin_message():
    """Отправить сообщение от оператора"""
    if not is_authenticated():
        return jsonify({'success': False, 'error': 'Unauthorized'})
    
    data = request.get_json()
    
    # Проверяем наличие обязательных параметров
    required_params = ['chat_id', 'message']
    for param in required_params:
        if param not in data:
            return jsonify({'success': False, 'error': f'Отсутствует параметр {param}'})
    
    # Получаем текущее время
    current_time = datetime.datetime.now().isoformat()
    
    # Добавляем сообщение в базу
    conn = get_db()
    conn.execute('''
    INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
    VALUES (?, ?, ?, ?, ?)
    ''', (data['chat_id'], 'operator', data['message'], current_time, 1))
    
    # Обновляем время активности чата
    conn.execute('''
    UPDATE chats 
    SET updated_at = ? 
    WHERE chat_id = ?
    ''', (current_time, data['chat_id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/start_chat', methods=['POST'])
def api_start_chat():
    """API метод для начала нового чата пользователем"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return jsonify({"success": False, "error": "Invalid request"})
    
    try:
        data = request.get_json()
        
        required_fields = ['name', 'phone', 'message', 'page_url']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"success": False, "error": f"Missing required field: {field}"})
        
        name = data['name']
        phone = data['phone']
        message = data['message']
        page_url = data['page_url']
        
        db = get_db()
        cursor = db.cursor()
        
        # Создаем уникальный ID для чата
        chat_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Вставляем чат
        cursor.execute('''
        INSERT INTO chats (chat_id, customer_name, customer_phone, page_url, created_at, updated_at, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ''', (chat_id, name, phone, page_url, timestamp, timestamp))
        
        # Вставляем сообщение
        cursor.execute('''
        INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
        VALUES (?, ?, ?, ?, 0)
        ''', (chat_id, 'user', message, timestamp))
        
        db.commit()
        db.close()
        
        return jsonify({
            "success": True,
            "chat_id": chat_id,
            "timestamp": timestamp
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/send_message', methods=['POST'])
def api_send_message():
    """API метод для отправки сообщения в чат"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return jsonify({"success": False, "error": "Invalid request"})
    
    try:
        data = request.get_json()
        
        if 'chat_id' not in data or not data['chat_id']:
            return jsonify({"success": False, "error": "Missing chat_id"})
        
        if 'message' not in data or not data['message']:
            return jsonify({"success": False, "error": "Missing message"})
        
        chat_id = data['chat_id']
        message = data['message']
        sender = data.get('sender', 'user')  # По умолчанию сообщение от пользователя
        timestamp = datetime.now().isoformat()
        
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT chat_id FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            return jsonify({"success": False, "error": "Chat not found"})
        
        # Вставляем сообщение
        cursor.execute('''
        INSERT INTO chat_messages (chat_id, sender, message, timestamp, is_read)
        VALUES (?, ?, ?, ?, ?)
        ''', (chat_id, sender, message, timestamp, 1 if sender == 'operator' else 0))
        
        # Обновляем время последнего обновления чата
        cursor.execute('''
        UPDATE chats SET updated_at = ? WHERE chat_id = ?
        ''', (timestamp, chat_id))
        
        db.commit()
        db.close()
        
        return jsonify({
            "success": True,
            "timestamp": timestamp
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/chat_history/<chat_id>', methods=['GET'])
def api_chat_history(chat_id):
    """API метод для получения истории чата"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return jsonify({"success": False, "error": "Invalid request"})
    
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT chat_id FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            return jsonify({"success": False, "error": "Chat not found"})
        
        # Получаем сообщения
        cursor.execute('''
        SELECT id, chat_id, sender, message, timestamp, is_read FROM chat_messages
        WHERE chat_id = ? ORDER BY timestamp ASC
        ''', (chat_id,))
        
        messages = cursor.fetchall()
        
        # Преобразуем сообщения в список словарей
        message_list = []
        for message in messages:
            message_dict = {
                'id': message['id'],
                'chat_id': message['chat_id'],
                'sender': message['sender'],
                'message': message['message'],
                'timestamp': message['timestamp'],
                'is_read': message['is_read']
            }
            message_list.append(message_dict)
        
        db.close()
        
        return jsonify({
            "success": True,
            "messages": message_list
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/check_new_messages', methods=['POST'])
def api_check_new_messages():
    """API метод для проверки новых сообщений"""
    # Проверяем, что это AJAX-запрос
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return jsonify({"success": False, "error": "Invalid request"})
    
    try:
        data = request.get_json()
        
        if 'chat_id' not in data or not data['chat_id']:
            return jsonify({"success": False, "error": "Missing chat_id"})
        
        chat_id = data['chat_id']
        last_timestamp = data.get('last_timestamp')
        
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT chat_id FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            return jsonify({"success": False, "error": "Chat not found"})
        
        # Получаем новые сообщения
        if last_timestamp:
            cursor.execute('''
            SELECT id, chat_id, sender, message, timestamp, is_read FROM chat_messages
            WHERE chat_id = ? AND timestamp > ?
            ORDER BY timestamp ASC
            ''', (chat_id, last_timestamp))
        else:
            cursor.execute('''
            SELECT id, chat_id, sender, message, timestamp, is_read FROM chat_messages
            WHERE chat_id = ?
            ORDER BY timestamp ASC LIMIT 50
            ''', (chat_id,))
        
        messages = cursor.fetchall()
        
        # Преобразуем сообщения в список словарей
        message_list = []
        for message in messages:
            message_dict = {
                'id': message['id'],
                'chat_id': message['chat_id'],
                'sender': message['sender'],
                'message': message['message'],
                'timestamp': message['timestamp'],
                'is_read': message['is_read']
            }
            message_list.append(message_dict)
        
        # Отмечаем сообщения как прочитанные, если они от оператора
        if message_list:
            cursor.execute('''
            UPDATE chat_messages SET is_read = 1
            WHERE chat_id = ? AND sender = 'operator' AND is_read = 0
            ''', (chat_id,))
            db.commit()
        
        db.close()
        
        # Отправляем ответ клиенту
        emit('check_new_messages_response', {
            'success': True,
            'messages': message_list
        }, room=request.sid)
        
    except Exception as e:
        logger.error(f"Ошибка при проверке новых сообщений: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('connect')
def handle_connect():
    logger.info(f"Клиент подключился: {request.sid}")
    emit('connect_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Клиент отключился: {request.sid}")

@socketio.on('join')
def on_join(data):
    """Присоединение к комнате чата"""
    chat_id = data.get('chat_id')
    if chat_id:
        join_room(chat_id)
        logger.info(f"Клиент {request.sid} присоединился к комнате {chat_id}")
        emit('chat_joined', {'chat_id': chat_id}, room=request.sid)

@socketio.on('leave')
def on_leave(data):
    """Покидание комнаты чата"""
    chat_id = data.get('chat_id')
    if chat_id:
        leave_room(chat_id)
        logger.info(f"Клиент {request.sid} покинул комнату {chat_id}")
        emit('chat_left', {'chat_id': chat_id}, room=request.sid)

@socketio.on('send_message')
def handle_message(data):
    try:
        # Проверяем наличие обязательных полей
        required_fields = ['chat_id', 'message', 'sender']
        for field in required_fields:
            if field not in data:
                emit('error', {'error': f'Отсутствует обязательное поле: {field}'}, room=request.sid)
                return
        
        chat_id = data['chat_id']
        message = data['message']
        sender = data['sender']
        timestamp = datetime.datetime.now().isoformat()
        
        # Сохраняем сообщение в базе данных
        conn = get_db()
        cursor = conn.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            emit('error', {'error': 'Чат не найден'}, room=request.sid)
            conn.close()
            return
        
        # Обновляем время последнего обновления чата
        cursor.execute("UPDATE chats SET updated_at = ? WHERE chat_id = ?", (timestamp, chat_id))
        
        # Сохраняем сообщение
        cursor.execute(
            "INSERT INTO chat_messages (chat_id, message, sender, timestamp) VALUES (?, ?, ?, ?)",
            (chat_id, message, sender, timestamp)
        )
        
        conn.commit()
        
        # Получаем информацию о сохраненном сообщении
        cursor.execute("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 1", (chat_id,))
        message_data = dict(cursor.fetchone())
        
        conn.close()
        
        # Отправляем сообщение всем в комнате чата
        emit('new_message', {
            'chat_id': chat_id,
            'message': message,
            'sender': sender,
            'timestamp': timestamp
        }, room=chat_id)
        
        # Оповещаем операторов о новом сообщении от пользователя
        if sender == 'user':
            emit('new_user_message', {
                'chat_id': chat_id,
                'customer_name': chat['customer_name'],
                'message': message
            }, broadcast=True)
        
        return {'success': True, 'timestamp': timestamp}
    except Exception as e:
        logger.error(f"Ошибка при отправке сообщения: {e}")
        emit('error', {'error': str(e)}, room=request.sid)
        return {'success': False, 'error': str(e)}

@socketio.on('load_chat_history')
def handle_load_chat_history(data):
    """Загружает историю чата"""
    try:
        # Проверяем наличие обязательных полей
        if 'chat_id' not in data:
            emit('error', {'error': 'Отсутствует обязательное поле: chat_id'}, room=request.sid)
            return
            
        chat_id = data['chat_id']
        
        # Подключаемся к БД
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            emit('error', {'error': 'Чат не найден'}, room=request.sid)
            return
            
        # Получаем историю сообщений
        cursor.execute('''
        SELECT id, chat_id, sender, message, timestamp, is_read 
        FROM chat_messages 
        WHERE chat_id = ? 
        ORDER BY timestamp ASC
        ''', (chat_id,))
        
        messages = cursor.fetchall()
        
        # Преобразуем сообщения в список словарей
        message_list = []
        for message in messages:
            message_dict = {
                'id': message['id'],
                'chat_id': message['chat_id'],
                'sender': message['sender'],
                'message': message['message'],
                'timestamp': message['timestamp'],
                'is_read': message['is_read']
            }
            message_list.append(message_dict)
            
        # Если отправитель запроса - оператор, отмечаем сообщения пользователя как прочитанные
        if is_operator(request.sid):
            cursor.execute('''
            UPDATE chat_messages 
            SET is_read = 1 
            WHERE chat_id = ? AND sender = 'user' AND is_read = 0
            ''', (chat_id,))
            db.commit()
            
        db.close()
        
        # Отправляем историю чата
        emit('chat_history', {
            'success': True,
            'chat': {
                'chat_id': chat['chat_id'],
                'user_name': chat['customer_name'],
                'user_phone': chat['customer_phone'],
                'status': chat['active'],
                'created_at': chat['created_at']
            },
            'messages': message_list
        }, room=request.sid)
        
        # Обновляем счетчики для всех пользователей
        socketio.emit('update_counters')
        
    except Exception as e:
        logger.error(f"Ошибка при загрузке истории чата: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('get_chats')
def handle_get_chats():
    """Получение списка активных чатов через WebSocket"""
    if not is_authenticated():
        emit('error', {'error': 'Authentication required'}, room=request.sid)
        return
    
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Получаем список активных чатов
        cursor.execute('''
            SELECT c.*, 
                   (SELECT COUNT(*) FROM chat_messages 
                    WHERE chat_id = c.chat_id AND sender = 'user' AND is_read = 0) AS unread_count
            FROM chats c
            WHERE c.active = 1
            ORDER BY c.updated_at DESC
        ''')
        
        chats_db = cursor.fetchall()
        chats = [dict(chat) for chat in chats_db]
        
        db.close()
        
        # Отправляем список чатов
        emit('chats_list', {'chats': chats}, room=request.sid)
        
        logger.info(f"Список чатов отправлен оператору {session.get('username')}")
    except Exception as e:
        logger.error(f"Ошибка при получении списка чатов: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('close_chat')
def handle_close_chat(data):
    """Закрытие чата через WebSocket"""
    if not is_authenticated():
        emit('error', {'error': 'Authentication required'}, room=request.sid)
        return
    
    chat_id = data.get('chat_id')
    
    if not chat_id:
        emit('error', {'error': 'Missing chat_id'}, room=request.sid)
        return
    
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            emit('error', {'error': 'Chat not found'}, room=request.sid)
            return
        
        # Закрываем чат
        cursor.execute('''
        UPDATE chats SET active = 0, closed_at = datetime('now') 
        WHERE chat_id = ?
        ''', (chat_id,))
        
        db.commit()
        db.close()
        
        # Отправляем событие закрытия чата всем участникам
        emit('chat_closed', {'chat_id': chat_id}, room=chat_id)
        emit('chat_updated', {'chat_id': chat_id, 'status': 'closed'}, broadcast=True)
        
        # Закрываем комнату чата
        close_room(chat_id)
        
        logger.info(f"Чат {chat_id} закрыт оператором {session.get('username')}")
    except Exception as e:
        logger.error(f"Ошибка при закрытии чата: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('get_counters')
def handle_get_counters():
    """Получение счетчиков через WebSocket"""
    if not is_authenticated():
        emit('error', {'error': 'Authentication required'}, room=request.sid)
        return
        
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Получаем количество активных чатов
        cursor.execute("SELECT COUNT(*) as count FROM chats WHERE active = 1")
        active_chats = cursor.fetchone()['count']
        
        # Получаем количество непрочитанных сообщений
        cursor.execute('''
            SELECT COUNT(*) as count FROM chat_messages 
            WHERE sender = 'user' AND is_read = 0
        ''')
        unread_messages = cursor.fetchone()['count']
        
        # Получаем количество необработанных форм
        cursor.execute("SELECT COUNT(*) as count FROM forms WHERE processed = 0")
        unprocessed_forms = cursor.fetchone()['count']
        
        db.close()
        
        # Отправляем счетчики
        emit('counters', {
            'active_chats': active_chats,
            'unread_messages': unread_messages,
            'unprocessed_forms': unprocessed_forms
        }, room=request.sid)
        
        logger.info(f"Счетчики отправлены оператору {session.get('username')}")
    except Exception as e:
        logger.error(f"Ошибка при получении счетчиков: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('start_chat')
def handle_start_chat(data):
    try:
        required_fields = ['name', 'phone', 'page_url']
        for field in required_fields:
            if field not in data:
                emit('error', {'error': f'Отсутствует обязательное поле: {field}'}, room=request.sid)
                return
        
        name = data['name']
        phone = data['phone']
        page_url = data['page_url']
        site_id = data.get('site_id', request.host)
        
        # Генерируем уникальный ID для чата
        chat_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now().isoformat()
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Создаем новый чат с временем создания
        cursor.execute(
            "INSERT INTO chats (chat_id, customer_name, customer_phone, page_url, site_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (chat_id, name, phone, page_url, site_id, timestamp, timestamp)
        )
        
        # Добавляем системное сообщение о начале чата
        cursor.execute(
            "INSERT INTO chat_messages (chat_id, message, sender, timestamp) VALUES (?, ?, ?, ?)",
            (chat_id, f"Чат начат с пользователем {name}", 'system', timestamp)
        )
        
        conn.commit()
        
        # Получаем информацию о созданных сообщениях
        cursor.execute("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY timestamp ASC", (chat_id,))
        messages = cursor.fetchall()
        
        conn.close()
        
        # Присоединяем клиента к комнате чата
        join_room(chat_id)
        
        # Отправляем подтверждение создания чата
        emit('chat_started', {
            'success': True,
            'chat_id': chat_id,
            'timestamp': timestamp,
            'messages': [dict(msg) for msg in messages]
        }, room=request.sid)
        
        # Оповещаем всех операторов о новом чате
        emit('chat_updated', {'chat_id': chat_id}, broadcast=True)
        
        logger.info(f"Создан новый чат {chat_id} от пользователя {name}")
    except Exception as e:
        logger.error(f"Ошибка при создании чата: {e}")
        emit('error', {'error': str(e)}, room=request.sid)
        emit('chat_started', {'success': False, 'error': str(e)}, room=request.sid)

@socketio.on('submit_form')
def handle_form_submission(data):
    """Обработчик отправки форм с сайта"""
    try:
        # Проверяем наличие необходимых полей
        required_fields = ['name', 'tel']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            logger.warning(f"Отсутствуют обязательные поля в форме: {missing_fields}")
            # Проверим альтернативные названия полей (например, phone вместо tel)
            if 'tel' in missing_fields and ('phone' in data or 'telephone' in data):
                data['tel'] = data.get('phone', data.get('telephone', ''))
                missing_fields.remove('tel')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Сериализуем данные формы в JSON
        form_data_json = json.dumps(data)
        
        # Получаем URL страницы и ID сайта из данных
        page_url = data.get('page_url', 'unknown')
        site_id = data.get('site_id', request.host)
        
        # Определяем тип формы на основе информации из данных
        form_name = data.get('form_name', 'Форма заказа')
        
        # Выводим данные формы для отладки
        logger.info(f"Получены данные формы {form_name}: {data}")
        
        # Сохраняем форму в базе данных
        cursor.execute(
            "INSERT INTO forms (form_data, page_url, site_id, form_name) VALUES (?, ?, ?, ?)",
            (form_data_json, page_url, site_id, form_name)
        )
        
        form_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Отправляем подтверждение отправки формы
        emit('form_submitted', {
            'success': True,
            'form_id': form_id,
            'message': 'Форма успешно отправлена'
        }, room=request.sid)
        
        # Оповещаем всех операторов о новой форме
        emit('new_form', {
            'form_id': form_id,
            'page_url': page_url,
            'form_name': form_name,
            'customer_name': data.get('name', ''),
            'customer_phone': data.get('tel', '')
        }, broadcast=True)
        
        # Обновляем счетчики
        socketio.emit('update_counters')
        
        logger.info(f"Получена новая форма #{form_id} '{form_name}' с {site_id}, страница: {page_url}")
        return {'success': True, 'form_id': form_id}
    except Exception as e:
        logger.error(f"Ошибка при обработке формы: {e}")
        emit('form_submitted', {'success': False, 'error': str(e)}, room=request.sid)
        return {'success': False, 'error': str(e)}

@socketio.on('check_new_messages')
def handle_check_new_messages(data):
    """Проверка новых сообщений через WebSocket"""
    try:
        # Проверяем наличие обязательных полей
        if 'chat_id' not in data:
            emit('error', {'error': 'Отсутствует обязательное поле: chat_id'}, room=request.sid)
            return
        
        chat_id = data['chat_id']
        last_timestamp = data.get('last_timestamp')
        
        # Получаем новые сообщения из базы данных
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем существование чата
        cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            db.close()
            emit('error', {'error': 'Чат не найден'}, room=request.sid)
            return
        
        # Получаем новые сообщения
        if last_timestamp:
            cursor.execute('''
            SELECT id, chat_id, sender, message, timestamp, is_read FROM chat_messages
            WHERE chat_id = ? AND timestamp > ?
            ORDER BY timestamp ASC
            ''', (chat_id, last_timestamp))
        else:
            cursor.execute('''
            SELECT id, chat_id, sender, message, timestamp, is_read FROM chat_messages
            WHERE chat_id = ?
            ORDER BY timestamp ASC LIMIT 50
            ''', (chat_id,))
        
        messages = cursor.fetchall()
        
        # Преобразуем сообщения в список словарей
        message_list = []
        for message in messages:
            message_dict = {
                'id': message['id'],
                'chat_id': message['chat_id'],
                'sender': message['sender'],
                'message': message['message'],
                'timestamp': message['timestamp'],
                'is_read': message['is_read']
            }
            message_list.append(message_dict)
        
        # Отмечаем сообщения как прочитанные, если они от оператора
        if message_list:
            cursor.execute('''
            UPDATE chat_messages SET is_read = 1
            WHERE chat_id = ? AND sender = 'operator' AND is_read = 0
            ''', (chat_id,))
            db.commit()
        
        db.close()
        
        # Отправляем ответ клиенту
        emit('check_new_messages_response', {
            'success': True,
            'messages': message_list
        }, room=request.sid)
        
    except Exception as e:
        logger.error(f"Ошибка при проверке новых сообщений: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

@socketio.on('mark_messages_read')
def handle_mark_messages_read(data):
    """Отмечает указанные сообщения как прочитанные"""
    try:
        # Проверяем наличие обязательных полей
        if 'chat_id' not in data:
            emit('error', {'error': 'Отсутствует обязательное поле: chat_id'}, room=request.sid)
            return
            
        chat_id = data['chat_id']
        message_ids = data.get('message_ids', [])
        
        if not message_ids:
            return
            
        # Подключаемся к БД
        db = get_db()
        cursor = db.cursor()
        
        # Обновляем статус сообщений
        placeholders = ','.join(['?' for _ in message_ids])
        cursor.execute(f'''
        UPDATE chat_messages 
        SET is_read = 1 
        WHERE id IN ({placeholders})
        ''', message_ids)
        
        db.commit()
        db.close()
        
        # Обновляем счетчики для всех пользователей
        socketio.emit('update_counters')
        
        logger.info(f"Сообщения {message_ids} отмечены как прочитанные")
    except Exception as e:
        logger.error(f"Ошибка при обновлении статуса сообщений: {e}")
        emit('error', {'error': str(e)}, room=request.sid)

# Вспомогательная функция для проверки, является ли пользователь оператором
def is_operator(sid):
    """Проверяет, является ли сессия сессией оператора"""
    try:
        if not sid or 'session' not in request.cookies:
            return False
            
        session_id = request.cookies.get('session')
        
        # Подключаемся к БД
        db = get_db()
        cursor = db.cursor()
        
        # Проверяем наличие сессии оператора
        cursor.execute('''
        SELECT o.id 
        FROM operators o 
        JOIN operator_sessions os ON o.id = os.operator_id 
        WHERE os.session_id = ?
        ''', (session_id,))
        
        result = cursor.fetchone()
        db.close()
        
        return result is not None
    except Exception as e:
        logger.error(f"Ошибка при проверке статуса оператора: {e}")
        return False

# Маршруты Flask для веб-интерфейса
@app.route('/')
def index():
    return render_template('index.html')

# Добавляем фильтр для преобразования JSON в объекты Python
@app.template_filter('fromjson')
def fromjson_filter(value):
    """Конвертирует строку JSON в объект Python"""
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return {}

# Добавляем конечную точку для HTTP-опроса сообщений (для хостингов без WebSocket)
@app.route('/chat/poll_messages', methods=['GET'])
def poll_messages():
    chat_id = request.args.get('chat_id')
    last_time = request.args.get('last_time')
    
    if not chat_id:
        return jsonify({'success': False, 'error': "Missing required parameter: chat_id"})
    
    db = get_db()
    cursor = db.cursor()
    
    # Проверяем существование чата
    cursor.execute("SELECT * FROM chats WHERE chat_id = ?", (chat_id,))
    chat = cursor.fetchone()
    
    if not chat:
        db.close()
        return jsonify({'success': False, 'error': "Chat not found"})
    
    # Обновляем время последней активности
    timestamp = datetime.datetime.now().isoformat()
    cursor.execute('''
    UPDATE chats SET updated_at = ?
    WHERE chat_id = ?
    ''', (timestamp, chat_id))
    db.commit()
    
    # Получаем новые сообщения из базы данных
    query = '''
    SELECT id, chat_id, sender, message, timestamp
    FROM chat_messages
    WHERE chat_id = ?
    '''
    params = [chat_id]
    
    if last_time and last_time != '0':
        query += ' AND timestamp > ?'
        params.append(last_time)
    
    query += ' ORDER BY timestamp ASC'
    
    cursor.execute(query, params)
    messages = cursor.fetchall()
    
    # Форматируем сообщения для ответа
    message_list = []
    for msg in messages:
        message_list.append({
            'id': msg['id'],
            'chat_id': msg['chat_id'],
            'sender': msg['sender'],
            'message': msg['message'],
            'timestamp': msg['timestamp']
        })
    
    # Помечаем сообщения как прочитанные, если они от оператора
    cursor.execute('''
    UPDATE chat_messages
    SET is_read = 1
    WHERE chat_id = ? AND sender = 'operator' AND is_read = 0
    ''', (chat_id,))
    db.commit()
    
    db.close()
    
    return jsonify({
        'success': True,
        'messages': message_list,
        'chat_id': chat_id
    })

if __name__ == '__main__':
    # Инициализируем базу данных
    init_db()
    
    # Проверка, запущен ли скрипт через WSGI или напрямую
    if os.environ.get('WSGI_ENV') == 'production':
        # В production среде будет использоваться WSGI сервер хостинга
        pass
    else:
        # Для локальной разработки
        socketio.run(app, debug=True, host='0.0.0.0', port=5000)

# Для запуска через WSGI на хостинге
application = app 