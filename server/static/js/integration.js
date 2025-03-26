/**
 * Интеграция чат-виджета и обработка форм для сайта
 * Версия 3.0 с WebSocket
 */
(function() {
    // Конфигурация
    const API_URL = 'http://localhost:5000';
    const CHAT_LIFETIME = 60 * 60 * 1000; // 1 час в миллисекундах
    
    // Глобальные переменные
    let isMinimized = true;
    let socket = null;
    let chatId = null;
    
    // Загружаем Font Awesome для иконок
    function loadFontAwesome() {
        if (document.querySelector('link[href*="font-awesome"]')) {
            return; // Font Awesome уже загружен
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
        link.integrity = 'sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==';
        link.crossOrigin = 'anonymous';
        
        document.head.appendChild(link);
        console.log('Font Awesome для иконок чата загружен');
    }
    
    // Загрузка Socket.IO
    function loadSocketIO() {
        if (document.querySelector('script[src*="socket.io"]')) {
            return; // Socket.IO уже загружен
        }
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.2/socket.io.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    // Инициализация WebSocket
    function initWebSocket() {
        // Подключаемся к серверу
        socket = io.connect(API_URL);
        
        // Обработчики событий WebSocket
        socket.on('connect', function() {
            console.log('Соединение с сервером установлено');
            
            // Если есть ID чата, присоединяемся к комнате
            const storedChatId = localStorage.getItem('chat_id');
            if (storedChatId) {
                chatId = storedChatId;
                socket.emit('join', { chat_id: chatId });
                
                // Загружаем историю чата
                socket.emit('load_chat_history', { chat_id: chatId });
            }
        });
        
        socket.on('disconnect', function() {
            console.log('Соединение с сервером разорвано');
        });
        
        socket.on('error', function(data) {
            console.error('Ошибка WebSocket:', data.error);
        });
        
        // Обработчик получения истории чата
        socket.on('chat_history', function(data) {
            updateChatHistory(data);
        });
        
        // Обработчик получения нового сообщения
        socket.on('new_message', function(message) {
            // Добавляем сообщение в чат
            addMessageToChat({
                sender: message.sender,
                message: message.message,
                timestamp: message.timestamp
            });
        });
    }
    
    // Обновление истории чата
    function updateChatHistory(data) {
        const messagesContainer = document.querySelector('.chat-widget-messages');
        if (!messagesContainer) return;
        
        // Очищаем контейнер сообщений
        messagesContainer.innerHTML = '';
        
        // Добавляем сообщения
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(message => {
                addMessageToChat(message);
            });
            
            // Прокручиваем к последнему сообщению
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    // Создание кнопки чата
    function createChatButton() {
        // Проверяем, существует ли уже кнопка чата
        if (document.getElementById('support-chat-widget')) {
            console.log('Кнопка чата уже существует');
            return;
        }
        
        // Создаем контейнер для чат-виджета
        const chatWidget = document.createElement('div');
        chatWidget.id = 'support-chat-widget';
        chatWidget.className = 'chat-widget-closed';
        
        // Создаем кнопку для открытия чата
        const chatButton = document.createElement('div');
        chatButton.className = 'chat-widget-button';
        
        // Добавляем иконку комментария из Font Awesome
        const iconElement = document.createElement('i');
        iconElement.className = 'fas fa-comment';
        chatButton.appendChild(iconElement);
        
        // Добавляем счетчик непрочитанных сообщений
        const unreadCount = document.createElement('span');
        unreadCount.className = 'chat-widget-unread-count';
        unreadCount.style.display = 'none';
        unreadCount.textContent = '0';
        chatButton.appendChild(unreadCount);
        
        // Добавляем базовую структуру чата (заголовок, тело, окно ввода)
        chatWidget.innerHTML += `
            <div class="chat-widget-header" style="display:none;">
                <div class="chat-widget-title">Онлайн-консультант</div>
                <div class="chat-widget-controls">
                    <span class="chat-widget-minimize"><i class="fas fa-minus"></i></span>
                    <span class="chat-widget-close"><i class="fas fa-times"></i></span>
                </div>
            </div>
            <div class="chat-widget-body" style="display:none;">
                <div class="chat-widget-messages"></div>
                <div class="chat-widget-user-info">
                    <input type="text" class="chat-widget-name" placeholder="Введите ваше имя">
                    <input type="text" class="chat-widget-phone" placeholder="Введите номер телефона">
                    <input type="text" class="chat-widget-initial-message" placeholder="Ваше сообщение">
                    <button class="chat-widget-start-btn">Начать чат</button>
                </div>
                <div class="chat-widget-message-input" style="display:none;">
                    <input type="text" class="chat-widget-input" placeholder="Введите сообщение...">
                    <button class="chat-widget-send-btn"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        
        // Добавляем кнопку к виджету
        chatWidget.appendChild(chatButton);
        
        // Добавляем стили для виджета
        addChatWidgetStyles();
        
        // Добавляем виджет на страницу
        document.body.appendChild(chatWidget);
        console.log('Кнопка чата создана и добавлена на страницу');
        
        // Добавляем обработчики событий
        setTimeout(attachChatEvents, 500);
    }
    
    // Добавление стилей для чат-виджета
    function addChatWidgetStyles() {
        // Проверяем, добавлены ли уже стили
        if (document.getElementById('chat-widget-styles')) {
            return;
        }
        
        const styleElement = document.createElement('style');
        styleElement.id = 'chat-widget-styles';
        styleElement.textContent = `
            #support-chat-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                font-family: Arial, sans-serif;
                transition: all 0.3s ease;
            }
            
            .chat-widget-button {
                width: 70px;
                height: 70px;
                background-color: #23B684;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                position: relative;
                animation: chatPulse 2s infinite;
            }
            
            @keyframes chatPulse {
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
            
            .chat-widget-button i {
                font-size: 28px;
                color: white;
            }
            
            .chat-widget-unread-count {
                position: absolute;
                top: -5px;
                right: -5px;
                background-color: #ff3b30;
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                justify-content: center;
                align-items: center;
                font-size: 14px;
                font-weight: bold;
            }
            
            .chat-widget-header {
                background-color: #23B684;
                color: white;
                padding: 10px 15px;
                border-radius: 10px 10px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .chat-widget-title {
                font-weight: bold;
            }
            
            .chat-widget-controls span {
                margin-left: 10px;
                cursor: pointer;
            }
            
            .chat-widget-body {
                background-color: white;
                border-radius: 0 0 10px 10px;
                width: 300px;
                display: flex;
                flex-direction: column;
                height: 350px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            .chat-widget-messages {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                background: #f8f8f8;
            }
            
            .chat-widget-user-info, .chat-widget-message-input {
                padding: 10px;
                border-top: 1px solid #eee;
            }
            
            .chat-widget-name, .chat-widget-phone, .chat-widget-input, .chat-widget-initial-message {
                width: 100%;
                padding: 8px;
                margin-bottom: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            .chat-widget-start-btn, .chat-widget-send-btn {
                background-color: #23B684;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .chat-widget-message-input {
                display: flex;
            }
            
            .chat-widget-input {
                flex: 1;
                margin-right: 10px;
                margin-bottom: 0;
                height: 40px;
            }
            
            .chat-message {
                margin-bottom: 10px;
                padding: 8px 12px;
                border-radius: 18px;
                max-width: 80%;
                word-wrap: break-word;
            }
            
            .chat-message-user {
                background-color: #e1f5fe;
                align-self: flex-end;
                margin-left: auto;
                border-bottom-right-radius: 4px;
            }
            
            .chat-message-operator {
                background-color: #f1f0f0;
                align-self: flex-start;
                border-bottom-left-radius: 4px;
            }
            
            .chat-message-system {
                background-color: #fff3e0;
                align-self: center;
                margin: 10px auto;
                text-align: center;
                max-width: 90%;
                font-style: italic;
                border-radius: 8px;
            }
            
            .chat-message-time {
                font-size: 10px;
                color: #999;
                text-align: right;
                margin-top: 2px;
            }
            
            .chat-widget-closed .chat-widget-header,
            .chat-widget-closed .chat-widget-body {
                display: none !important;
            }
        `;
        
        document.head.appendChild(styleElement);
        console.log('Стили для чат-виджета добавлены');
    }
    
    // Привязка событий к чату после его загрузки
    function attachChatEvents() {
        const startBtn = document.querySelector('.chat-widget-start-btn');
        const sendBtn = document.querySelector('.chat-widget-send-btn');
        const chatButton = document.querySelector('.chat-widget-button');
        const minimizeBtn = document.querySelector('.chat-widget-minimize');
        const closeBtn = document.querySelector('.chat-widget-close');
        
        if (startBtn) {
            startBtn.addEventListener('click', function() {
                handleStartChat();
            });
        }
        
        if (sendBtn) {
            sendBtn.addEventListener('click', function() {
                handleSendMessage();
            });
        }
        
        if (chatButton) {
            chatButton.addEventListener('click', function() {
                handleOpenChat();
            });
        }
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', function() {
                handleMinimizeChat();
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                handleCloseChat();
            });
        }
        
        // Обработчик отправки сообщения по Enter
        const inputEl = document.querySelector('.chat-widget-input');
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if(e.keyCode === 13) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
        }
        
        // Проверка на существующую сессию чата
        loadExistingChat();
    }
    
    // Проверка и загрузка существующего чата
    function loadExistingChat() {
        const storedChatId = localStorage.getItem('chat_id');
        const chatTimestamp = parseInt(localStorage.getItem('chat_timestamp') || '0');
        const currentTime = new Date().getTime();
        
        // Проверяем, не истек ли срок действия чата (1 час)
        if (storedChatId && (currentTime - chatTimestamp) < CHAT_LIFETIME) {
            console.log('Найден активный чат, ID:', storedChatId);
            
            // Устанавливаем chatId
            chatId = storedChatId;
            
            // Присоединяемся к комнате чата
            if (socket) {
                socket.emit('join', { chat_id: chatId });
                
                // Загружаем историю чата
                socket.emit('load_chat_history', { chat_id: chatId });
                
                // Показываем интерфейс чата
                document.querySelector('.chat-widget-user-info').style.display = 'none';
                document.querySelector('.chat-widget-message-input').style.display = 'block';
            }
        } else if (storedChatId) {
            // Срок действия чата истек, удаляем данные
            console.log('Срок действия чата истек, удаляем данные');
            localStorage.removeItem('chat_id');
            localStorage.removeItem('chat_timestamp');
        }
    }
    
    // Открытие чата
    function handleOpenChat() {
        const widget = document.getElementById('support-chat-widget');
        if (widget) {
            widget.classList.remove('chat-widget-closed');
            document.querySelector('.chat-widget-header').style.display = 'flex';
            document.querySelector('.chat-widget-body').style.display = 'flex';
            document.querySelector('.chat-widget-button').style.display = 'none';
            
            // Отмечаем, что чат открыт
            isMinimized = false;
            
            // Показываем соответствующий интерфейс в зависимости от наличия ID чата
            if (chatId) {
                document.querySelector('.chat-widget-user-info').style.display = 'none';
                document.querySelector('.chat-widget-message-input').style.display = 'block';
            } else {
                document.querySelector('.chat-widget-user-info').style.display = 'block';
                document.querySelector('.chat-widget-message-input').style.display = 'none';
            }
            
            // Сбрасываем счетчик непрочитанных сообщений
            const unreadCount = document.querySelector('.chat-widget-unread-count');
            if (unreadCount) {
                unreadCount.style.display = 'none';
                unreadCount.textContent = '0';
            }
            
            // Прокручиваем к последнему сообщению
            const messagesContainer = document.querySelector('.chat-widget-messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    }
    
    // Сворачивание чата
    function handleMinimizeChat() {
        const widget = document.getElementById('support-chat-widget');
        if (widget) {
            widget.classList.add('chat-widget-closed');
            document.querySelector('.chat-widget-header').style.display = 'none';
            document.querySelector('.chat-widget-body').style.display = 'none';
            document.querySelector('.chat-widget-button').style.display = 'flex';
            
            // Отмечаем, что чат свернут
            isMinimized = true;
        }
    }
    
    // Закрытие чата
    function handleCloseChat() {
        handleMinimizeChat();
    }
    
    // Начать чат
    function handleStartChat() {
        const nameInput = document.querySelector('.chat-widget-name');
        const phoneInput = document.querySelector('.chat-widget-phone');
        const messageInput = document.querySelector('.chat-widget-initial-message');
        
        if (!nameInput || !phoneInput || !messageInput) {
            console.error('Не найдены поля ввода');
            return;
        }
        
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const message = messageInput.value.trim();
        
        if (!name) {
            alert('Пожалуйста, введите ваше имя');
            return;
        }
        
        if (!phone) {
            alert('Пожалуйста, введите ваш телефон');
            return;
        }
        
        if (!message) {
            alert('Пожалуйста, введите сообщение');
            return;
        }
        
        // Отправляем данные через WebSocket
        socket.emit('start_chat', {
            name: name,
            phone: phone,
            message: message,
            page_url: window.location.href
        });
        
        // Обработчик успешного начала чата
        socket.once('chat_started', function(data) {
            if (data.success) {
                // Сохраняем ID чата
                chatId = data.chat_id;
                
                // Сохраняем данные в localStorage
                localStorage.setItem('chat_id', chatId);
                localStorage.setItem('chat_timestamp', new Date().getTime().toString());
                
                // Присоединяемся к комнате чата
                socket.emit('join', { chat_id: chatId });
                
                // Меняем интерфейс
                document.querySelector('.chat-widget-user-info').style.display = 'none';
                document.querySelector('.chat-widget-message-input').style.display = 'block';
                
                console.log('Чат успешно начат, ID:', chatId);
            } else {
                alert('Ошибка при создании чата: ' + (data.error || 'Попробуйте позже'));
            }
        });
    }
    
    // Отправка сообщения
    function handleSendMessage() {
        const inputElement = document.querySelector('.chat-widget-input');
        
        if (!inputElement) {
            console.error('Не найдено поле ввода сообщения');
            return;
        }
        
        const message = inputElement.value.trim();
        
        if (!message) {
            return;
        }
        
        // Очищаем поле ввода
        inputElement.value = '';
        
        if (!chatId) {
            console.error('ID чата не найден, невозможно отправить сообщение');
            alert('Ошибка: Сессия чата не найдена. Перезагрузите страницу и начните чат заново.');
            return;
        }
        
        // Отправляем сообщение через WebSocket
        socket.emit('send_message', {
            chat_id: chatId,
            message: message,
            sender: 'user'
        });
        
        // Обновляем временную метку чата
        localStorage.setItem('chat_timestamp', new Date().getTime().toString());
    }
    
    // Добавление сообщения в чат
    function addMessageToChat(message) {
        const messagesContainer = document.querySelector('.chat-widget-messages');
        if (!messagesContainer) {
            console.error('Не найден контейнер для сообщений');
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message chat-message-' + message.sender;
        
        // Форматируем время
        let timeString = '';
        try {
            const date = new Date(message.timestamp);
            timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            timeString = 'Сейчас';
        }
        
        // Особая разметка для системных сообщений
        if (message.sender === 'system') {
            messageElement.innerHTML = `
                <div class="chat-message-content">${message.message}</div>
            `;
        } else {
            messageElement.innerHTML = `
                <div class="chat-message-content">${message.message}</div>
                <div class="chat-message-time">${timeString}</div>
            `;
        }
        
        messagesContainer.appendChild(messageElement);
        
        // Прокручиваем к последнему сообщению
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Если сообщение от оператора и чат свернут, увеличиваем счетчик непрочитанных
        if (message.sender === 'operator' && isMinimized) {
            incrementUnreadCount();
        }
    }
    
    // Увеличение счетчика непрочитанных сообщений
    function incrementUnreadCount() {
        const countElement = document.querySelector('.chat-widget-unread-count');
        if (countElement) {
            let count = parseInt(countElement.textContent || '0');
            count++;
            countElement.textContent = count;
            countElement.style.display = 'flex';
        }
    }
    
    // Перехват форм на странице
    function interceptForms() {
        console.log('Настройка перехвата форм...');
        const forms = document.querySelectorAll('form:not([data-no-intercept])');
        
        forms.forEach(form => {
            form.addEventListener('submit', function(event) {
                // Предотвращаем стандартную отправку формы
                event.preventDefault();
                
                console.log('Перехвачена отправка формы:', form);
                
                // Собираем данные формы
                const formData = new FormData(form);
                const formDataObj = {};
                
                formData.forEach((value, key) => {
                    formDataObj[key] = value;
                });
                
                // Добавляем служебную информацию
                formDataObj.site_id = window.location.hostname;
                formDataObj.page_url = window.location.href;
                formDataObj.form_id = form.id || 'unknown_form';
                
                // Отправка данных через WebSocket
                if (socket) {
                    socket.emit('submit_form', formDataObj);
                    
                    // Обработчик успешной отправки формы
                    socket.once('form_submitted', function(data) {
                        if (data.success) {
                            // Очищаем форму
                            form.reset();
                            
                            // Показываем сообщение об успешной отправке
                            alert('Форма успешно отправлена! Наш оператор свяжется с вами в ближайшее время.');
                        } else {
                            alert('Произошла ошибка при отправке формы. Пожалуйста, попробуйте позже.');
                        }
                    });
                } else {
                    // Если WebSocket не доступен, отправляем через AJAX
                    fetch(`${API_URL}/form/submit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formDataObj)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // Очищаем форму
                            form.reset();
                            
                            // Показываем сообщение об успешной отправке
                            alert('Форма успешно отправлена! Наш оператор свяжется с вами в ближайшее время.');
                        } else {
                            alert('Произошла ошибка при отправке формы. Пожалуйста, попробуйте позже.');
                        }
                    })
                    .catch(error => {
                        console.error('Ошибка отправки формы:', error);
                        alert('Произошла ошибка при отправке формы. Пожалуйста, попробуйте позже.');
                    });
                }
            });
        });
    }
    
    // Очистка localStorage и перезапуск чата
    function resetChat() {
        // Очищаем localStorage
        localStorage.removeItem('chat_id');
        localStorage.removeItem('chat_timestamp');
        localStorage.removeItem('customerName');
        localStorage.removeItem('customerPhone');
        
        // Сбрасываем переменные
        chatId = null;
        isMinimized = true;
        
        // Перезагружаем интерфейс чата
        const widget = document.getElementById('support-chat-widget');
        if (widget) {
            widget.classList.add('chat-widget-closed');
            document.querySelector('.chat-widget-header').style.display = 'none';
            document.querySelector('.chat-widget-body').style.display = 'none';
            document.querySelector('.chat-widget-button').style.display = 'flex';
            document.querySelector('.chat-widget-user-info').style.display = 'block';
            document.querySelector('.chat-widget-message-input').style.display = 'none';
            
            // Очищаем сообщения
            const messagesContainer = document.querySelector('.chat-widget-messages');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
            
            // Очищаем поля ввода
            const nameInput = document.querySelector('.chat-widget-name');
            const phoneInput = document.querySelector('.chat-widget-phone');
            const messageInput = document.querySelector('.chat-widget-initial-message');
            
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (messageInput) messageInput.value = '';
        }
        
        console.log('Чат успешно сброшен. Теперь вы можете начать новый чат.');
    }
    
    // Добавляем функцию в глобальную область видимости для доступа из консоли
    window.resetChat = resetChat;
    
    // Инициализация
    async function init() {
        console.log('Инициализация интеграции чата и форм...');
        
        // Загружаем Font Awesome для иконок
        loadFontAwesome();
        
        // Загружаем Socket.IO
        try {
            await loadSocketIO();
            
            // Инициализируем WebSocket
            initWebSocket();
        } catch (error) {
            console.error('Ошибка при загрузке Socket.IO:', error);
        }
        
        // Создаем и настраиваем чат-виджет
        createChatButton();
        
        // Настраиваем перехват форм на странице
        interceptForms();
        
        console.log('Интеграция чата и форм успешно инициализирована');
    }
    
    // Запускаем инициализацию при загрузке страницы
    if (document.readyState === 'complete') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})(); 