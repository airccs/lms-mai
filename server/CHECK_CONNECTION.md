# Проверка подключения

## Команды для проверки на сервере:

```bash
# 1. Проверьте, на каком адресе слушает сервер (ss вместо netstat)
sudo ss -tlnp | grep 3000

# Должно показать что-то вроде:
# LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4173,fd=19))

# 2. Проверьте локально
curl http://localhost:3000/api/health

# 3. Проверьте с внутреннего IP
curl http://10.0.0.76:3000/api/health

# 4. Узнайте публичный IP
curl ifconfig.me
```

## Если сервер слушает на 0.0.0.0:3000, но не доступен извне:

Проблема в Security List Oracle Cloud. Проверьте:

1. **Правило добавлено правильно:**
   - Source CIDR: `0.0.0.0/0` (НЕ `10.0.0.0/16` или другой внутренний диапазон!)
   - Protocol: `TCP`
   - Port: `3000`

2. **Правило в статусе Active** (не Disabled)

3. **Правило в правильном Security List:**
   - Должно быть в Security List, привязанном к вашей подсети (subnet)

## Проверка из Oracle Cloud Console:

1. Compute → Instances → ваш instance
2. Primary VNIC → Subnet
3. Security Lists → проверьте все Security Lists
4. Убедитесь, что правило есть во всех активных Security Lists

