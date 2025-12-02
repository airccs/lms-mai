# Остановка процесса и настройка systemd

## Проблема: порт 3000 занят

Сервер уже запущен вручную. Нужно:
1. Остановить процесс на порту 3000
2. Настроить systemd service
3. Запустить через systemd

## Команды:

```bash
# 1. Найти процесс на порту 3000
sudo lsof -i :3000
# или
sudo netstat -tlnp | grep 3000

# 2. Остановить процесс (замените PID на реальный)
sudo kill <PID>
# или если не помогает:
sudo kill -9 <PID>

# 3. Посмотреть логи systemd (правильная команда)
sudo journalctl -u lms-api -n 50 --no-pager

# 4. Проверить service файл
cat /etc/systemd/system/lms-api.service

# 5. Если нужно исправить - используйте скрипт
cd ~/lms-server/server
bash fix-service.sh

# 6. Запустить через systemd
sudo systemctl start lms-api
sudo systemctl status lms-api
```

