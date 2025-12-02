# Быстрая очистка базы данных

## Способ 1: Через API endpoint (самый простой)

```bash
curl -X POST http://130.61.200.70:8080/api/clear
```

Или через PowerShell (Windows):
```powershell
Invoke-WebRequest -Uri "http://130.61.200.70:8080/api/clear" -Method POST
```

## Способ 2: Через SSH (если API не работает)

```bash
# Подключитесь к серверу
ssh ubuntu@130.61.200.70

# Перейдите в директорию сервера
cd ~/lms-server/server

# Остановите сервер
sudo systemctl stop lms-api

# Очистите базу данных
sqlite3 quiz_data.db <<EOF
DELETE FROM saved_answers;
DELETE FROM statistics;
VACUUM;
EOF

# Или удалите файл базы данных полностью (будет пересоздан)
rm quiz_data.db

# Запустите сервер
sudo systemctl start lms-api

# Проверьте статус
sudo systemctl status lms-api
```

## Проверка очистки

```bash
# Через API
curl http://130.61.200.70:8080/api/db/stats

# Должно вернуть: {"savedAnswers": 0, "statistics": 0, ...}
```

