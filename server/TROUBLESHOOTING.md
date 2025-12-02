# Устранение проблем с подключением

## Проблема: ERR_CONNECTION_TIMED_OUT

### Проверка 1: Сервер слушает на правильном адресе

```bash
# На сервере проверьте, на каком адресе слушает сервер
sudo netstat -tlnp | grep 3000
# или
sudo ss -tlnp | grep 3000
```

Должно быть: `0.0.0.0:3000` или `*:3000` (не `127.0.0.1:3000`)

### Проверка 2: Firewall на сервере

```bash
# Проверьте статус UFW
sudo ufw status

# Если UFW активен, откройте порт
sudo ufw allow 3000/tcp
sudo ufw reload
```

### Проверка 3: Security List в Oracle Cloud

Убедитесь, что правило добавлено:
- Source CIDR: `0.0.0.0/0`
- Protocol: TCP
- Port: 3000

### Проверка 4: Сервис запущен

```bash
sudo systemctl status lms-api
curl http://localhost:3000/api/health
```

### Проверка 5: Публичный IP

```bash
# На сервере
curl ifconfig.me
hostname -I
```

Убедитесь, что используете правильный публичный IP.

### Проверка 6: Сервер слушает на 0.0.0.0

В `server.js` должно быть:
```javascript
app.listen(PORT, '0.0.0.0', () => {
```

Если указано `localhost` или `127.0.0.1`, измените на `0.0.0.0`.

