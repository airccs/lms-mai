# Деплой на Oracle Free Tier

Пошаговая инструкция по развертыванию API сервера на Oracle Cloud Infrastructure (OCI) Free Tier.

## Требования

- Аккаунт Oracle Cloud (бесплатный)
- SSH клиент (PuTTY, OpenSSH)
- Базовые знания Linux

## Шаг 1: Создание VM Instance

1. Войдите в [Oracle Cloud Console](https://cloud.oracle.com/)
2. Перейдите в **Compute** → **Instances**
3. Нажмите **Create Instance**

### Настройки:

- **Name**: `lms-api-server`
- **Image**: Oracle Linux 8 или Ubuntu 22.04
- **Shape**: 
  - **Always Free Eligible**: AMD (1/8 OCPU, 1GB RAM) или ARM (Ampere, 24GB RAM)
  - Рекомендуется: **VM.Standard.A1.Flex** (ARM, 4 OCPU, 24GB RAM)
- **Networking**: 
  - Создайте VCN (Virtual Cloud Network) если нет
  - Выберите публичную подсеть
  - **Assign a public IPv4 address**: ✅
- **SSH Keys**: Загрузите свой публичный SSH ключ

4. Нажмите **Create**

## Шаг 2: Настройка Firewall

1. В OCI Console перейдите в **Networking** → **Virtual Cloud Networks**
2. Выберите вашу VCN
3. Перейдите в **Security Lists**
4. Выберите **Default Security List**
5. Нажмите **Add Ingress Rules**:
   - **Source Type**: CIDR
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: TCP
   - **Destination Port Range**: `3000`
   - **Description**: `LMS API Server`

6. Сохраните правило

## Шаг 3: Подключение к серверу

```bash
ssh opc@<your-server-ip>
# или для Ubuntu:
ssh ubuntu@<your-server-ip>
```

## Шаг 4: Установка Node.js

### Для Oracle Linux:

```bash
sudo dnf install -y nodejs npm
# Или используйте NodeSource для последней версии:
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
```

### Для Ubuntu:

```bash
# Установка Node.js 20.x (LTS, рекомендуется)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Или Node.js 22.x (последняя версия)
# curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
# sudo apt-get install -y nodejs
```

Проверьте установку:
```bash
node --version  # Должно быть >= 18.0.0
npm --version
```

## Шаг 5: Установка зависимостей для SQLite

### Для Oracle Linux:

```bash
sudo dnf install -y python3 make gcc gcc-c++ sqlite-devel
```

### Для Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 sqlite3
```

## Шаг 6: Загрузка кода сервера

### Вариант A: Клонирование из Git

```bash
cd ~
git clone <your-repo-url> lms-server
cd lms-server/server
npm install
```

### Вариант B: Загрузка через SCP

На локальной машине:
```bash
scp -r server/ opc@<server-ip>:~/lms-server/
```

На сервере:
```bash
cd ~/lms-server
npm install
```

## Шаг 7: Настройка и запуск

### Создание systemd service (рекомендуется)

```bash
sudo nano /etc/systemd/system/lms-api.service
```

Вставьте:

```ini
[Unit]
Description=LMS MAI Quiz Solver API Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/lms-server/server
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Важно:** Замените `ubuntu` на ваше имя пользователя, если оно отличается. Также проверьте путь к node:
```bash
which node  # Может быть /usr/local/bin/node или /usr/bin/node
```

Сохраните и запустите:

```bash
sudo systemctl daemon-reload
sudo systemctl enable lms-api
sudo systemctl start lms-api
sudo systemctl status lms-api
```

### Проверка работы

```bash
curl http://localhost:3000/api/health
```

Должен вернуться: `{"status":"ok","timestamp":...}`

### ⚠️ ВАЖНО: Настройка iptables для Ubuntu

**Критически важно!** В Ubuntu образах Oracle Cloud по умолчанию настроен iptables с правилом `REJECT`, которое блокирует весь трафик, кроме явно разрешенного. Даже если Security List настроен правильно, **необходимо добавить правило в iptables** для порта 3000:

```bash
# Добавьте правило для порта 3000
sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT

# Проверьте правило
sudo iptables -L -n -v | grep 3000

# Сохраните правило, чтобы оно не пропало после перезагрузки
sudo apt-get update
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

**Без этого правила сервер будет недоступен извне**, даже если все остальные настройки правильные!

Подробнее см. `server/FIX_IPTABLES.md` и `server/SOLUTION_SUMMARY.md`

## Шаг 8: Настройка домена (опционально)

### Использование Nginx как reverse proxy

1. Установите Nginx:
```bash
sudo dnf install -y nginx  # Oracle Linux
# или
sudo apt-get install -y nginx  # Ubuntu
```

2. Создайте конфигурацию:
```bash
sudo nano /etc/nginx/conf.d/lms-api.conf
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

3. Перезапустите Nginx:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

4. Настройте SSL с Let's Encrypt:
```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Шаг 9: Обновление расширения

В файле `js/background.js` измените:

```javascript
const fixedApiUrl = 'https://your-domain.com';  // или http://your-server-ip:3000
```

Пересоберите расширение:
```bash
npm run build:prod
```

## Мониторинг и логи

```bash
# Просмотр логов
sudo journalctl -u lms-api -f

# Перезапуск сервиса
sudo systemctl restart lms-api

# Проверка статуса
sudo systemctl status lms-api
```

## Резервное копирование базы данных

```bash
# Создать бэкап
cp ~/lms-server/server/quiz_data.db ~/backup-$(date +%Y%m%d).db

# Автоматический бэкап (добавьте в crontab)
crontab -e
# Добавьте:
0 2 * * * cp /home/opc/lms-server/server/quiz_data.db /home/opc/backups/quiz_data-$(date +\%Y\%m\%d).db
```

## Миграция на Oracle Autonomous Database (опционально)

Если хотите использовать Oracle Database вместо SQLite:

1. Создайте Autonomous Database в OCI Console
2. Установите Oracle Instant Client на сервере
3. Используйте `oracledb` npm пакет вместо `better-sqlite3`
4. Обновите код для работы с Oracle DB

## Troubleshooting

### Порт не открыт
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Сервис не запускается
```bash
# Проверьте логи
sudo journalctl -u lms-api -n 50

# Проверьте права доступа
ls -la ~/lms-server/server/
```

### База данных заблокирована
```bash
# Остановите сервис
sudo systemctl stop lms-api

# Удалите lock файл (если есть)
rm ~/lms-server/server/quiz_data.db-journal

# Запустите снова
sudo systemctl start lms-api
```

## Производительность

Для оптимизации на Oracle Free Tier:

1. Используйте ARM instance (больше RAM)
2. Настройте Nginx кэширование
3. Регулярно делайте бэкапы БД
4. Мониторьте использование ресурсов:
```bash
htop
df -h
free -h
```

## Безопасность

1. Настройте firewall только для нужных портов
2. Используйте HTTPS (Let's Encrypt)
3. Регулярно обновляйте систему:
```bash
sudo dnf update  # Oracle Linux
sudo apt update && sudo apt upgrade  # Ubuntu
```

4. Настройте fail2ban для защиты от брутфорса:
```bash
sudo dnf install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

