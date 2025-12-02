# Исправление проблемы с портом 80

## Проблема: Сервис не запускается на порту 80

Порт 80 требует прав root или может быть занят другим процессом.

## Решение 1: Использовать порт 8080 (рекомендуется)

Порт 8080 часто не блокируется роутерами и не требует root прав.

### На сервере:

```bash
# Остановите сервис
sudo systemctl stop lms-api

# Отредактируйте service файл
sudo nano /etc/systemd/system/lms-api.service
```

Измените:
```ini
Environment="PORT=8080"
```

```bash
# Перезапустите
sudo systemctl daemon-reload
sudo systemctl restart lms-api
sudo systemctl status lms-api

# Добавьте правило в iptables
sudo iptables -I INPUT 5 -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save
```

### В Oracle Cloud:

- Добавьте правило для порта 8080 в Security List (если еще нет)

### В расширении:

Нужно будет изменить URL на `http://130.61.200.70:8080`

## Решение 2: Использовать порт 80 с правами root

Если нужно использовать именно порт 80:

```bash
# Проверьте, не занят ли порт 80
sudo lsof -i :80
sudo ss -tlnp | grep 80

# Если порт занят, остановите процесс или используйте другой порт
```

Порт 80 обычно требует запуска от root, но Node.js может работать и без root, если порт свободен.

## Решение 3: Использовать порт 3000 (если работает)

Если порт 3000 работает с мобильной сети, можно оставить его:

```bash
# Верните порт 3000
sudo nano /etc/systemd/system/lms-api.service
```

```ini
Environment="PORT=3000"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart lms-api
```

## Проверка логов:

```bash
# Проверьте логи ошибок
sudo journalctl -u lms-api -n 50 --no-pager
```

Это покажет, почему сервис не запускается.

