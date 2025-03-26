#!/usr/bin/env python3
import os
import sys

# Путь к виртуальному окружению
VENV_PATH = os.path.join(os.getcwd(), 'venv', 'lib', 'python3.8', 'site-packages')
if os.path.exists(VENV_PATH):
    sys.path.insert(0, VENV_PATH)
else:
    # Ищем другие версии Python
    for py_ver in ['3.6', '3.7', '3.9', '3.10']:
        alt_path = os.path.join(os.getcwd(), 'venv', 'lib', f'python{py_ver}', 'site-packages')
        if os.path.exists(alt_path):
            sys.path.insert(0, alt_path)
            break

# Добавляем путь к приложению
sys.path.insert(0, os.path.join(os.getcwd(), 'server'))

# Устанавливаем переменную окружения
os.environ['WSGI_ENV'] = 'production'

# Добавляем логирование для отладки
import logging
logging.basicConfig(
    filename=os.path.join(os.getcwd(), 'python_error.log'),
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s'
)
logging.info('Инициализация WSGI приложения')

try:
    # Импортируем Flask-приложение
    from server.app import application as application
    logging.info('Приложение успешно импортировано')
except Exception as e:
    logging.error(f'Ошибка при импорте приложения: {e}')
    # Простое приложение для отладки в случае ошибки
    def application(environ, start_response):
        status = '500 Internal Server Error'
        output = b'Ошибка при запуске приложения, проверьте логи'
        response_headers = [('Content-type', 'text/plain'),
                           ('Content-Length', str(len(output)))]
        start_response(status, response_headers)
        return [output] 