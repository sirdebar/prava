/**
 * JavaScript для админ-панели с использованием WebSocket
 * Обеспечивает функциональность чата в реальном времени
 */

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    // Глобальные переменные
    let currentChatId = null;
    let socket = null;
    
    // Инициализация Socket.IO
    function initSocketIO() {
        // Подключаемся к серверу
        socket = io.connect(window.location.origin);
        
        // Обработчики событий WebSocket
        socket.on('connect', function() {
            console.log('Соединение с сервером установлено');
            
            // Загружаем список чатов после подключения
            socket.emit('get_chats');
            
            // Загружаем счетчики
            socket.emit('get_counters');
        });
        
        socket.on('disconnect', function() {
            console.log('Соединение с сервером разорвано');
        });
        
        socket.on('error', function(data) {
            console.error('Ошибка WebSocket:', data.error);
        });
        
        // Обработчик получения списка чатов
        socket.on('chats_list', function(data) {
            updateChatsList(data.chats);
        });
        
        // Обработчик получения истории чата
        socket.on('chat_history', function(data) {
            updateChatHistory(data);
        });
        
        // Обработчик получения нового сообщения
        socket.on('new_message', function(message) {
            appendMessage(message);
        });
        
        // Обработчик обновления чата
        socket.on('chat_updated', function(data) {
            // Загружаем список чатов при обновлении
            socket.emit('get_chats');
            
            // Если это текущий чат, обновляем историю
            if (currentChatId === data.chat_id) {
                socket.emit('load_chat_history', { chat_id: currentChatId });
            }
            
            // Обновляем счетчики
            socket.emit('get_counters');
        });
        
        // Обработчик закрытия чата
        socket.on('chat_closed', function(data) {
            if (currentChatId === data.chat_id) {
                // Если закрыт текущий чат, сбрасываем состояние
                resetChatView();
            }
            
            // Загружаем список чатов
            socket.emit('get_chats');
            
            // Обновляем счетчики
            socket.emit('get_counters');
        });
        
        // Обработчик получения счетчиков
        socket.on('counters', function(data) {
            updateCounters(data);
        });
    }
    
    // Функция для обновления списка чатов
    function updateChatsList(chats) {
        const chatsList = document.getElementById('chats-list');
        chatsList.innerHTML = '';
        
        document.getElementById('loading').style.display = 'none';
        
        if (!chats || chats.length === 0) {
            chatsList.innerHTML = '<div class="alert alert-info my-3">Нет активных чатов</div>';
            return;
        }
        
        chats.forEach(chat => {
            const chatTime = new Date(chat.updated_at).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Добавляем индикатор непрочитанных сообщений
            const unreadBadge = chat.unread_count > 0 
                ? `<span class="badge badge-danger ml-2">${chat.unread_count}</span>` 
                : '';
            
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            if (currentChatId === chat.chat_id) {
                chatItem.classList.add('active');
            }
            
            chatItem.dataset.chatId = chat.chat_id;
            chatItem.innerHTML = `
                <div class="chat-info">
                    <div class="chat-name">${chat.customer_name} ${unreadBadge}</div>
                    <div class="chat-phone">${chat.customer_phone}</div>
                    <div class="chat-time">${chatTime}</div>
                </div>
                <div class="chat-preview">
                    <div class="chat-last-message">Открыть чат</div>
                </div>
            `;
            
            chatItem.addEventListener('click', function() {
                openChat(chat.chat_id);
            });
            
            chatsList.appendChild(chatItem);
        });
    }
    
    // Функция для открытия чата
    function openChat(chatId) {
        // Покидаем предыдущую комнату чата, если есть
        if (currentChatId) {
            socket.emit('leave', { chat_id: currentChatId });
        }
        
        // Запоминаем текущий чат
        currentChatId = chatId;
        
        // Присоединяемся к комнате чата
        socket.emit('join', { chat_id: chatId });
        
        // Отмечаем активный чат в списке
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.chatId === chatId) {
                item.classList.add('active');
            }
        });
        
        // Показываем интерфейс чата
        document.getElementById('chat-placeholder').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        
        // Загружаем историю чата
        socket.emit('load_chat_history', { chat_id: chatId });
    }
    
    // Функция для обновления истории чата
    function updateChatHistory(data) {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        // Обновляем информацию о пользователе в шапке
        document.getElementById('chat-user-name').textContent = data.chat.customer_name;
        document.getElementById('chat-user-phone').textContent = data.chat.customer_phone;
        
        // Добавляем все сообщения
        data.messages.forEach(message => {
            appendMessage(message);
        });
        
        // Прокручиваем до последнего сообщения
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Функция для добавления сообщения в чат
    function appendMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageTime = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const messageClass = message.sender === 'user' ? 'user-message' : 'operator-message';
        const messageAlign = message.sender === 'user' ? 'left' : 'right';
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${messageClass} message-${messageAlign}`;
        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-text">${message.message}</div>
                <div class="message-time">${messageTime}</div>
            </div>
        `;
        
        chatMessages.appendChild(messageElement);
        
        // Прокручиваем до последнего сообщения
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Функция для отправки сообщения оператором
    function sendMessage() {
        if (!currentChatId) return;
        
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (!message) return;
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Отправляем сообщение через WebSocket
        socket.emit('send_message', {
            chat_id: currentChatId,
            message: message,
            sender: 'operator'
        });
    }
    
    // Функция для закрытия чата
    function closeChat() {
        if (!currentChatId) return;
        
        if (!confirm('Вы уверены, что хотите закрыть этот чат?')) {
            return;
        }
        
        // Отправляем запрос на закрытие чата
        socket.emit('close_chat', { chat_id: currentChatId });
        
        // Сбрасываем состояние чата
        resetChatView();
    }
    
    // Функция для сброса состояния чата
    function resetChatView() {
        // Покидаем комнату чата
        if (currentChatId) {
            socket.emit('leave', { chat_id: currentChatId });
        }
        
        // Сбрасываем текущий чат
        currentChatId = null;
        
        // Скрываем интерфейс чата
        document.getElementById('chat-container').style.display = 'none';
        document.getElementById('chat-placeholder').style.display = 'flex';
    }
    
    // Функция для обновления счетчиков
    function updateCounters(data) {
        document.getElementById('active-chats-counter').textContent = data.active_chats || 0;
        document.getElementById('unread-messages-counter').textContent = data.unread_messages || 0;
        document.getElementById('unprocessed-forms-counter').textContent = data.unprocessed_forms || 0;
    }
    
    // Обработчик отправки сообщения
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', function(event) {
            event.preventDefault();
            sendMessage();
        });
    }
    
    // Обработчик закрытия чата
    const closeChatBtn = document.getElementById('close-chat-btn');
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', function() {
            closeChat();
        });
    }
    
    // Инициализация WebSocket
    initSocketIO();
});

/**
 * Экранирование HTML символов
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
} 