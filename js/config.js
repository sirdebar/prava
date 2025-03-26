/**
 * Конфигурация для чат-системы
 * ВНИМАНИЕ: Файл настроен для работы с VPS
 */

// Настройки для продакшена на домене online-prava-shop.ru
const CONFIG = {
    API_URL: "https://online-prava-shop.ru",
    CHAT_ENDPOINT: "",
    WEBSOCKET_URL: "https://online-prava-shop.ru",
    DEBUG: false
};

// Экспортируем конфигурацию
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CHAT_CONFIG = CONFIG;
} 