#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Скрипт для очистки базы данных чата
"""

import os
import sqlite3
import shutil
import hashlib
import datetime
import sys

# Конфигурация
DB_NAME = "chat_db.sqlite"
BACKUP_DIR = "backups"

def get_db_path():
    """Получает полный путь к файлу базы данных"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, DB_NAME)

def create_backup():
    """Создает резервную копию базы данных"""
    db_path = get_db_path()
    
    if not os.path.exists(db_path):
        print("База данных не найдена, создание новой")
        return False
    
    # Создаем директорию для резервных копий, если её нет
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backup_dir = os.path.join(script_dir, BACKUP_DIR)
    
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    # Генерируем имя файла резервной копии
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join(backup_dir, f"backup_{timestamp}_{DB_NAME}")
    
    try:
        # Копируем файл
        shutil.copy2(db_path, backup_file)
        print(f"Создана резервная копия: {backup_file}")
        return True
    except Exception as e:
        print(f"Ошибка при создании резервной копии: {e}")
        return False

def init_database():
    """Инициализирует базу данных с новой структурой"""
    db_path = get_db_path()
    conn = None
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Удаляем существующие таблицы, если они есть
        cursor.execute("DROP TABLE IF EXISTS chats")
        cursor.execute("DROP TABLE IF EXISTS chat_messages")
        cursor.execute("DROP TABLE IF EXISTS form_submissions")
        cursor.execute("DROP TABLE IF EXISTS operators")
        
        # Создаем таблицы
        
        # Таблица чатов
        cursor.execute('''
        CREATE TABLE chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            page_url TEXT,
            ip_address TEXT,
            user_agent TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            operator_id INTEGER DEFAULT NULL,
            closed_at TIMESTAMP DEFAULT NULL
        )
        ''')
        
        # Таблица сообщений чатов
        cursor.execute('''
        CREATE TABLE chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            sender TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
        )
        ''')
        
        # Таблица форм
        cursor.execute('''
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
        
        # Таблица операторов
        cursor.execute('''
        CREATE TABLE operators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'operator',
            last_login TIMESTAMP DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Создаем индексы для оптимизации запросов
        cursor.execute("CREATE INDEX idx_chats_status ON chats (status)")
        cursor.execute("CREATE INDEX idx_chat_messages_chat_id ON chat_messages (chat_id)")
        cursor.execute("CREATE INDEX idx_chat_messages_read ON chat_messages (read)")
        cursor.execute("CREATE INDEX idx_form_submissions_status ON form_submissions (status)")
        
        # Создаем администратора
        admin_password = hashlib.sha256("admin123".encode()).hexdigest()
        cursor.execute(
            "INSERT INTO operators (username, password, name, role) VALUES (?, ?, ?, ?)",
            ("admin", admin_password, "Администратор", "admin")
        )
        
        conn.commit()
        print("База данных успешно инициализирована")
        return True
        
    except Exception as e:
        print(f"Ошибка при инициализации базы данных: {e}")
        if conn:
            conn.rollback()
        return False
        
    finally:
        if conn:
            conn.close()

def reset_database():
    """Сбрасывает базу данных к исходному состоянию"""
    if os.path.exists(get_db_path()):
        create_backup()
    
    print("\nВсе данные будут удалены. Операторы будут сохранены.")
    confirm = input("Вы уверены, что хотите очистить базу данных? (y/n): ")
    
    if confirm.lower() != 'y':
        print("Операция отменена")
        return
    
    if init_database():
        print("\nБаза данных успешно очищена!")
        print("\nДанные для входа в админ-панель:")
        print("Имя пользователя: admin")
        print("Пароль: admin123")
    else:
        print("\nПроизошла ошибка при очистке базы данных")

if __name__ == "__main__":
    print("=== Утилита очистки базы данных чата ===")
    
    if len(sys.argv) > 1 and sys.argv[1] == "--force":
        # Принудительный сброс без подтверждения
        if os.path.exists(get_db_path()):
            create_backup()
        init_database()
        print("\nБаза данных успешно очищена!")
        print("\nДанные для входа в админ-панель:")
        print("Имя пользователя: admin")
        print("Пароль: admin123")
    else:
        reset_database() 