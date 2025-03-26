/**
 * Виджет чата для сайта
 * Загружает iframe с чат-виджетом
 */
(function() {
    // Настройки
    const API_URL = 'http://localhost:5000';
    
    // Создаем и добавляем iframe
    function createChatFrame() {
        // Если iframe уже существует, не создаем новый
        if (document.getElementById('chat-widget-iframe')) {
            return;
        }
        
        // Создаем iframe для чата
        const iframe = document.createElement('iframe');
        iframe.id = 'chat-widget-iframe';
        iframe.src = API_URL + '/static/chat-widget.html';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '340px';
        iframe.style.height = '450px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '999999';
        iframe.style.overflow = 'hidden';
        iframe.style.background = 'transparent';
        iframe.setAttribute('allowtransparency', 'true');
        
        // Добавляем iframe в body
        document.body.appendChild(iframe);
        
        // Устанавливаем обработчик сообщений от iframe
        setupMessageHandler();
        
        console.log('Чат-виджет успешно добавлен на страницу');
    }
    
    // Устанавливаем обработчик сообщений от iframe
    function setupMessageHandler() {
        window.addEventListener('message', function(event) {
            // Проверяем, что сообщение от нашего iframe
            if (event.data && event.data.type === 'chatWidgetAction') {
                const action = event.data.action;
                
                switch (action) {
                    case 'startChat':
                        // Начало чата
                        handleChatStart(event.data.name, event.data.phone);
                        break;
                    case 'sendMessage':
                        // Отправка сообщения
                        handleSendMessage(event.data.message);
                        break;
                    case 'opened':
                        // Чат открыт
                        break;
                    case 'closed':
                        // Чат закрыт
                        break;
                    case 'fullClosed':
                        // Чат полностью закрыт
                        break;
                }
            }
        });
    }
    
    // Обработка начала чата
    function handleChatStart(name, phone) {
        console.log('Пользователь начал чат:', name, phone);
        // Можно добавить дополнительные действия при начале чата
    }
    
    // Обработка отправки сообщения
    function handleSendMessage(message) {
        console.log('Сообщение от пользователя:', message);
        // Можно добавить дополнительные действия при отправке сообщения
    }
    
    // Инициализация виджета
    function initChatWidget() {
        createChatFrame();
    }
    
    // Запускаем инициализацию при загрузке страницы
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initChatWidget, 1000);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initChatWidget, 1000);
        });
    }
    
    // Экспортируем публичные методы
    window.SiteChat = {
        // Отправка сообщения в iframe чата
        sendAction: function(action, data = {}) {
            const iframe = document.getElementById('chat-widget-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'chatAction',
                    action: action,
                    ...data
                }, '*');
            }
        },
        
        // Открыть чат
        open: function() {
            this.sendAction('openChat');
        },
        
        // Закрыть чат
        close: function() {
            this.sendAction('closeChat');
        },
        
        // Полностью закрыть чат
        fullClose: function() {
            this.sendAction('fullClose');
        }
    };
})(); 