# Настройка GitHub CLI

## Если GitHub CLI только что установлен:

1. **Закройте и откройте PowerShell заново** (чтобы обновился PATH)

2. **Или добавьте в PATH вручную:**
   - Обычно GitHub CLI устанавливается в: `C:\Program Files\GitHub CLI\`
   - Добавьте этот путь в системные переменные PATH

3. **Проверьте установку:**
   ```powershell
   gh --version
   ```

## Авторизация в GitHub CLI:

После перезапуска PowerShell выполните:

```powershell
gh auth login
```

Следуйте инструкциям:
- Выберите GitHub.com
- Выберите HTTPS
- Выберите способ авторизации (браузер или токен)

## После авторизации:

Выполните команду для создания репозитория:

```powershell
cd f:\lms
gh repo create moodle-quiz-solver --public --source=. --remote=origin --push
```

Эта команда:
- ✅ Создаст репозиторий на GitHub
- ✅ Подключит его как origin
- ✅ Загрузит весь код

## Альтернатива (без GitHub CLI):

Если GitHub CLI не работает, используйте обычный Git:

1. Создайте репозиторий на https://github.com/new
2. Выполните:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/moodle-quiz-solver.git
   git push -u origin main
   ```

