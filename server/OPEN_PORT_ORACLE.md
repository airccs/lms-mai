# Открытие порта 3000 в Oracle Cloud

## Пошаговая инструкция

### Шаг 1: Войдите в Oracle Cloud Console

1. Откройте https://cloud.oracle.com/
2. Войдите в свой аккаунт
3. Выберите нужный регион (где создан ваш сервер)

### Шаг 2: Найдите вашу VCN (Virtual Cloud Network)

1. В меню слева найдите **Networking** → **Virtual Cloud Networks**
2. Или используйте поиск вверху: введите "VCN"
3. Выберите вашу VCN (обычно называется `vcn-...` или `Default VCN`)

### Шаг 3: Откройте Security List

1. В открывшейся странице VCN найдите раздел **Resources** (Ресурсы)
2. Нажмите на **Security Lists** (Списки безопасности)
3. Выберите **Default Security List** (или ваш основной Security List)

### Шаг 4: Добавьте Ingress Rule

1. В открывшейся странице Security List найдите раздел **Ingress Rules** (Входящие правила)
2. Нажмите кнопку **Add Ingress Rules** (Добавить входящее правило)

### Шаг 5: Заполните форму

Заполните поля следующим образом:

- **Stateless**: Оставьте пустым (или выберите "Stateful")
- **Source Type**: Выберите **CIDR**
- **Source CIDR**: Введите `0.0.0.0/0` (разрешает доступ со всех IP)
- **IP Protocol**: Выберите **TCP**
- **Destination Port Range**: Введите `3000` (или `3000-3000`)
- **Description**: Введите `LMS API Server` (опционально)

### Шаг 6: Сохраните правило

1. Нажмите **Add Ingress Rules** (Добавить входящие правила)
2. Правило появится в списке Ingress Rules

## Альтернативный способ (через Instance)

Если не можете найти VCN:

1. Перейдите в **Compute** → **Instances**
2. Выберите ваш instance (`lms-api-server`)
3. В разделе **Primary VNIC** нажмите на ссылку VCN
4. Далее следуйте шагам 3-6 выше

## Проверка

После добавления правила проверьте доступность:

```bash
# С вашего компьютера
curl http://<ваш-публичный-ip>:3000/api/health
```

Должен вернуться: `{"status":"ok","timestamp":...}`

## Безопасность

⚠️ **Важно**: Открытие порта `0.0.0.0/0` делает сервер доступным из интернета. 

Для большей безопасности можно:
- Ограничить доступ только с вашего IP: замените `0.0.0.0/0` на `ваш-ip/32`
- Настроить HTTPS (см. инструкции по Nginx в ORACLE_DEPLOY.md)

## Скриншоты (примерный вид)

```
Oracle Cloud Console
├── Networking
    └── Virtual Cloud Networks
        └── [Ваша VCN]
            └── Security Lists
                └── Default Security List
                    └── Ingress Rules
                        └── [Кнопка: Add Ingress Rules]
```

