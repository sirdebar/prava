/**
 * Интеграция чата с основной страницей
 * Обрабатывает сообщения от iframe с чатом и управляет его видимостью
 */
(function() {
    // URL к серверу чата
    const chatServerUrl = 'http://localhost:5000';
    
    // Загружаем виджет чата
    function loadChatWidget() {
        // Проверяем, есть ли уже контейнер для чата
        if (document.getElementById('chat-widget-iframe')) {
            return;
        }
        
        // Создаем iframe для чата
        const iframe = document.createElement('iframe');
        iframe.id = 'chat-widget-iframe';
        iframe.src = chatServerUrl + '/static/chat-widget.html';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '0';
        iframe.style.right = '0';
        iframe.style.width = '340px';  
        iframe.style.height = '500px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '999999';
        iframe.style.overflow = 'hidden';
        iframe.style.backgroundColor = 'transparent';
        iframe.setAttribute('allowtransparency', 'true');
        
        // Добавляем iframe напрямую в body
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
                        handleStartChat(event.data.name, event.data.phone);
                        break;
                    case 'sendMessage':
                        handleSendMessage(event.data.message);
                        break;
                    case 'opened':
                        console.log('Чат открыт пользователем');
                        break;
                    case 'closed':
                        console.log('Чат свернут пользователем');
                        break;
                    case 'fullClosed':
                        console.log('Чат полностью закрыт пользователем');
                        break;
                }
            }
        });
    }
    
    // Обработка начала чата
    function handleStartChat(name, phone) {
        console.log('Начат чат пользователем:', name, phone);
        // Здесь можно добавить дополнительные действия при начале чата
    }
    
    // Обработка отправки сообщения
    function handleSendMessage(message) {
        console.log('Сообщение от пользователя:', message);
        // Здесь можно добавить дополнительные действия при отправке сообщения
    }
    
    // Отправка сообщения в iframe чата
    function sendMessageToChat(action, data = {}) {
        const iframe = document.getElementById('chat-widget-iframe');
        if (iframe && iframe.contentWindow) {
            const message = {
                type: 'chatAction',
                action: action,
                ...data
            };
            iframe.contentWindow.postMessage(message, '*');
        }
    }
    
    // Открыть чат программно
    function openChat() {
        sendMessageToChat('openChat');
    }
    
    // Закрыть чат программно
    function closeChat() {
        sendMessageToChat('closeChat');
    }
    
    // Полностью закрыть чат программно
    function fullCloseChat() {
        sendMessageToChat('fullClose');
    }
    
    // Экспортируем публичные методы
    window.SiteChat = {
        open: openChat,
        close: closeChat,
        fullClose: fullCloseChat
    };
    
    // Загружаем виджет при загрузке страницы с небольшой задержкой
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(loadChatWidget, 1000);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(loadChatWidget, 1000);
        });
    }
})(); 