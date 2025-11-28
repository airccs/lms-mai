// Popup script
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Moodle Quiz Solver popup loaded');
    await loadStatistics();
    await loadApiSettings();
    setupApiSettings();
});

async function loadStatistics() {
    try {
        // Загружаем сохраненные ответы
        const localData = await chrome.storage.local.get(null);
        let savedCount = 0;
        for (const key of Object.keys(localData)) {
            if (key.startsWith('answer_')) {
                savedCount++;
            }
        }
        document.getElementById('saved-answers-count').textContent = savedCount;

        // Загружаем статистику из sync storage
        const syncData = await chrome.storage.sync.get(['questionStats']);
        const stats = syncData.questionStats || {};
        const questionCount = Object.keys(stats).length;
        document.getElementById('questions-count').textContent = questionCount;

        // Подсчитываем общее количество попыток
        let totalAttempts = 0;
        for (const questionStats of Object.values(stats)) {
            if (questionStats.totalAttempts) {
                totalAttempts += questionStats.totalAttempts;
            }
        }
        document.getElementById('total-attempts').textContent = totalAttempts;

    } catch (e) {
        console.error('Error loading statistics:', e);
    }
}

async function loadApiSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getApiSettings' });
        if (response && response.settings) {
            const settings = response.settings;
            
            // Проверяем соединение
            const apiUrl = settings.apiUrl || 'https://lms-mai-api.iljakir-06.workers.dev';
            checkApiConnection(apiUrl);
        }
    } catch (e) {
        console.error('Error loading API settings:', e);
        // Проверяем соединение с дефолтным URL
        checkApiConnection('https://lms-mai-api.iljakir-06.workers.dev');
    }
}

function setupApiSettings() {
    // Настройки API теперь фиксированные и не могут быть изменены пользователем
    // Функция оставлена для совместимости, но не выполняет никаких действий
}

async function checkApiConnection(apiUrl) {
    const statusEl = document.getElementById('api-status');
    statusEl.innerHTML = '<span class="sync-icon">⏳</span><span>Проверка соединения...</span>';
    statusEl.className = 'sync-item';

    try {
        const response = await fetch(`${apiUrl}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            statusEl.innerHTML = '<span class="sync-icon">✅</span><span>Соединение установлено</span>';
            statusEl.className = 'sync-item';
        } else {
            statusEl.innerHTML = '<span class="sync-icon">⚠️</span><span>Сервер недоступен</span>';
            statusEl.className = 'sync-item';
            statusEl.style.color = '#92400e';
        }
    } catch (e) {
        statusEl.innerHTML = '<span class="sync-icon">❌</span><span>Не удалось подключиться к серверу</span>';
        statusEl.className = 'sync-item';
        statusEl.style.color = '#991b1b';
    }
}