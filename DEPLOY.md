# Быстрое развертывание

## Вариант 1: Railway (5 минут) ⭐ РЕКОМЕНДУЕТСЯ

1. **Создайте репозиторий на GitHub:**
   - Загрузите этот проект на GitHub
   - См. [GITHUB_SETUP.md](GITHUB_SETUP.md)

2. **Разверните на Railway:**
   - Зайдите на https://railway.app/
   - Войдите через GitHub
   - New Project → Deploy from GitHub repo
   - Выберите ваш репозиторий
   - Settings → Root Directory → `server`
   - Получите URL (например: `quiz-solver.railway.app`)

3. **Настройте расширение:**
   - URL: `https://quiz-solver.railway.app`

**Готово!** Сервер работает 24/7, URL не меняется.

## Вариант 2: Cloudflare Tunnel (на вашем ПК)

1. **Установите cloudflared:**
   - Скачайте: https://github.com/cloudflare/cloudflared/releases
   - Поместите в папку `server`

2. **Настройте туннель:**
   ```powershell
   cd server
   .\cloudflared.exe tunnel login
   .\cloudflared.exe tunnel create quiz-solver
   .\cloudflared.exe tunnel route dns quiz-solver quiz-solver.yourdomain.workers.dev
   ```

3. **Запустите:**
   ```powershell
   .\cloudflared.exe tunnel run quiz-solver
   ```

4. **Настройте расширение:**
   - URL: `https://quiz-solver.yourdomain.workers.dev`

## Вариант 3: Render

1. Зайдите на https://render.com/
2. Создайте Web Service
3. Подключите GitHub репозиторий
4. Root Directory: `server`
5. Получите URL

## Сравнение

| Параметр | Railway | Cloudflare | Render |
|----------|---------|------------|--------|
| Бесплатно | ✅ | ✅ | ✅ |
| Постоянный URL | ✅ | ✅ | ✅ |
| Зависит от ПК | ❌ | ✅ | ❌ |
| Простота | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Надежность | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

**Рекомендация:** Railway - самый простой и надежный вариант.

