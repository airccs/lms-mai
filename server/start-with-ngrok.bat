@echo off
echo Starting Quiz Solver API Server with ngrok...
cd /d "%~dp0"

REM Запускаем сервер в фоновом режиме
start "Quiz Solver Server" /MIN cmd /c "node server.js"

REM Ждем 3 секунды для запуска сервера
timeout /t 3 /nobreak >nul

REM Запускаем ngrok
echo Starting ngrok tunnel...
ngrok http 3000

REM Если ngrok завершится, останавливаем сервер
taskkill /FI "WINDOWTITLE eq Quiz Solver Server*" /T /F

