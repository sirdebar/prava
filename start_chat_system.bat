@echo off
echo Запуск сервера чата...

IF NOT EXIST server\venv (
    echo Создание виртуального окружения...
    python -m venv server\venv
)

echo Активация виртуального окружения...
call server\venv\Scripts\activate.bat

echo Установка зависимостей...
pip install -r server\requirements.txt

echo Запуск сервера...
cd server
python app.py

pause 