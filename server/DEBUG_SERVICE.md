# Отладка systemd service

## Просмотр логов

```bash
sudo journalctl -u lms-api -n 50 --no-pager
```

## Проверка путей

```bash
# Проверьте путь к node
which node
# или
/usr/bin/node --version

# Проверьте путь к server.js
ls -la ~/lms-server/server/server.js
pwd
```

## Проверка прав доступа

```bash
# Убедитесь, что файлы доступны
ls -la ~/lms-server/server/
chmod +x ~/lms-server/server/server.js
```

## Ручной запуск для проверки

```bash
cd ~/lms-server/server
node server.js
```

Если работает вручную, но не через systemd, проблема в путях или переменных окружения.

