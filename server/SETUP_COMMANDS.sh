#!/bin/bash
# Скрипт для быстрой настройки сервера на Oracle Free Tier
# Использование: bash SETUP_COMMANDS.sh

set -e  # Остановка при ошибке

echo "🚀 Настройка LMS API Server на Oracle Free Tier"
echo "================================================"

# Обновление системы
echo "📦 Обновление системы..."
sudo apt-get update
sudo apt-get upgrade -y

# Установка Node.js 20.x (LTS)
echo "📦 Установка Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версии
echo "✅ Node.js версия:"
node --version
npm --version

# Установка зависимостей для SQLite
echo "📦 Установка зависимостей для SQLite..."
sudo apt-get install -y build-essential python3 sqlite3

# Создание директории для проекта
echo "📁 Создание директории проекта..."
mkdir -p ~/lms-server
cd ~/lms-server

echo "✅ Базовая настройка завершена!"
echo ""
echo "Следующие шаги:"
echo "1. Загрузите файлы сервера в ~/lms-server/server/"
echo "2. cd ~/lms-server/server && npm install"
echo "3. npm start"
echo ""
echo "Или используйте git clone для загрузки проекта"

