# Проверка Network Security Groups (NSG)

## ⚠️ КРИТИЧНО: NSG может блокировать трафик!

**Network Security Groups (NSG)** - это отдельный уровень защиты в Oracle Cloud, который работает **ПОВЕРХ** Security List. Если NSG привязан к вашему instance, он может блокировать весь трафик, даже если Security List настроен правильно!

## Шаг 1: Проверка, есть ли NSG у вашего instance

1. **Compute** → **Instances** → выберите `lms-api-server`
2. Прокрутите вниз до раздела **Attached VNICs**
3. Нажмите на **VNIC** (обычно называется `Primary VNIC`)
4. В разделе **Network Security Groups** проверьте:
   - Если список **пустой** - NSG не используется, проблема в другом месте
   - Если есть NSG (например, `Default NSG for lms-api-server`) - **это может быть проблемой!**

## Шаг 2: Если NSG есть - проверьте правила

1. **Networking** → **Network Security Groups**
2. Выберите NSG, привязанный к вашему instance
3. Перейдите на вкладку **Security Rules** → **Ingress Rules**
4. Проверьте, есть ли правило для порта 3000:
   - **Source Type**: CIDR
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: TCP
   - **Destination Port Range**: `3000`

## Шаг 3: Если правила нет - добавьте его

1. В NSG нажмите **Add Ingress Rules**
2. Заполните:
   - **Source Type**: CIDR
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: TCP
   - **Destination Port Range**: `3000`
   - **Description**: `LMS API Server`
3. Нажмите **Add Ingress Rules**

## Шаг 4: Альтернатива - отключить NSG (если не нужен)

Если вы не используете NSG специально, можно его отключить:

1. **Compute** → **Instances** → `lms-api-server`
2. **Attached VNICs** → нажмите на VNIC
3. В разделе **Network Security Groups** нажмите **Edit**
4. Уберите все NSG из списка
5. Сохраните

⚠️ **Внимание**: Отключайте NSG только если вы уверены, что используете только Security List!

## Шаг 5: Проверка после изменений

После добавления правила в NSG или его отключения:

1. Подождите **2-3 минуты** (изменения применяются не мгновенно)
2. Запустите мониторинг логов:
   ```bash
   sudo journalctl -u lms-api -f
   ```
3. С вашего компьютера попробуйте:
   ```bash
   curl -v http://130.61.200.70:3000/api/health
   ```
4. Проверьте, появились ли записи в логах

## Если NSG нет, но проблема остается

Если NSG не используется, проверьте:

1. ✅ **Security List** - правило для порта 3000 есть (уже проверено)
2. ✅ **Route Table** - маршрут `0.0.0.0/0` → Internet Gateway (уже проверено)
3. ✅ **Internet Gateway** - прикреплен к VCN (уже проверено)
4. ✅ **Subnet** - Public Subnet (уже проверено)
5. ✅ **Public IP** - назначен instance (уже проверено)
6. ❓ **Firewall на уровне ОС** - проверьте UFW:
   ```bash
   sudo ufw status
   sudo ufw allow 3000/tcp
   ```
7. ❓ **Проблема с Oracle Cloud Load Balancer или NAT Gateway** - если используется

## Дополнительная диагностика

Если ничего не помогает, попробуйте:

1. **Временно откройте порт 80** (HTTP) для теста:
   - Добавьте правило в Security List для порта 80
   - Измените PORT в `server.js` на 80
   - Перезапустите сервис
   - Попробуйте `http://130.61.200.70/api/health`

2. **Проверьте, работает ли SSH извне**:
   - Если SSH работает (порт 22), значит сеть настроена правильно
   - Проблема может быть специфична для порта 3000

3. **Проверьте логи Oracle Cloud**:
   - **Networking** → **Virtual Cloud Networks** → ваша VCN
   - **Flow Logs** - если включены, проверьте, видны ли запросы

