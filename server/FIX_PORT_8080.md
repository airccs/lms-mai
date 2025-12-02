# Исправление проблемы с портом 8080

## Проблема
`http://130.61.200.70:8080/api/stats` не открывается.

## Диагностика на сервере

### 1. Проверьте статус сервиса

```bash
sudo systemctl status lms-api
```

### 2. Проверьте, на каком порту слушает сервер

```bash
sudo ss -tlnp | grep node
# или
sudo ss -tlnp | grep 8080
```

Должно быть: `0.0.0.0:8080` (не `127.0.0.1:8080`)

### 3. Проверьте конфигурацию systemd сервиса

```bash
sudo cat /etc/systemd/system/lms-api.service
```

Должно быть:
```ini
[Service]
Environment="PORT=8080"
ExecStart=/usr/bin/node server.js
```

### 4. Если PORT не установлен, обновите сервис

```bash
sudo nano /etc/systemd/system/lms-api.service
```

Добавьте или измените:
```ini
[Service]
Environment="PORT=8080"
WorkingDirectory=/home/ubuntu/lms-server/server
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu
```

Затем:
```bash
sudo systemctl daemon-reload
sudo systemctl restart lms-api
sudo systemctl status lms-api
```

### 5. Проверьте локально на сервере

```bash
curl http://localhost:8080/api/health
```

Должен вернуться: `{"status":"ok","timestamp":...}`

### 6. Проверьте iptables правила

```bash
sudo iptables -L -n -v | grep 8080
```

Если порт 8080 не открыт, добавьте правило:

```bash
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
# или для Ubuntu
sudo netfilter-persistent save
```

### 7. Проверьте Oracle Cloud Security List

1. Откройте Oracle Cloud Console
2. Перейдите в **Networking** → **Virtual Cloud Networks**
3. Выберите вашу VCN
4. Откройте **Security Lists**
5. Выберите Security List для вашей подсети
6. Проверьте **Ingress Rules**

Должно быть правило:
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `8080`

Если правила нет, добавьте его.

### 8. Проверьте логи сервера

```bash
sudo journalctl -u lms-api -n 50 --no-pager
```

Ищите строки:
- `🚀 LMS MAI Quiz Solver API Server running on port 8080`
- `🌐 Health check: http://localhost:8080/api/health`

## Быстрое исправление

Если сервер не запущен на порту 8080:

```bash
# 1. Остановите сервис
sudo systemctl stop lms-api

# 2. Обновите systemd сервис
sudo nano /etc/systemd/system/lms-api.service
```

Добавьте/измените:
```ini
[Unit]
Description=LMS MAI Quiz Solver API Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/lms-server/server
Environment="PORT=8080"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 3. Перезагрузите systemd
sudo systemctl daemon-reload

# 4. Откройте порт в iptables
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# 5. Запустите сервис
sudo systemctl start lms-api
sudo systemctl enable lms-api

# 6. Проверьте статус
sudo systemctl status lms-api
sudo ss -tlnp | grep 8080
curl http://localhost:8080/api/health
```

## Проверка с вашего ПК

После исправления на сервере, проверьте с вашего ПК:

```powershell
# PowerShell
Test-NetConnection -ComputerName 130.61.200.70 -Port 8080

# Должно быть: TcpTestSucceeded : True
```

```bash
# Или curl
curl http://130.61.200.70:8080/api/health
```

## ⚠️ ВАЖНО: Сохранение iptables правил

После добавления правила для порта 8080, **обязательно сохраните правила**, иначе они сбросятся после перезагрузки:

```bash
# Для Ubuntu/Debian с netfilter-persistent
sudo netfilter-persistent save

# Или для систем с iptables-save
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# Проверьте, что правило сохранилось
sudo iptables -L -n -v | grep 8080
```

## Если все еще не работает

1. Проверьте, что сервер действительно слушает на `0.0.0.0:8080`:
   ```bash
   sudo ss -tlnp | grep 8080
   ```

2. Проверьте, что порт открыт в Oracle Cloud Security List для порта 8080

3. **Проверьте iptables правила** (часто это основная причина):
   ```bash
   sudo iptables -L -n -v | grep 8080
   ```

4. Проверьте, что нет блокировки на уровне роутера/провайдера

5. Попробуйте временно отключить firewall на сервере для теста:
   ```bash
   sudo ufw disable
   # Проверьте доступ
   # Затем включите обратно: sudo ufw enable
   ```

