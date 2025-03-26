#!/bin/bash

# Скрипт для настройки проекта на хостинге reg.ru
echo "Настройка проекта на хостинге..."

# Определяем текущую директорию
CURRENT_DIR=$(pwd)
echo "Директория проекта: $CURRENT_DIR"

# Проверяем версию Python
echo "Проверка версии Python..."
python3 --version

# Создание виртуального окружения
echo "Создание виртуального окружения Python..."
python3 -m venv venv
source venv/bin/activate

# Установка зависимостей
echo "Установка зависимостей..."
pip install --upgrade pip
pip install -r server/requirements.txt
pip install gunicorn eventlet flask-socketio==5.3.0

# Проверка доступности директорий
echo "Проверка и создание необходимых директорий..."
mkdir -p server/static
mkdir -p server/templates
mkdir -p server/backups

# Настройка прав доступа
echo "Настройка прав доступа для файлов и директорий..."
chmod 755 passenger_wsgi.py
chmod 755 .htaccess
chmod -R 755 server/
chmod -R 755 js/
chmod -R 755 css/
chmod -R 755 images/
chmod -R 755 venv/bin/

# Инициализация базы данных
echo "Инициализация базы данных..."
if [ ! -f chat_db.sqlite ]; then
    python3 << 'EOL'
import sys
import os
sys.path.insert(0, os.path.join(os.getcwd(), 'server'))
from server.app import init_db
init_db()
print("База данных инициализирована")
EOL

    # Устанавливаем корректные права доступа для базы данных
    chmod 664 chat_db.sqlite
    echo "База данных создана и настроена"
else
    echo "База данных уже существует"
fi

# Проверка конфигурации
echo "Проверка конфигурации..."
if [ -f .htaccess ] && [ -f passenger_wsgi.py ]; then
    echo "Файлы конфигурации (.htaccess и passenger_wsgi.py) найдены"
else
    echo "ОШИБКА: Не найдены необходимые файлы конфигурации!"
    exit 1
fi

# Создание тестового лог-файла для проверки прав доступа
touch python_error.log
chmod 664 python_error.log

echo ""
echo "======================================================================================="
echo "Настройка завершена успешно!"
echo "Теперь вы можете перейти в браузере на https://prava-online-shop.ru для проверки сайта"
echo "Если сайт не работает, проверьте логи в файле python_error.log"
echo "Административная панель доступна по адресу https://prava-online-shop.ru/admin"
echo "Логин: admin  Пароль: admin123 (рекомендуется сменить после первого входа)"
echo "=======================================================================================" 