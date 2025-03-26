<?php
/**
 * PHP-прокси для перенаправления запросов на локальный Flask-сервер
 * Позволяет обмениваться данными между веб-страницами и Flask API на одном домене
 */

// Включаем вывод ошибок для отладки
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Внутренний локальный URL Flask-сервера (теперь это запускается на том же сервере)
$flaskUrl = 'http://localhost:5000';

// Получаем путь запроса
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);

// Удаляем '/chat-api.php' из пути, чтобы получить правильный маршрут для Flask
$path = str_replace('/chat-api.php', '', $path);

// Формируем целевой URL
$targetUrl = $flaskUrl . $path;

// Заголовки для CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

// Если это префлайт-запрос OPTIONS, возвращаем только заголовки
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('HTTP/1.1 200 OK');
    exit;
}

// Получаем заголовки запроса
$headers = [];
foreach ($_SERVER as $key => $value) {
    if (substr($key, 0, 5) === 'HTTP_') {
        $headerKey = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        // Пропускаем некоторые заголовки
        if ($headerKey != 'Host' && $headerKey != 'Connection') {
            $headers[] = "$headerKey: $value";
        }
    }
}

// Инициализируем cURL
$ch = curl_init();

// Настраиваем параметры cURL
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Устанавливаем метод запроса
$method = $_SERVER['REQUEST_METHOD'];
if ($method == 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    
    // Получаем данные из тела запроса
    $postData = file_get_contents('php://input');
    if (!empty($postData)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        // Добавляем заголовок Content-Type, если он существует
        if (isset($_SERVER['CONTENT_TYPE'])) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: ' . $_SERVER['CONTENT_TYPE']]));
        }
    } else if (!empty($_POST)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($_POST));
    }
} else if ($method == 'PUT') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
} else if ($method == 'DELETE') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
} else if ($method == 'PATCH') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
} else if ($method == 'OPTIONS') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'OPTIONS');
}

// Добавляем параметры запроса, если они есть
if (!empty($_GET)) {
    $targetUrl = $targetUrl . (strpos($targetUrl, '?') === false ? '?' : '&') . http_build_query($_GET);
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
}

// Выполняем запрос
$response = curl_exec($ch);

// Проверка на ошибки
if (curl_errno($ch)) {
    // Логируем ошибку
    error_log('Ошибка cURL: ' . curl_error($ch));
    
    // Возвращаем ошибку клиенту
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode([
        'error' => 'Ошибка при выполнении запроса к Flask-серверу',
        'details' => curl_error($ch)
    ]);
    exit;
}

// Получаем информацию о запросе
$info = curl_getinfo($ch);

// Закрываем соединение
curl_close($ch);

// Устанавливаем заголовки ответа
foreach (apache_response_headers() as $key => $value) {
    // Пропускаем заголовки, которые уже будут установлены PHP
    if (!in_array(strtolower($key), ['content-length', 'connection', 'date', 'server'])) {
        header("$key: $value");
    }
}

// Устанавливаем статус ответа и Content-Type
header('HTTP/1.1 ' . $info['http_code']);
if (!empty($info['content_type'])) {
    header('Content-Type: ' . $info['content_type']);
} else {
    // Определяем Content-Type по содержимому
    if (json_decode($response) !== null) {
        header('Content-Type: application/json');
    } else {
        header('Content-Type: text/html');
    }
}

// Возвращаем ответ
echo $response; 