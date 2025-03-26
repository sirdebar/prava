# Скрипт для обновления конфигурации чат-системы
# Использование: .\update_config.ps1 [local|production|vps]

param (
    [string]$Environment = "production"
)

# Функция для вывода сообщений с цветом
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    
    if ($args) {
        Write-Output $args
    }
    else {
        $input | Write-Output
    }
    
    $host.UI.RawUI.ForegroundColor = $fc
}

# Определяем конфигурации для разных окружений
$configs = @{
    "local" = @{
        "API_URL" = "http://localhost:5000"
        "CHAT_ENDPOINT" = ""
        "WEBSOCKET_URL" = "http://localhost:5000"
        "DEBUG" = $true
    }
    "production" = @{
        "API_URL" = "https://online-prava-shop.ru"
        "CHAT_ENDPOINT" = ""
        "WEBSOCKET_URL" = "https://online-prava-shop.ru"
        "DEBUG" = $false
    }
    "vps" = @{
        "API_URL" = "https://online-prava-shop.ru"
        "CHAT_ENDPOINT" = ""
        "WEBSOCKET_URL" = "https://online-prava-shop.ru"
        "DEBUG" = $false
    }
}

# Проверяем указанное окружение
if (-not $configs.ContainsKey($Environment)) {
    Write-ColorOutput Red "Неверное окружение. Возможные значения: local, production, vps"
    exit 1
}

# Создаем директории для файлов конфигурации, если они не существуют
$jsDir = Join-Path $PSScriptRoot "js"
$serverJsDir = Join-Path $PSScriptRoot "server\static\js"

if (-not (Test-Path $jsDir)) {
    New-Item -ItemType Directory -Force -Path $jsDir
}

if (-not (Test-Path $serverJsDir)) {
    New-Item -ItemType Directory -Force -Path $serverJsDir
}

# Получаем конфигурацию для указанного окружения
$config = $configs[$Environment]

# Конвертируем объект в JSON с отступами
$configJson = $config | ConvertTo-Json -Depth 10

# Формируем содержимое файла
$fileContent = @"
/**
 * Конфигурация для чат-системы
 * ВНИМАНИЕ: Этот файл автоматически сгенерирован для окружения: $Environment
 * Изменения в этом файле будут перезаписаны при следующем запуске скрипта
 */

// Настройки для окружения: $Environment
const CONFIG = $configJson;

// Экспортируем конфигурацию
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CHAT_CONFIG = CONFIG;
}
"@

# Пути к файлам конфигурации
$configFilePath = Join-Path $jsDir "config.js"
$serverConfigFilePath = Join-Path $serverJsDir "config.js"

# Сохраняем файлы
$fileContent | Out-File -FilePath $configFilePath -Encoding utf8
Write-ColorOutput Green "Конфигурация обновлена для окружения: $Environment"
Write-ColorOutput Green "Файл сохранен: $configFilePath"

try {
    $fileContent | Out-File -FilePath $serverConfigFilePath -Encoding utf8
    Write-ColorOutput Green "Копия конфигурации для сервера сохранена: $serverConfigFilePath"
} catch {
    Write-ColorOutput Red "Ошибка при обновлении серверной копии: $_"
}

Write-ColorOutput Yellow "ВНИМАНИЕ: Не забудьте включить config.js перед другими JS-файлами в HTML." 