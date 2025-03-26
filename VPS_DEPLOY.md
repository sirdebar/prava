# Руководство по развертыванию на VPS

В этом руководстве описаны шаги для развертывания вашего сайта с чат-системой на VPS-сервере с использованием домена `online-prava-shop.ru`.

## 1. Подготовка домена

1. Убедитесь, что домен `online-prava-shop.ru` зарегистрирован и DNS-записи настроены на IP-адрес вашего VPS.
2. Для правильной работы нужны следующие DNS-записи:
   ```
   online-prava-shop.ru.     A     <IP-адрес вашего VPS>
   www.online-prava-shop.ru. CNAME online-prava-shop.ru.
   ```

## 2. Настройка VPS

### Требования к серверу:
- Ubuntu 20.04 LTS или новее
- Минимум 1 ГБ оперативной памяти
- Минимум 20 ГБ дискового пространства
- Открытые порты 80, 443, 22

### Подключение к VPS

```bash
ssh root@<IP-адрес вашего VPS>
```

### Установка базовых компонентов

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка необходимых пакетов
apt install -y git unzip python3 python3-pip python3-venv nginx certbot python3-certbot-nginx ufw
```

## 3. Развертывание проекта

### Клонирование или копирование файлов проекта

Вариант 1: Загрузка архива напрямую на сервер:
```bash
cd /opt
mkdir prava-chat
cd prava-chat
# Загрузите ваш архив проекта и распакуйте его
```

Вариант 2: Через Git (если вы используете Git):
```bash
cd /opt
git clone <URL вашего репозитория> prava-chat
```

### Настройка скрипта установки

```bash
cd /opt/prava-chat
chmod +x server/setup_vps.sh
```

### Запуск скрипта установки

```bash
cd /opt/prava-chat
./server/setup_vps.sh
```

Этот скрипт автоматически выполнит следующие действия:
- Создаст необходимые директории
- Настроит виртуальное окружение Python
- Установит зависимости
- Настроит Nginx
- Получит SSL-сертификаты через Let's Encrypt
- Настроит и запустит systemd-службу для Flask-приложения

## 4. Проверка установки

После завершения установки проверьте:

1. Доступность основного сайта: `https://online-prava-shop.ru`
2. Доступность админ-панели: `https://online-prava-shop.ru/admin`
3. Работу чата на главной странице

## 5. Проверка службы и логов

### Проверка статуса службы:
```bash
systemctl status prava-chat.service
```

### Просмотр логов:
```bash
tail -f /var/log/prava-chat/error.log  # Логи Flask-приложения
tail -f /var/log/nginx/error.log       # Логи Nginx
```

## 6. Обновление проекта в будущем

Для обновления кода на сервере:

```bash
cd /opt/prava-chat
# Обновите файлы вашим предпочтительным методом (git pull, ftp, scp и т.д.)

# Перезапустите службы
systemctl restart prava-chat.service
systemctl reload nginx
```

## Устранение неполадок

### Проблемы с SSL-сертификатами
```bash
certbot --nginx -d online-prava-shop.ru -d www.online-prava-shop.ru
```

### Проблемы с Nginx
```bash
nginx -t  # Проверка конфигурации
systemctl restart nginx
```

### Проблемы с Flask-приложением
```bash
systemctl restart prava-chat.service
journalctl -u prava-chat.service  # Подробные логи
```

## Примечания по безопасности

1. Настройте надежный пароль для аккаунта администратора в админ-панели
2. Регулярно обновляйте систему: `apt update && apt upgrade -y`
3. Рассмотрите установку и настройку брандмауэра:
   ```bash
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow ssh
   ufw allow 'Nginx Full'
   ufw enable
   ```

## Контакты для поддержки

Если у вас возникнут проблемы с установкой или настройкой, обратитесь за помощью. 