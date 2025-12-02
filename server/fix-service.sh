#!/bin/bash
# Скрипт для исправления systemd service
# Использование: bash fix-service.sh

set -e

echo "🔧 Исправление systemd service..."

# Определяем пути
NODE_PATH=$(which node)
SERVER_PATH=$(pwd)
USER=$(whoami)

echo "Node path: $NODE_PATH"
echo "Server path: $SERVER_PATH"
echo "User: $USER"

# Создаем service файл с правильными путями
sudo tee /etc/systemd/system/lms-api.service > /dev/null <<EOF
[Unit]
Description=LMS MAI Quiz Solver API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SERVER_PATH
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=$NODE_PATH server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service файл обновлен с правильными путями"

# Перезагружаем systemd
sudo systemctl daemon-reload

echo "✅ Systemd перезагружен"
echo ""
echo "Теперь запустите:"
echo "  sudo systemctl start lms-api"
echo "  sudo systemctl status lms-api"
echo "  sudo journalctl -u lms-api -f"

