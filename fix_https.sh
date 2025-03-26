#!/bin/bash

# Скрипт для замены HTTP-ссылок на HTTPS во всех HTML и JS файлах

echo "Поиск HTTP-ссылок в HTML-файлах..."
grep -r "http://" --include="*.html" .

echo "Поиск HTTP-ссылок в JS-файлах..."
grep -r "http://" --include="*.js" .

echo ""
echo "Замена HTTP на HTTPS в HTML-файлах..."
find . -name "*.html" -type f -exec sed -i 's|http://|https://|g' {} \;

echo "Замена HTTP на HTTPS в JS-файлах..."
find . -name "*.js" -type f -exec sed -i 's|http://|https://|g' {} \;

echo "Замена HTTP на HTTPS в CSS-файлах..."
find . -name "*.css" -type f -exec sed -i 's|http://|https://|g' {} \;

echo ""
echo "Проверка после замены..."
echo "Поиск оставшихся HTTP-ссылок в HTML-файлах:"
grep -r "http://" --include="*.html" .

echo "Поиск оставшихся HTTP-ссылок в JS-файлах:"
grep -r "http://" --include="*.js" .

echo ""
echo "Замена завершена!" 