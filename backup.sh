#!/bin/bash

# Скрипт резервного копирования базы данных
# Запускать через cron: 0 3 * * * ~/www/prava-online-shop.ru/backup.sh

# Директория для бэкапов
BACKUP_DIR="/home/u3070370/backups"
mkdir -p $BACKUP_DIR

# Текущая дата
DATE=$(date +%Y-%m-%d)

# Директория проекта
PROJECT_DIR="/www/prava-online-shop.ru"

# Создаем бэкап базы данных
echo "Создание резервной копии базы данных..."
cp $PROJECT_DIR/chat_db.sqlite $BACKUP_DIR/chat_db_$DATE.sqlite

# Создаем архив всего проекта (опционально)
# echo "Создание архива проекта..."
# tar -czf $BACKUP_DIR/prava-online-shop_$DATE.tar.gz -C / $PROJECT_DIR --exclude='venv'

# Удаляем старые бэкапы (оставляем только за последние 30 дней)
echo "Удаление старых резервных копий..."
find $BACKUP_DIR -name "chat_db_*.sqlite" -mtime +30 -delete
# find $BACKUP_DIR -name "prava-online-shop_*.tar.gz" -mtime +30 -delete

echo "Резервное копирование завершено: $(date)" 