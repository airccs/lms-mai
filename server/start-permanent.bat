@echo off
echo ========================================
echo Quiz Solver API - Permanent Tunnel
echo ========================================
cd /d "%~dp0"

REM Проверяем, запущен ли уже сервер
tasklist /FI "WINDOWTITLE eq Quiz Solver Server*" 2>NUL | find /I /N "cmd.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Server is already running!
    pause
    exit
)

REM Запускаем сервер в отдельном окне
echo Starting server...
start "Quiz Solver Server" cmd /k "node server.js"

REM Ждем запуска сервера
echo Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Проверяем, что сервер запустился
curl -s http://localhost:3000/api/health >nul
if "%ERRORLEVEL%"=="0" (
    echo Server is running!
) else (
    echo ERROR: Server failed to start!
    pause
    exit
)

REM Запускаем ngrok
echo Starting ngrok tunnel...
echo.
echo ========================================
echo Your public URL will be shown below
echo ========================================
echo.
echo IMPORTANT: Copy the "Forwarding" URL and use it in extension settings
echo Press Ctrl+C to stop
echo.

REM Если есть статический домен, раскомментируйте следующую строку и замените на ваш домен:
REM ngrok http 3000 --domain=quiz-solver.ngrok-free.dev

REM Если нет статического домена, используйте обычный ngrok:
ngrok http 3000

REM Если ngrok завершится, останавливаем сервер
echo.
echo Stopping server...
taskkill /FI "WINDOWTITLE eq Quiz Solver Server*" /T /F
pause

