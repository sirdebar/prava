/**
 * Виджет чата для сайта
 * Позволяет посетителям общаться с оператором в режиме реального времени
 */
(function() {
    // Уникальный идентификатор сессии чата
    let chatId = '';
    let siteId = window.location.hostname;
    
    // Получаем настройки из конфигурации или используем значения по умолчанию
    const config = window.CHAT_CONFIG || {
        API_URL: 'https://prava-online-shop.ru',
        CHAT_ENDPOINT: '/chat',
        WEBSOCKET_URL: 'https://prava-online-shop.ru',
        DEBUG: false
    };
    
    let apiUrl = config.API_URL + config.CHAT_ENDPOINT;
    let msgs = [];
    let unreadCount = 0;
    let isMinimized = true;
    let customerName = '';
    let customerPhone = '';
    let intervalId = null;
    let lastMessageTimestamp = null;
    let isOpen = false;
    
    // Создаем переменную для WebSocket и инициализируем подключение
    let socket = null;
    
    // Загрузка и инициализация Socket.IO
    function loadSocketIO() {
        return new Promise((resolve, reject) => {
            if (window.io) {
                // Если Socket.IO уже загружен
                initializeSocket();
                resolve();
                return;
            }
            
            // Если не загружен, добавляем скрипт
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.2/socket.io.min.js';
            script.async = true;
            
            script.onload = function() {
                initializeSocket();
                resolve();
            };
            
            script.onerror = function(error) {
                console.error('Ошибка загрузки Socket.IO:', error);
                reject(error);
            };
            
            document.head.appendChild(script);
        });
    }
    
    // Инициализация Socket.IO
    function initializeSocket() {
        if (socket) return; // Уже инициализирован
        
        socket = io(config.WEBSOCKET_URL);
        
        socket.on('connect', function() {
            console.log('Соединение с сервером установлено');
            
            // Если есть сохраненный ID чата, присоединяемся к комнате
            if (chatId) {
                socket.emit('join', { chat_id: chatId });
            }
        });
        
        socket.on('disconnect', function() {
            console.log('Соединение с сервером разорвано');
        });
        
        socket.on('error', function(error) {
            console.error('Ошибка WebSocket:', error);
        });
        
        // Обработчик истории чата
        socket.on('chat_history', function(data) {
            if (data.chat && data.chat.chat_id === chatId) {
                const messagesContainer = document.getElementById('chat-widget-messages');
                if (!messagesContainer) return;
                
                // Очищаем контейнер сообщений
                messagesContainer.innerHTML = '';
                
                // Добавляем сообщения
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(message => {
                        appendMessage(message.sender, message.message, message.timestamp);
                    });
                    
                    // Прокручиваем к последнему сообщению
                    scrollToBottom();
                    
                    // Устанавливаем lastMessageTimestamp
                    if (data.messages.length > 0) {
                        lastMessageTimestamp = data.messages[data.messages.length - 1].timestamp;
                    }
                }
            }
        });
        
        // Обработчик нового сообщения
        socket.on('new_message', function(data) {
            if (data.chat_id === chatId) {
                appendMessage(data.sender, data.message, data.timestamp);
                scrollToBottom();
                
                // Обновляем timestamp последнего сообщения
                if (data.timestamp) {
                    lastMessageTimestamp = data.timestamp;
                }
            }
        });
        
        // Обработчик ответа на проверку новых сообщений
        socket.on('check_new_messages_response', function(data) {
            if (data.success && data.messages && data.messages.length > 0) {
                // Добавляем новые сообщения
                data.messages.forEach(message => {
                    appendMessage(message.sender, message.message, message.timestamp);
                });
                
                // Прокручиваем к последнему сообщению
                scrollToBottom();
                
                // Обновляем timestamp последнего сообщения
                if (data.messages.length > 0) {
                    lastMessageTimestamp = data.messages[data.messages.length - 1].timestamp;
                }
            }
        });
        
        // Обработчик отключения от комнаты
        socket.on('chat_left', function(data) {
            if (data.chat_id === chatId) {
                // Очищаем состояние чата
                chatId = '';
                customerName = '';
                customerPhone = '';
                
                // Останавливаем проверку новых сообщений
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                
                // Показываем форму для нового чата
                const userInfoEl = document.querySelector('.chat-widget-user-info');
                const messageInputEl = document.querySelector('.chat-widget-message-input');
                
                if (userInfoEl) userInfoEl.style.display = 'block';
                if (messageInputEl) messageInputEl.style.display = 'none';
                
                // Сворачиваем чат
                closeChat();
            }
        });
        
        // Обработчик закрытия чата
        socket.on('chat_closed', function(data) {
            if (data.chat_id === chatId) {
                // Показываем уведомление о закрытии чата
                const messagesContainer = document.getElementById('chat-widget-messages');
                const systemMessage = document.createElement('div');
                systemMessage.className = 'chat-message chat-message-system';
                systemMessage.innerHTML = `
                    <div class="message-content">
                        <div class="message-text">Чат был закрыт оператором</div>
                        <div class="message-time">${formatTime(new Date())}</div>
                    </div>
                `;
                messagesContainer.appendChild(systemMessage);
                scrollToBottom();
                
                // Отключаемся от комнаты чата
                socket.emit('leave', { chat_id: chatId });
                
                // Очищаем данные сессии
                localStorage.removeItem('chatId');
                localStorage.removeItem('customerName');
                localStorage.removeItem('customerPhone');
                
                // Сбрасываем состояние чата
                chatId = '';
                customerName = '';
                customerPhone = '';
                
                // Останавливаем проверку новых сообщений
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                
                // Показываем форму для нового чата
                const userInfoEl = document.querySelector('.chat-widget-user-info');
                const messageInputEl = document.querySelector('.chat-widget-message-input');
                
                if (userInfoEl) userInfoEl.style.display = 'block';
                if (messageInputEl) messageInputEl.style.display = 'none';
                
                // Сворачиваем чат
                closeChat();
            }
        });
    }
    
    // Добавляем стили немедленно
    const chatStyles = `
        <style id="chat-widget-styles">
            .chat-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                font-family: Arial, sans-serif;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                border-radius: 10px;
                overflow: hidden;
                background: #fff;
                width: 320px;
                transition: all 0.3s ease;
            }
            .chat-widget-closed {
                width: 70px;
                height: 70px;
            }
            .chat-widget-header {
                background: #23B684;
                color: white;
                padding: 10px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chat-widget-title {
                font-weight: bold;
            }
            .chat-widget-controls span {
                cursor: pointer;
                margin-left: 10px;
                font-size: 16px;
            }
            .chat-widget-body {
                height: 320px;
                display: flex;
                flex-direction: column;
            }
            .chat-widget-messages {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
                background: #f8f8f8;
            }
            .chat-widget-input-container {
                padding: 10px;
                border-top: 1px solid #eee;
                display: flex;
                gap: 10px;
                align-items: flex-start;
            }
            .chat-widget-input {
                flex: 1;
                resize: none;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 8px;
                height: 40px;
                min-height: 40px;
                max-height: 120px;
            }
            .chat-widget-send-btn, .chat-widget-start-btn {
                background: #23B684;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 8px 15px;
                cursor: pointer;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .chat-widget-button {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 70px;
                height: 70px;
                background: #23B684;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                color: white;
                font-size: 28px;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(35, 182, 132, 0.7);
                }
                70% {
                    box-shadow: 0 0 0 10px rgba(35, 182, 132, 0);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(35, 182, 132, 0);
                }
            }
            .chat-widget-unread-count {
                position: absolute;
                top: 0;
                right: 0;
                background: red;
                color: white;
                font-size: 14px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .chat-message {
                margin-bottom: 10px;
                max-width: 80%;
            }
            .chat-message-user {
                margin-left: auto;
            }
            .chat-message-operator {
                margin-right: auto;
            }
            .message-content {
                padding: 8px 12px;
                border-radius: 12px;
                position: relative;
            }
            .chat-message-user .message-content {
                background: #23B684;
                color: white;
                border-bottom-right-radius: 4px;
            }
            .chat-message-operator .message-content {
                background: #f1f1f1;
                color: #333;
                border-bottom-left-radius: 4px;
            }
            .message-text {
                margin-bottom: 4px;
                word-wrap: break-word;
            }
            .message-time {
                font-size: 11px;
                opacity: 0.7;
                text-align: right;
                margin-top: 4px;
            }
            .chat-message-user .message-time {
                color: rgba(255, 255, 255, 0.8);
            }
            .chat-message-operator .message-time {
                color: rgba(0, 0, 0, 0.5);
            }
            .chat-widget-name, .chat-widget-phone {
                width: 100%;
                padding: 8px;
                margin-bottom: 5px;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
            .chat-message-system {
                background: #f8f9fa;
                color: #6c757d;
                text-align: center;
                max-width: 100%;
                margin: 10px auto;
                border: 1px dashed #dee2e6;
                border-radius: 8px;
            }
            .chat-closed-message {
                text-align: center;
                color: #6c757d;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px dashed #dee2e6;
                margin: 10px 0;
            }
            .chat-closed-message::before {
                content: "⚠️";
                margin-right: 8px;
                font-size: 16px;
            }
        </style>
    `;
    
    // Добавляем стили сразу в head
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head) {
        const styleElement = document.createElement('style');
        styleElement.type = 'text/css';
        styleElement.id = 'chat-widget-styles';
        if (styleElement.styleSheet) {
            styleElement.styleSheet.cssText = chatStyles;
        } else {
            styleElement.appendChild(document.createTextNode(chatStyles));
        }
        head.appendChild(styleElement);
    }
    
    // Создаем структуру виджета чата
    const chatHtml = `
        <div id="support-chat-widget" class="chat-widget chat-widget-closed">
            <div class="chat-widget-header" style="display: none;">
                <div class="chat-widget-title">Чат с оператором</div>
                <div class="chat-widget-controls">
                    <span class="chat-widget-minimize"><i class="fas fa-minus"></i></span>
                    <span class="chat-widget-close"><i class="fas fa-times"></i></span>
                </div>
            </div>
            <div class="chat-widget-body" style="display: none;">
                <div class="chat-widget-messages"></div>
                <div class="chat-widget-input-container">
                    <div class="chat-widget-user-info" style="display: none;">
                        <form class="chat-start-form" data-no-intercept>
                            <input type="text" class="chat-widget-name" placeholder="Ваше имя">
                            <input type="text" class="chat-widget-phone" placeholder="Ваш телефон">
                            <button type="button" class="chat-widget-start-btn">Начать чат</button>
                        </form>
                    </div>
                    <div class="chat-widget-message-input" style="display: none;">
                        <form class="chat-message-form" data-no-intercept>
                            <textarea class="chat-widget-input" placeholder="Введите сообщение..."></textarea>
                            <button type="button" class="chat-widget-send-btn"><i class="fas fa-paper-plane"></i></button>
                        </form>
                    </div>
                </div>
            </div>
            <div class="chat-widget-button">
                <div class="chat-widget-button-icon">
                    <i class="fas fa-comments"></i>
                    <span class="chat-widget-unread-count" style="display: none;">0</span>
                </div>
            </div>
        </div>
    `;
    
    // Создаем и добавляем виджет чата сразу после загрузки скрипта
    const addWidgetToPage = function() {
        // Если виджет уже добавлен, не добавляем его снова
        if (document.getElementById('support-chat-widget')) {
            return;
        }
        
        // Проверяем наличие контейнера
        const container = document.getElementById('support-chat-widget-container');
        if (container) {
            // Если есть контейнер, добавляем в него
            container.innerHTML = chatHtml;
        } else {
            // Иначе добавляем в body
            // Проверяем наличие body
            if (!document.body) {
                // Если body ещё нет, добавляем виджет через document.write
                document.write(chatHtml);
            } else {
                const chatDiv = document.createElement('div');
                chatDiv.innerHTML = chatHtml;
                document.body.appendChild(chatDiv.firstChild);
            }
        }
        
        // Загружаем Socket.IO и инициализируем подключение
        loadSocketIO()
            .then(() => {
                // После загрузки Socket.IO инициализируем события
                initEvents();
                
                // Проверяем наличие существующей сессии в localStorage
                checkExistingSession();
                
                console.log('Чат-виджет успешно инициализирован');
            })
            .catch(error => {
                console.error('Не удалось инициализировать Socket.IO:', error);
            });
    };
    
    // Проверка существующей сессии
    function checkExistingSession() {
        const storedChatId = localStorage.getItem('chatId');
        const storedName = localStorage.getItem('customerName');
        const storedPhone = localStorage.getItem('customerPhone');
        
        if (storedChatId && storedName && storedPhone) {
            chatId = storedChatId;
            customerName = storedName;
            customerPhone = storedPhone;
            
            // Показываем интерфейс ввода сообщений вместо формы с именем и телефоном
            const userInfoEl = document.querySelector('.chat-widget-user-info');
            const messageInputEl = document.querySelector('.chat-widget-message-input');
            
            if (userInfoEl) userInfoEl.style.display = 'none';
            if (messageInputEl) messageInputEl.style.display = 'block';
            
            // Загружаем историю сообщений
            loadChatHistory();
        } else {
            // Показываем форму для ввода имени и телефона
            const userInfoEl = document.querySelector('.chat-widget-user-info');
            if (userInfoEl) userInfoEl.style.display = 'block';
        }
    }
    
    // Инициализация событий
    function initEvents() {
        // Открытие/закрытие виджета
        const buttonEl = document.querySelector('.chat-widget-button');
        if (buttonEl) {
            buttonEl.addEventListener('click', openChat);
        }
        
        // Закрытие виджета
        const closeEl = document.querySelector('.chat-widget-close');
        if (closeEl) {
            closeEl.addEventListener('click', closeChat);
        }
        
        // Начало чата (после ввода имени и телефона)
        const startBtnEl = document.querySelector('.chat-widget-start-btn');
        if (startBtnEl) {
            startBtnEl.addEventListener('click', startChat);
        }
        
        // Отправка сообщения
        const sendBtnEl = document.querySelector('.chat-widget-send-btn');
        if (sendBtnEl) {
            sendBtnEl.addEventListener('click', function(event) {
                // Передаем событие для предотвращения дефолтного поведения
                sendMessage(event);
            });
        }
        
        // Отправка сообщения по Enter (но Shift+Enter добавляет перенос строки)
        const inputEl = document.querySelector('.chat-widget-input');
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if(e.keyCode === 13 && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                    return false;
                }
            });
        }
        
        // Проверка новых сообщений каждые 5 секунд
        if (intervalId === null) {
            intervalId = setInterval(() => {
                if (chatId) {
                    checkNewMessages();
                }
            }, 5000);
        }
    }
    
    // Открытие чата
    function openChat() {
        isMinimized = false;
        document.getElementById('support-chat-widget').classList.remove('chat-widget-closed');
        document.querySelector('.chat-widget-header').style.display = 'flex';
        document.querySelector('.chat-widget-body').style.display = 'flex';
        document.querySelector('.chat-widget-button').style.display = 'none';
        
        // Показываем соответствующий интерфейс
        if (!chatId) {
            document.querySelector('.chat-widget-user-info').style.display = 'block';
            document.querySelector('.chat-widget-message-input').style.display = 'none';
        } else {
            document.querySelector('.chat-widget-user-info').style.display = 'none';
            document.querySelector('.chat-widget-message-input').style.display = 'block';
            
            // Загружаем историю чата, если есть ID
            loadChatHistory();
        }
        
        // Прокручиваем к последнему сообщению
        scrollToBottom();
    }
    
    // Закрытие чата (сворачивание)
    function closeChat() {
        isMinimized = true;
        document.getElementById('support-chat-widget').classList.add('chat-widget-closed');
        document.querySelector('.chat-widget-header').style.display = 'none';
        document.querySelector('.chat-widget-body').style.display = 'none';
        document.querySelector('.chat-widget-button').style.display = 'flex';
    }
    
    // Начало чата (после ввода имени и телефона)
    function startChat() {
        const nameInput = document.querySelector('.chat-widget-name');
        const phoneInput = document.querySelector('.chat-widget-phone');
        const messageInput = document.querySelector('.chat-widget-input');
        
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        
        // Проверяем введенные данные
        if (!name) {
            alert('Пожалуйста, введите ваше имя');
            return;
        }
        
        if (!phone) {
            alert('Пожалуйста, введите ваш телефон');
            return;
        }
        
        // Убедимся, что соединение установлено
        if (!socket || !socket.connected) {
            console.error('Нет подключения к серверу');
            alert('Не удалось подключиться к серверу. Пожалуйста, обновите страницу и попробуйте снова.');
            return;
        }
        
        // Сохраняем данные клиента
        customerName = name;
        customerPhone = phone;
        
        // Отправляем запрос на начало чата через WebSocket
        socket.emit('start_chat', {
            name: name,
            phone: phone,
            page_url: window.location.href
        });
        
        // Устанавливаем обработчик ответа
        socket.once('chat_started', function(data) {
            if (data.success) {
                // Сохраняем ID чата
                chatId = data.chat_id;
                
                // Сохраняем данные в localStorage
                localStorage.setItem('chatId', chatId);
                localStorage.setItem('customerName', customerName);
                localStorage.setItem('customerPhone', customerPhone);
                
                // Меняем интерфейс
                const userInfoEl = document.querySelector('.chat-widget-user-info');
                const messageInputEl = document.querySelector('.chat-widget-message-input');
                
                if (userInfoEl) userInfoEl.style.display = 'none';
                if (messageInputEl) messageInputEl.style.display = 'block';
                
                // Присоединяемся к комнате чата
                socket.emit('join', { chat_id: chatId });
                
                console.log('Чат успешно начат, ID:', chatId);
            } else {
                alert('Не удалось начать чат: ' + (data.error || 'Неизвестная ошибка'));
            }
        });
    }
    
    // Отправка сообщения
    function sendMessage(event) {
        // Если передано событие, отменяем его стандартное поведение
        if (event) {
            event.preventDefault();
        }
        
        const messageInput = document.querySelector('.chat-widget-input');
        const message = messageInput.value.trim();
        
        if (!message) return;
        
        // Очищаем поле ввода сразу
        messageInput.value = '';
        
        // Отправляем сообщение через WebSocket
        socket.emit('send_message', {
            chat_id: chatId,
            message: message,
            sender: 'user'
        });
        
        // Сообщение будет добавлено через событие new_message
        // Это предотвратит дублирование
        
        // Убедимся, что страница не перезагружается
        return false;
    }
    
    // Форматирование времени
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }
    
    // Добавление сообщения в чат
    function appendMessage(sender, message, timestamp = new Date().toISOString()) {
        const chatMessages = document.getElementById('chat-widget-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender}-message`;
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-text">${message}</div>
                <div class="message-time">${formatTime(timestamp)}</div>
            </div>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Если сообщение от оператора и чат свернут, увеличиваем счетчик непрочитанных
        if (sender === 'operator' && isMinimized) {
            unreadCount++;
            updateUnreadCountDisplay();
        }
    }
    
    // Прокрутка чата вниз
    function scrollToBottom() {
        const messagesContainer = document.querySelector('.chat-widget-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Обновление отображения счетчика непрочитанных сообщений
    function updateUnreadCountDisplay() {
        const countElement = document.querySelector('.chat-widget-unread-count');
        
        if (unreadCount > 0) {
            countElement.textContent = unreadCount;
            countElement.style.display = 'flex';
        } else {
            countElement.style.display = 'none';
        }
    }
    
    // Загрузка истории чата
    function loadChatHistory() {
        if (!chatId || !socket) return;
        
        // Отправляем запрос на загрузку истории через WebSocket
        socket.emit('load_chat_history', { chat_id: chatId });
    }
    
    // Проверка новых сообщений
    function checkNewMessages() {
        if (!chatId || !socket) return;
        
        // Вместо HTTP-запроса используем WebSocket
        socket.emit('check_new_messages', {
            chat_id: chatId,
            last_timestamp: lastMessageTimestamp
        });
    }
    
    // Генерация UUID для идентификации чата
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // Инициализируем виджет немедленно
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(addWidgetToPage, 1);
    } else {
        document.addEventListener('DOMContentLoaded', addWidgetToPage);
        // Резервный вариант
        window.addEventListener('load', addWidgetToPage);
    }
    
    // На всякий случай, если загрузка уже произошла или DOMContentLoaded сработал
    setTimeout(addWidgetToPage, 500);
})(); 