#!/bin/bash
# Скрипт для настройки systemd service
# Использование: bash setup-systemd.sh

set -e

echo "🔧 Настройка systemd service для LMS API Server..."

# Определяем путь к серверу
SERVER_PATH=$(pwd)
USER=$(whoami)

# Создаем service файл
sudo tee /etc/systemd/system/lms-api.service > /dev/null <<EOF
[Unit]
Description=LMS MAI Quiz Solver API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SERVER_PATH
Environment="PORT=3000"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service файл создан"

# Перезагружаем systemd
sudo systemctl daemon-reload

# Включаем автозапуск
sudo systemctl enable lms-api

echo "✅ Service настроен и включен"
echo ""
echo "Команды для управления:"
echo "  sudo systemctl start lms-api    # Запустить"
echo "  sudo systemctl stop lms-api     # Остановить"
echo "  sudo systemctl restart lms-api  # Перезапустить"
echo "  sudo systemctl status lms-api   # Статус"
echo "  sudo journalctl -u lms-api -f   # Логи"
echo ""
echo "Запустить сервис сейчас? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    sudo systemctl start lms-api
    sleep 2
    sudo systemctl status lms-api
fi

