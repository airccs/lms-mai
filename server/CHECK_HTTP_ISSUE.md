# Устранение проблемы с HTTP соединением

## Проблема: TCP соединение устанавливается, но HTTP запрос не проходит

Если `Test-NetConnection` показывает успешное TCP соединение, но `curl` не работает, проблема может быть в:

1. Сервер не отвечает на HTTP запросы
2. Проблема с HTTP протоколом
3. Сервер закрывает соединение сразу после установки

## Диагностика:

### 1. Проверка через браузер

Попробуйте открыть в браузере:
```
http://130.61.200.70:3000/api/health
```

Если работает в браузере, но не через curl - проблема в PowerShell curl.

### 2. Проверка через Invoke-WebRequest

```powershell
# В PowerShell
Invoke-WebRequest -Uri http://130.61.200.70:3000/api/health -UseBasicParsing
```

### 3. Проверка на сервере

На сервере Oracle Cloud проверьте:

```bash
# Проверьте, что сервер работает
sudo systemctl status lms-api

# Проверьте логи
sudo journalctl -u lms-api -n 50 --no-pager

# Проверьте локально
curl http://localhost:3000/api/health
```

### 4. Проверка через telnet

```powershell
# В PowerShell (если установлен telnet)
telnet 130.61.200.70 3000
```

Затем введите:
```
GET /api/health HTTP/1.1
Host: 130.61.200.70:3000

```

Нажмите Enter дважды.

## Возможные решения:

### Решение 1: Использовать Invoke-WebRequest вместо curl

В PowerShell `curl` это алиас для `Invoke-WebRequest`, который может работать по-другому:

```powershell
# Попробуйте явно использовать Invoke-WebRequest
Invoke-WebRequest -Uri http://130.61.200.70:3000/api/health -UseBasicParsing

# Или с игнорированием SSL ошибок (если используется HTTPS)
Invoke-WebRequest -Uri http://130.61.200.70:3000/api/health -UseBasicParsing -SkipCertificateCheck
```

### Решение 2: Проверить настройки сервера

Убедитесь, что сервер слушает на `0.0.0.0`:

```bash
# На сервере
sudo ss -tlnp | grep 3000
```

Должно быть: `0.0.0.0:3000` или `*:3000`

### Решение 3: Проверить логи сервера

```bash
# На сервере
sudo journalctl -u lms-api -f
```

Затем попробуйте подключиться с ПК - должны появиться записи в логах.

### Решение 4: Проверить через браузер

Откройте в браузере Chrome/Edge:
```
http://130.61.200.70:3000/api/health
```

Если работает в браузере - проблема в PowerShell curl, расширение должно работать.

### Решение 5: Проверить CORS настройки

Убедитесь, что на сервере правильно настроен CORS:

```javascript
// В server.js должно быть:
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

## Быстрая проверка:

1. **Откройте в браузере:**
   ```
   http://130.61.200.70:3000/api/health
   ```

2. **Если работает в браузере** - расширение должно работать, проблема только в PowerShell curl

3. **Если не работает в браузере** - проверьте сервер на Oracle Cloud

