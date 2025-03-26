"""
Конфигурация Gunicorn для запуска Flask-приложения в продакшен-окружении
"""
import multiprocessing

# Привязка к сокету
bind = "unix:/tmp/prava-chat.sock"

# Рабочие процессы
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "eventlet"  # Используем eventlet для поддержки WebSocket

# Таймауты
timeout = 120
keepalive = 5

# Логи
errorlog = "/var/log/prava-chat/error.log"
accesslog = "/var/log/prava-chat/access.log"
loglevel = "info"

# Рабочий каталог
chdir = "/opt/prava-chat/server"

# PID-файл
pidfile = "/tmp/prava-chat.pid"

# Безопасность
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190 