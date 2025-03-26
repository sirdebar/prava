/**
 * Скрипт для автоматического обновления конфигурации
 * Использование: node update_config.js [локальный|продакшен]
 */

const fs = require('fs');
const path = require('path');

// Определение конфигураций
const configs = {
    local: {
        API_URL: 'http://localhost:5000',
        CHAT_ENDPOINT: '',
        WEBSOCKET_URL: 'http://localhost:5000',
        DEBUG: true
    },
    production: {
        API_URL: 'https://online-prava-shop.ru',
        CHAT_ENDPOINT: '',
        WEBSOCKET_URL: 'https://online-prava-shop.ru',
        DEBUG: false
    },
    vps: {
        API_URL: 'https://online-prava-shop.ru',
        CHAT_ENDPOINT: '',
        WEBSOCKET_URL: 'https://online-prava-shop.ru',
        DEBUG: false
    }
};

// Чтение аргументов командной строки
const args = process.argv.slice(2);
const envArg = args[0] || 'production';

// Определение окружения
let environment;
if (envArg === 'локальный' || envArg === 'local') {
    environment = 'local';
} else if (envArg === 'продакшен' || envArg === 'production') {
    environment = 'production';
} else if (envArg === 'vps') {
    environment = 'vps';
} else {
    console.error('Неизвестное окружение. Используйте: локальный, продакшен или vps');
    process.exit(1);
}

// Получение конфигурации для выбранного окружения
const config = configs[environment];

// Формирование содержимого файла
const fileContent = `/**
 * Конфигурация для чат-системы
 * ВНИМАНИЕ: Этот файл автоматически сгенерирован для окружения: ${environment}
 * Изменения в этом файле будут перезаписаны при следующем запуске скрипта
 */

// Настройки для окружения: ${environment}
const CONFIG = ${JSON.stringify(config, null, 4)};

// Экспортируем конфигурацию
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CHAT_CONFIG = CONFIG;
}
`;

// Запись файла
const configPath = path.join(__dirname, 'js', 'config.js');
fs.writeFileSync(configPath, fileContent);

console.log(`Конфигурация обновлена для окружения: ${environment}`);
console.log(`Файл сохранен: ${configPath}`);

// Обновление статических копий в server/static
try {
    const serverConfigPath = path.join(__dirname, 'server', 'static', 'js', 'config.js');
    fs.writeFileSync(serverConfigPath, fileContent);
    console.log(`Копия конфигурации для сервера сохранена: ${serverConfigPath}`);
} catch (e) {
    console.error('Ошибка при обновлении серверной копии:', e.message);
} 