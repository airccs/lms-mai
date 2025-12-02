# Срочное обновление сервера

## Проблема
Endpoint `/api/db/stats` возвращает `{"error":"Not found"}` потому что сервер не был обновлен.

## Решение: Обновить сервер на Oracle VM

### Шаг 1: Подключитесь к серверу
```bash
ssh ubuntu@130.61.200.70
```

### Шаг 2: Перейдите в директорию сервера
```bash
cd ~/lms-server
```

### Шаг 3: Остановите сервер
```bash
sudo systemctl stop lms-api
```

### Шаг 4: Обновите код из репозитория
```bash
git pull
```

### Шаг 5: Проверьте, что файл server.js содержит endpoint /api/db/stats
```bash
grep -n "/api/db/stats" server/server.js
```

Должна быть строка с `app.get('/api/db/stats'`.

### Шаг 6: Запустите сервер обратно
```bash
sudo systemctl start lms-api
```

### Шаг 7: Проверьте статус
```bash
sudo systemctl status lms-api
```

### Шаг 8: Проверьте работу endpoint
```bash
curl http://localhost:8080/api/db/stats
```

Должен вернуться JSON с количеством записей:
```json
{
  "savedAnswers": 123,
  "statistics": 45,
  "timestamp": 1234567890
}
```

### Шаг 9: Проверьте извне
```bash
curl http://130.61.200.70:8080/api/db/stats
```

## Если что-то пошло не так

### Проверьте логи
```bash
sudo journalctl -u lms-api -n 50 --no-pager
```

### Проверьте, что сервер слушает порт 8080
```bash
sudo ss -tlnp | grep 8080
```

### Перезапустите сервер
```bash
sudo systemctl restart lms-api
```

## Быстрая команда (все в одной строке)
```bash
ssh ubuntu@130.61.200.70 "cd ~/lms-server && sudo systemctl stop lms-api && git pull && sudo systemctl start lms-api && sleep 2 && sudo systemctl status lms-api --no-pager"
```

