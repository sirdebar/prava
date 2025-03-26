/**
 * Интеграция чат-виджета и обработка форм для сайта
 * Версия 4.1 - Корректная обработка всех форм сайта
 */
(function() {
    // Конфигурация
    const API_URL = 'http://localhost:5000';
    
    // Глобальные переменные
    let socket = null;
    let chatId = null;
    let isMinimized = true;
    let unreadCount = 0;
    
    /**
     * Загрузка внешних библиотек
     */
    
    // Загружаем Font Awesome для иконок, если еще не загружен
    function loadFontAwesome() {
        if (document.querySelector('link[href*="font-awesome"]')) {
            return; // Font Awesome уже загружен
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    }
    
    // Загрузка Socket.IO
    function loadSocketIO() {
        if (document.querySelector('script[src*="socket.io"]')) {
            return Promise.resolve(); // Socket.IO уже загружен
        }
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.2/socket.io.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Инициализация WebSocket
     */
    function initWebSocket() {
        if (socket && socket.connected) return; // Уже подключен
        
        try {
            // Подключаемся к серверу
            socket = io(API_URL);
            
            // Обработчики событий WebSocket
            socket.on('connect', function() {
                console.log('Соединение с сервером установлено');
                
                // Если есть ID чата, присоединяемся к комнате
                const storedChatId = localStorage.getItem('chat_id');
                if (storedChatId) {
                    chatId = storedChatId;
                    socket.emit('join', { chat_id: chatId });
                    socket.emit('load_chat_history', { chat_id: chatId });
                }
                
                // Перехватываем все формы после успешного соединения
                interceptForms();
            });
            
            socket.on('disconnect', function() {
                console.log('Соединение с сервером разорвано');
            });
            
            socket.on('error', function(data) {
                console.error('Ошибка WebSocket:', data.error);
            });
            
            // Обработчик успешной отправки формы
            socket.on('form_submitted', function(data) {
                if (data.success) {
                    alert('Заявка успешно отправлена! Наш оператор свяжется с вами в ближайшее время.');
                } else {
                    alert('Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже.');
                }
            });
        } catch (e) {
            console.error('Ошибка при инициализации WebSocket:', e);
        }
    }
    
    // Перехват форм на странице
    function interceptForms() {
        console.log('Настройка перехвата всех форм...');
        
        // Найдем ВСЕ формы на странице (даже те, которые имеют data-no-intercept)
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            // Удаляем существующие обработчики, если они есть
            const clonedForm = form.cloneNode(true);
            form.parentNode.replaceChild(clonedForm, form);
            form = clonedForm;
            
            // Определим тип формы на основе содержимого
            let formType = 'Форма заказа';
            
            // Проверяем родительский заголовок h5
            const parentDiv = form.closest('.banner-form-agileinfo');
            if (parentDiv) {
                const h5 = parentDiv.querySelector('h5');
                if (h5) {
                    // Определяем тип формы по тексту заголовка
                    if (h5.textContent.includes('Нужны права') || h5.textContent.includes('Закажите звонок')) {
                        formType = 'Заказ звонка';
                    } else if (h5.textContent.includes('Задайте вопрос')) {
                        formType = 'Вопрос посетителя';
                    }
                }
            }
            
            // Добавляем обработчик отправки формы
            form.addEventListener('submit', function(event) {
                // Предотвращаем стандартную отправку формы
                event.preventDefault();
                
                console.log('Перехвачена отправка формы:', formType);
                
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
                formDataObj.form_name = formType;
                
                console.log('Отправка данных формы:', formDataObj);
                
                // Отправка данных через WebSocket
                if (socket && socket.connected) {
                    socket.emit('submit_form', formDataObj);
                    // Очищаем форму после отправки
                    form.reset();
                } else {
                    // Если WebSocket не доступен, отправляем через AJAX
                    fetch(`${API_URL}/form/submit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: JSON.stringify(formDataObj)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // Очищаем форму
                            form.reset();
                            
                            // Показываем сообщение об успешной отправке
                            alert('Заявка успешно отправлена! Наш оператор свяжется с вами в ближайшее время.');
                        } else {
                            alert('Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже.');
                        }
                    })
                    .catch(error => {
                        console.error('Ошибка отправки формы:', error);
                        alert('Произошла ошибка при отправке заявки. Пожалуйста, попробуйте позже.');
                    });
                }
                
                // Возвращаем false, чтобы предотвратить отправку формы
                return false;
            });
        });
        
        console.log('Все формы перехвачены успешно');
    }
    
    // Создание кнопки чата
    function createChatButton() {
        // Проверяем, существует ли уже кнопка чата
        if (document.getElementById('support-chat-widget')) {
            return;
        }
        
        // Создаем контейнер для чат-виджета
        const chatWidget = document.createElement('div');
        chatWidget.id = 'support-chat-widget';
        chatWidget.className = 'chat-widget-closed';
        
        // Добавляем базовую структуру чата (заголовок, тело, окно ввода)
        chatWidget.innerHTML = `
            <div class="chat-widget-button">
                <i class="fas fa-comment"></i>
                <span class="chat-widget-unread-count" style="display:none;">0</span>
            </div>
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
                    <form class="chat-start-form" data-no-intercept>
                        <input type="text" class="chat-widget-name" placeholder="Ваше имя" required>
                        <input type="tel" class="chat-widget-phone" placeholder="Ваш телефон" required>
                        <button type="button" class="chat-widget-start-btn">Начать чат</button>
                    </form>
                </div>
                <div class="chat-widget-message-input" style="display:none;">
                    <form class="chat-message-form" data-no-intercept>
                        <textarea class="chat-widget-input" placeholder="Введите сообщение..."></textarea>
                        <button type="button" class="chat-widget-send-btn"><i class="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>
        `;
        
        // Добавляем стили для виджета
        addChatWidgetStyles();
        
        // Добавляем виджет на страницу
        document.body.appendChild(chatWidget);
        
        // Добавляем обработчики событий
        setTimeout(attachChatEvents, 100);
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
                width: 60px;
                height: 60px;
                background-color: #23B684;
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer;
                color: white;
                font-size: 24px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            
            .chat-widget-unread-count {
                position: absolute;
                top: -5px;
                right: -5px;
                background-color: #ff5a5a;
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
                font-size: 12px;
                font-weight: bold;
            }
            
            .chat-widget-header {
                background-color: #23B684;
                border-top-left-radius: 10px;
                border-top-right-radius: 10px;
                padding: 10px 15px;
                color: white;
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
                width: 300px;
                height: 400px;
                background-color: white;
                border-bottom-left-radius: 10px;
                border-bottom-right-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
            }
            
            .chat-widget-messages {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
                background-color: #f9f9f9;
            }
            
            .chat-widget-user-info, .chat-widget-message-input {
                padding: 10px;
                border-top: 1px solid #eee;
            }
            
            .chat-widget-name, .chat-widget-phone, .chat-widget-input {
                width: 100%;
                padding: 8px 10px;
                margin-bottom: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
                box-sizing: border-box;
            }
            
            .chat-widget-input {
                height: 40px;
                resize: none;
            }
            
            /* Стили для плейсхолдеров */
            .chat-widget-name::placeholder,
            .chat-widget-phone::placeholder,
            .chat-widget-input::placeholder {
                color: #999;
                opacity: 1;
            }
            
            /* Поддержка для Firefox */
            .chat-widget-name::-moz-placeholder,
            .chat-widget-phone::-moz-placeholder,
            .chat-widget-input::-moz-placeholder {
                color: #999;
                opacity: 1;
            }
            
            /* Поддержка для Edge */
            .chat-widget-name::-ms-input-placeholder,
            .chat-widget-phone::-ms-input-placeholder,
            .chat-widget-input::-ms-input-placeholder {
                color: #999;
                opacity: 1;
            }
            
            /* Поддержка для IE */
            .chat-widget-name:-ms-input-placeholder,
            .chat-widget-phone:-ms-input-placeholder,
            .chat-widget-input:-ms-input-placeholder {
                color: #999;
                opacity: 1;
            }
            
            .chat-widget-start-btn, .chat-widget-send-btn {
                padding: 8px 15px;
                background-color: #23B684;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                float: right;
            }
            
            .chat-message {
                margin-bottom: 10px;
                padding: 8px 12px;
                border-radius: 10px;
                max-width: 80%;
                word-wrap: break-word;
            }
            
            .chat-message-user {
                background-color: #e1f5fe;
                margin-left: auto;
                border-bottom-right-radius: 3px;
            }
            
            .chat-message-operator {
                background-color: #f1f1f1;
                margin-right: auto;
                border-bottom-left-radius: 3px;
            }
            
            .chat-message-system {
                background-color: #fff8e1;
                margin: 5px auto;
                font-size: 12px;
                color: #757575;
                text-align: center;
            }
            
            .chat-message-time {
                font-size: 10px;
                color: #999;
                text-align: right;
                margin-top: 3px;
            }
            
            .chat-widget-closed .chat-widget-header,
            .chat-widget-closed .chat-widget-body {
                display: none !important;
            }
            
            .chat-widget-closed .chat-widget-button {
                display: flex !important;
            }
            
            .chat-start-form, .chat-message-form {
                margin: 0;
                padding: 0;
            }
        `;
        
        document.head.appendChild(styleElement);
    }
    
    // Привязка событий к чату
    function attachChatEvents() {
        // Открытие/закрытие виджета
        const buttonEl = document.querySelector('.chat-widget-button');
        if (buttonEl) {
            buttonEl.addEventListener('click', handleOpenChat);
        }
        
        // Закрытие виджета
        const closeEl = document.querySelector('.chat-widget-close');
        if (closeEl) {
            closeEl.addEventListener('click', handleCloseChat);
        }
        
        // Сворачивание виджета
        const minimizeEl = document.querySelector('.chat-widget-minimize');
        if (minimizeEl) {
            minimizeEl.addEventListener('click', handleMinimizeChat);
        }
        
        // Начало чата (после ввода имени и телефона)
        const startBtnEl = document.querySelector('.chat-widget-start-btn');
        if (startBtnEl) {
            startBtnEl.addEventListener('click', function(event) {
                event.preventDefault();
                handleStartChat();
            });
        }
        
        // Отправка сообщения
        const sendBtnEl = document.querySelector('.chat-widget-send-btn');
        if (sendBtnEl) {
            sendBtnEl.addEventListener('click', function(event) {
                event.preventDefault();
                handleSendMessage();
            });
        }
        
        // Отправка сообщения по Enter
        const inputEl = document.querySelector('.chat-widget-input');
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if(e.keyCode === 13 && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                    return false;
                }
            });
        }
        
        // Предотвращаем отправку форм (дополнительная защита)
        const chatForms = document.querySelectorAll('.chat-start-form, .chat-message-form');
        chatForms.forEach(form => {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                return false;
            });
        });
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
    
    // Сброс представления чата
    function resetChatView() {
        document.querySelector('.chat-widget-user-info').style.display = 'block';
        document.querySelector('.chat-widget-message-input').style.display = 'none';
        document.querySelector('.chat-widget-messages').innerHTML = '';
    }
    
    // Начать чат
    function handleStartChat() {
        const nameInput = document.querySelector('.chat-widget-name');
        const phoneInput = document.querySelector('.chat-widget-phone');
        
        if (!nameInput || !phoneInput) {
            console.error('Не найдены поля ввода');
            return;
        }
        
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        
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
        
        // Отправляем данные через WebSocket
        socket.emit('start_chat', {
            name: name,
            phone: phone,
            page_url: window.location.href
        });
        
        // Устанавливаем обработчик успешного начала чата
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
                
                // Очищаем поля ввода
                nameInput.value = '';
                phoneInput.value = '';
                
                // Добавляем системное сообщение
                addMessageToChat({
                    sender: 'system',
                    message: 'Чат начат. Оператор скоро подключится.',
                    timestamp: new Date().toISOString()
                });
            } else {
                alert('Не удалось начать чат: ' + (data.error || 'Неизвестная ошибка'));
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
        
        // Очищаем поле ввода сразу
        inputElement.value = '';
        
        if (!chatId) {
            console.error('ID чата не найден, невозможно отправить сообщение');
            alert('Ошибка: Сессия чата не найдена. Перезагрузите страницу и начните чат заново.');
            return;
        }
        
        // Временно добавляем сообщение в чат, чтобы пользователь видел его сразу
        addMessageToChat({
            sender: 'user',
            message: message,
            timestamp: new Date().toISOString()
        });
        
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
        
        // Определяем класс в зависимости от отправителя
        if (message.sender === 'system') {
            messageElement.className = 'chat-message chat-message-system';
        } else if (message.sender === 'user') {
            messageElement.className = 'chat-message chat-message-user';
        } else {
            messageElement.className = 'chat-message chat-message-operator';
        }
        
        // Форматируем время
        let timeString = '';
        try {
            const date = new Date(message.timestamp);
            timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
    
    // Инициализация
    async function init() {
        console.log('Инициализация интеграции чата и форм...');
        
        // Загружаем Font Awesome для иконок
        loadFontAwesome();
        
        try {
            // Загружаем Socket.IO
            await loadSocketIO();
            
            // Инициализируем WebSocket
            initWebSocket();
            
            // Создаем кнопку чата
            createChatButton();
            
            console.log('Интеграция чата и форм успешно инициализирована');
        } catch (error) {
            console.error('Ошибка при инициализации:', error);
            
            // В случае ошибки с WebSocket, всё равно перехватываем формы
            interceptForms();
        }
    }
    
    // Запускаем инициализацию
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})(); 