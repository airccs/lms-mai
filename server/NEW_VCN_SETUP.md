# Настройка новой VCN для LMS API Server

## Шаг 1: Создание VCN

1. **Networking** → **Virtual Cloud Networks** → **Create VCN**
2. Заполните:
   - **VCN name**: `lms-api-vcn` (или любое другое имя)
   - **Compartment**: выберите ваш compartment
   - **VCN IPv4 CIDR block**: `10.0.0.0/16` (или другой диапазон)
   - **Enable IPv6**: оставьте выключенным
   - **Use DNS hostnames**: включите (рекомендуется)
3. Нажмите **Create VCN**

## Шаг 2: Настройка Public Subnet

1. В созданной VCN перейдите в **Subnets**
2. Должна быть создана **Public Subnet** автоматически
3. Если нет, создайте:
   - **Subnet name**: `public-subnet`
   - **Subnet type**: **Regional** (Public Subnet)
   - **IPv4 CIDR block**: `10.0.0.0/24` (или часть вашего VCN CIDR)
   - **Route table**: выберите **Default Route Table for vcn**
   - **Security List**: выберите **Default Security List for vcn**

## Шаг 3: Настройка Internet Gateway

1. В VCN перейдите в **Internet Gateways**
2. Должен быть создан автоматически
3. Если нет, создайте:
   - **Name**: `internet-gateway`
   - **Type**: **Internet Gateway**

## Шаг 4: Настройка Route Table

1. В VCN перейдите в **Route Tables**
2. Выберите **Default Route Table for vcn**
3. В **Route Rules** добавьте:
   - **Target Type**: **Internet Gateway**
   - **Destination CIDR Block**: `0.0.0.0/0`
   - **Target Internet Gateway**: выберите созданный Internet Gateway

## Шаг 5: Настройка Security List

1. В VCN перейдите в **Security Lists**
2. Выберите **Default Security List for vcn**
3. В **Ingress Rules** добавьте правила:

### Правило 1: SSH (порт 22)
- **Source Type**: CIDR
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `22`
- **Description**: `SSH`

### Правило 2: API Server (порт 3000)
- **Source Type**: CIDR
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `3000`
- **Description**: `LMS API Server`

## Шаг 6: Создание нового Instance

1. **Compute** → **Instances** → **Create Instance**
2. Настройки:
   - **Name**: `lms-api-server`
   - **Image**: Ubuntu 22.04
   - **Shape**: VM.Standard.A1.Flex (ARM, бесплатно)
   - **Networking**: 
     - Выберите созданную VCN
     - Выберите **Public Subnet**
     - **Assign a public IPv4 address**: ✅ Включите!
   - **SSH Keys**: загрузите ваш публичный ключ
3. Нажмите **Create**

## Шаг 7: Установка и настройка сервера

После создания instance подключитесь и выполните:

```bash
# Установка Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка зависимостей
sudo apt-get update
sudo apt-get install -y build-essential python3 sqlite3

# Клонирование репозитория
cd ~
git clone https://github.com/airccs/lms-mai lms-server
cd lms-server/server
npm install

# Настройка systemd service
sudo nano /etc/systemd/system/lms-api.service
```

Вставьте в service файл:
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

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable lms-api
sudo systemctl start lms-api
sudo systemctl status lms-api
```

## Проверка

```bash
# На сервере
curl http://localhost:3000/api/health

# С вашего компьютера
curl http://<публичный-ip>:3000/api/health
```

## Альтернатива: Перемещение существующего instance

Если не хотите создавать новый instance, можно:
1. Остановить текущий instance
2. Изменить VNIC и привязать к новой VCN
3. Запустить instance

Но проще создать новый instance в новой VCN.

