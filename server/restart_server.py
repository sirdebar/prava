#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Скрипт для перезапуска Flask сервера с WebSocket поддержкой
"""

import os
import sys
import subprocess
import signal
import time
import psutil
import platform

def find_python_process(name="app.py"):
    """Находит PID процесса Python, запущенного с указанным скриптом"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info.get('cmdline', [])
            if proc.info['name'].lower() in ('python', 'python.exe', 'pythonw.exe') and any(name in cmd for cmd in cmdline if cmd):
                return proc.info['pid']
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None

def kill_process(pid):
    """Завершает процесс с указанным PID"""
    try:
        if platform.system() == "Windows":
            os.kill(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)
        
        # Ждем завершения процесса
        timeout = 5
        start_time = time.time()
        while psutil.pid_exists(pid) and time.time() - start_time < timeout:
            time.sleep(0.1)
        
        # Если процесс не завершился, принудительно завершаем
        if psutil.pid_exists(pid):
            if platform.system() == "Windows":
                os.kill(pid, signal.SIGTERM)
            else:
                os.kill(pid, signal.SIGKILL)
        
        print(f"Процесс с PID {pid} успешно завершен")
        return True
    except Exception as e:
        print(f"Ошибка при завершении процесса {pid}: {e}")
        return False

def start_server():
    """Запускает Flask сервер"""
    try:
        # Получаем путь к текущему скрипту
        current_dir = os.path.dirname(os.path.abspath(__file__))
        app_path = os.path.join(current_dir, "app.py")
        
        # Проверяем существование файла app.py
        if not os.path.exists(app_path):
            print(f"Ошибка: файл {app_path} не найден")
            return False
        
        # Запускаем сервер в фоновом режиме
        if platform.system() == "Windows":
            # На Windows используем отдельное окно
            subprocess.Popen([sys.executable, app_path], 
                             creationflags=subprocess.CREATE_NEW_CONSOLE)
        else:
            # На Linux/Mac запускаем в фоне
            subprocess.Popen([sys.executable, app_path], 
                             stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE,
                             start_new_session=True)
        
        print("Сервер успешно запущен")
        return True
    except Exception as e:
        print(f"Ошибка при запуске сервера: {e}")
        return False

def restart_server():
    """Перезапускает Flask сервер"""
    print("Ищем запущенный сервер...")
    pid = find_python_process("app.py")
    
    if pid:
        print(f"Найден запущенный сервер (PID: {pid})")
        print("Останавливаем сервер...")
        if kill_process(pid):
            print("Сервер остановлен, запускаем новый экземпляр...")
            time.sleep(1)  # Даем время на освобождение портов
            return start_server()
        else:
            print("Не удалось остановить сервер, запуск нового экземпляра может вызвать конфликт портов")
            choice = input("Все равно запустить новый экземпляр? (y/n): ")
            if choice.lower() == 'y':
                return start_server()
            else:
                print("Операция отменена")
                return False
    else:
        print("Не найден запущенный сервер, запускаем новый экземпляр...")
        return start_server()

if __name__ == "__main__":
    print("=== Утилита перезапуска сервера ===")
    
    # Проверяем наличие необходимых модулей
    try:
        import psutil
    except ImportError:
        print("Устанавливаем необходимые зависимости...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
        import psutil
    
    # Предлагаем варианты действий
    print("\nВыберите действие:")
    print("1. Перезапустить сервер")
    print("2. Только остановить сервер")
    print("3. Только запустить сервер")
    print("q. Выход")
    
    choice = input("\nВаш выбор: ")
    
    if choice == "1":
        if restart_server():
            print("Сервер успешно перезапущен!")
        else:
            print("Не удалось перезапустить сервер.")
    elif choice == "2":
        pid = find_python_process("app.py")
        if pid:
            if kill_process(pid):
                print("Сервер успешно остановлен!")
            else:
                print("Не удалось остановить сервер.")
        else:
            print("Запущенный сервер не найден.")
    elif choice == "3":
        if start_server():
            print("Сервер успешно запущен!")
        else:
            print("Не удалось запустить сервер.")
    elif choice.lower() == "q":
        print("Выход из программы.")
    else:
        print("Неверный выбор.") 