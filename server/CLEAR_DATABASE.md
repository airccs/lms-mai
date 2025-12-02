# Очистка базы данных на сервере

## Способ 1: Очистка через SQL команды (рекомендуется)

Подключитесь к серверу и выполните SQL команды для очистки таблиц:

```bash
# Подключитесь к серверу
ssh ubuntu@130.61.200.70

# Перейдите в директорию сервера
cd ~/lms-server/server

# Остановите сервер
sudo systemctl stop lms-api

# Очистите таблицы через sqlite3
sqlite3 quiz_data.db <<EOF
DELETE FROM saved_answers;
DELETE FROM statistics;
VACUUM;
EOF

# Или используйте Node.js для очистки
node -e "
const Database = require('better-sqlite3');
const db = new Database('quiz_data.db');
db.exec('DELETE FROM saved_answers');
db.exec('DELETE FROM statistics');
db.exec('VACUUM');
db.close();
console.log('База данных очищена');
"

# Запустите сервер обратно
sudo systemctl start lms-api

# Проверьте статус
sudo systemctl status lms-api
```

## Способ 2: Удаление файла базы данных (полная очистка)

⚠️ **Внимание**: Это удалит всю базу данных, включая структуру таблиц. Они будут пересозданы при следующем запуске сервера.

```bash
# Подключитесь к серверу
ssh ubuntu@130.61.200.70

# Перейдите в директорию сервера
cd ~/lms-server/server

# Остановите сервер
sudo systemctl stop lms-api

# Удалите файл базы данных
rm quiz_data.db

# Запустите сервер обратно (база данных будет создана автоматически)
sudo systemctl start lms-api

# Проверьте статус
sudo systemctl status lms-api
```

## Способ 3: Очистка через API endpoint (если добавлен)

Если на сервере есть endpoint для очистки:

```bash
# Очистить все данные
curl -X POST http://130.61.200.70:8080/api/clear \
  -H "Content-Type: application/json"
```

## Проверка очистки

После очистки проверьте, что данные удалены:

```bash
# Проверить количество записей в таблицах
sqlite3 quiz_data.db <<EOF
SELECT COUNT(*) as saved_answers_count FROM saved_answers;
SELECT COUNT(*) as statistics_count FROM statistics;
EOF

# Или через API
curl http://130.61.200.70:8080/api/stats
```

## Резервное копирование перед очисткой

Рекомендуется создать резервную копию перед очисткой:

```bash
# Создать резервную копию
cd ~/lms-server/server
cp quiz_data.db quiz_data.db.backup.$(date +%Y%m%d_%H%M%S)

# Восстановить из резервной копии (если нужно)
cp quiz_data.db.backup.YYYYMMDD_HHMMSS quiz_data.db
```

## Автоматическая очистка через скрипт

Создайте скрипт для удобной очистки:

```bash
# Создайте файл clear_db.sh
cat > ~/lms-server/server/clear_db.sh <<'EOF'
#!/bin/bash
echo "Остановка сервера..."
sudo systemctl stop lms-api

echo "Очистка базы данных..."
cd ~/lms-server/server
sqlite3 quiz_data.db <<SQL
DELETE FROM saved_answers;
DELETE FROM statistics;
VACUUM;
SQL

echo "Запуск сервера..."
sudo systemctl start lms-api

echo "Проверка статуса..."
sleep 2
sudo systemctl status lms-api --no-pager

echo "Готово! База данных очищена."
EOF

# Сделайте скрипт исполняемым
chmod +x ~/lms-server/server/clear_db.sh

# Использование
~/lms-server/server/clear_db.sh
```

