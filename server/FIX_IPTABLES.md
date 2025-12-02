# Исправление iptables для порта 3000

## Проблема найдена!

В iptables есть правило `REJECT`, которое блокирует весь трафик, не соответствующий предыдущим правилам. Порт 3000 не разрешен, поэтому все запросы блокируются.

## Решение: Добавить правило для порта 3000

### Вариант 1: Временное решение (для теста)

```bash
# Добавьте правило для порта 3000 ПЕРЕД правилом REJECT
sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT

# Проверьте правила
sudo iptables -L -n -v | grep 3000

# Попробуйте подключиться извне
```

### Вариант 2: Постоянное решение

Чтобы правило сохранилось после перезагрузки:

```bash
# Установите iptables-persistent
sudo apt-get update
sudo apt-get install -y iptables-persistent

# Добавьте правило
sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT

# Сохраните правила
sudo netfilter-persistent save
# или
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### Вариант 3: Добавить правило для порта 8080 (если хотите протестировать)

```bash
# Добавьте правило для порта 8080
sudo iptables -I INPUT 5 -p tcp --dport 8080 -j ACCEPT

# Проверьте
sudo iptables -L -n -v | grep -E "(3000|8080)"
```

## Проверка после добавления правила

1. **Проверьте правило:**
   ```bash
   sudo iptables -L -n -v | grep 3000
   ```

2. **Попробуйте подключиться извне:**
   ```bash
   # С вашего компьютера
   curl http://130.61.200.70:3000/api/health
   ```

3. **Проверьте логи сервера:**
   ```bash
   sudo journalctl -u lms-api -f
   ```

## Важно!

Правило должно быть добавлено **ПЕРЕД** правилом `REJECT`. Используйте `-I INPUT 5` (вставить в позицию 5) или `-I INPUT` (вставить в начало цепочки).

## Если нужно добавить несколько портов:

```bash
# Порт 3000
sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT

# Порт 8080 (для теста)
sudo iptables -I INPUT 6 -p tcp --dport 8080 -j ACCEPT

# Сохраните
sudo netfilter-persistent save
```

