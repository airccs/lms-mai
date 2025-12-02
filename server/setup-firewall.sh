#!/bin/bash
# Скрипт для настройки firewall
# Использование: bash setup-firewall.sh

set -e

echo "🔥 Настройка firewall для LMS API Server..."

# Проверяем, какой firewall используется
if command -v ufw &> /dev/null; then
    echo "Используется UFW"
    sudo ufw allow 3000/tcp
    sudo ufw status
elif command -v firewall-cmd &> /dev/null; then
    echo "Используется firewalld"
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --reload
    sudo firewall-cmd --list-ports
else
    echo "⚠️  Firewall не найден. Убедитесь, что порт 3000 открыт в Security List Oracle Cloud!"
fi

echo ""
echo "✅ Firewall настроен"
echo ""
echo "⚠️  ВАЖНО: Также откройте порт 3000 в Oracle Cloud Console:"
echo "   1. Networking → Virtual Cloud Networks"
echo "   2. Выберите вашу VCN"
echo "   3. Security Lists → Default Security List"
echo "   4. Add Ingress Rules:"
echo "      - Source: 0.0.0.0/0"
echo "      - Port: 3000"
echo "      - Protocol: TCP"

