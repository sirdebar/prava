#!/usr/bin/env python3
import os
import sys

# Добавляем пути для импортов
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Исправляем рабочий каталог
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Импортируем Flask-приложение
from app import app as application

# Настраиваем для CGI
from wsgiref.handlers import CGIHandler
CGIHandler().run(application) 