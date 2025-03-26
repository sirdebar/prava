#!/bin/bash
# Скрипт для настройки VPS и развертывания чат-системы

# Проверка прав root
if [ "$(id -u)" -ne 0 ]; then
   echo "Этот скрипт должен быть запущен с правами root" 
   exit 1
fi

# Переменные конфигурации
DOMAIN="online-prava-shop.ru"
EMAIL="admin@online-prava-shop.ru"
INSTALL_DIR="/opt/prava-chat"
LOG_DIR="/var/log/prava-chat"

echo "===== Настройка сервера для домена $DOMAIN ====="

# Обновление системы
echo "Обновление системы..."
apt update && apt upgrade -y

# Установка необходимых пакетов
echo "Установка необходимых пакетов..."
apt install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx ufw unzip git

# Создание директорий для проекта
echo "Создание директорий для проекта..."
mkdir -p $INSTALL_DIR
mkdir -p $LOG_DIR

# Настройка прав доступа
chown -R www-data:www-data $INSTALL_DIR
chown -R www-data:www-data $LOG_DIR

# Копирование файлов проекта (предполагается, что они находятся в текущем каталоге)
echo "Копирование файлов проекта..."
cp -r . $INSTALL_DIR/
cd $INSTALL_DIR

# Создание и активация виртуального окружения Python
echo "Настройка Python виртуального окружения..."
python3 -m venv server/venv
source server/venv/bin/activate
pip install --upgrade pip
pip install -r server/requirements.txt

# Настройка службы systemd
echo "Настройка службы systemd..."
cp server/prava-chat.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable prava-chat.service

# Настройка Nginx
echo "Настройка Nginx..."
sed -i "s/online-prava-shop.ru/$DOMAIN/g" server/nginx-config.conf
cp server/nginx-config.conf /etc/nginx/sites-available/$DOMAIN.conf
ln -s /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации Nginx
nginx -t

# Настройка брандмауэра
echo "Настройка брандмауэра..."
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

# Запуск Nginx
systemctl restart nginx

# Получение SSL-сертификата
echo "Получение SSL-сертификата..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL

# Запуск службы чата
echo "Запуск службы чата..."
systemctl start prava-chat.service

# Проверка статуса
echo "Проверка статуса службы..."
systemctl status prava-chat.service

echo "=================================================================="
echo "Настройка сервера завершена!"
echo "Сайт и чат-система доступны по адресу: https://$DOMAIN"
echo ""
echo "Полезные команды для управления:"
echo "  - Проверить статус службы: systemctl status prava-chat.service"
echo "  - Перезапустить службу: systemctl restart prava-chat.service"
echo "  - Посмотреть логи: tail -f $LOG_DIR/error.log"
echo "  - Перезагрузить Nginx: systemctl restart nginx"
echo "==================================================================" 