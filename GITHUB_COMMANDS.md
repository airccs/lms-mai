# Команды для загрузки на GitHub

## Шаг 1: Создайте репозиторий на GitHub

1. Зайдите на https://github.com/
2. Нажмите "New repository" (зеленая кнопка)
3. Заполните:
   - **Repository name:** `moodle-quiz-solver`
   - **Description:** `Расширение для автоматического решения тестов Moodle с синхронизацией между пользователями`
   - **Visibility:** Public или Private
   - **НЕ** отмечайте "Initialize with README"
4. Нажмите "Create repository"

## Шаг 2: Подключите к GitHub

Выполните в PowerShell (замените YOUR_USERNAME на ваш GitHub username):

```powershell
cd f:\lms
git remote add origin https://github.com/YOUR_USERNAME/moodle-quiz-solver.git
git branch -M main
git push -u origin main
```

## Если потребуется авторизация:

GitHub больше не принимает пароли. Используйте **Personal Access Token**:

1. Зайдите на GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Нажмите "Generate new token (classic)"
3. Выберите права: `repo` (полный доступ к репозиториям)
4. Скопируйте токен
5. При запросе пароля введите токен вместо пароля

## Альтернатива: GitHub CLI

Если установлен GitHub CLI:

```powershell
gh repo create moodle-quiz-solver --public --source=. --remote=origin --push
```

## После загрузки:

1. Зайдите на ваш репозиторий на GitHub
2. Код должен быть загружен
3. Теперь можно развернуть на Railway или настроить Cloudflare

