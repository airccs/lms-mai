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
            document.getElementById('api-enabled').checked = settings.enabled || false;
            document.getElementById('api-url').value = settings.apiUrl || '';
            document.getElementById('api-key').value = settings.apiKey || '';
            
            // Показываем поля, если API включен
            document.getElementById('api-fields').style.display = settings.enabled ? 'block' : 'none';
            
            // Проверяем соединение
            if (settings.enabled && settings.apiUrl) {
                checkApiConnection(settings.apiUrl);
            }
        }
    } catch (e) {
        console.error('Error loading API settings:', e);
    }
}

function setupApiSettings() {
    const apiEnabled = document.getElementById('api-enabled');
    const apiFields = document.getElementById('api-fields');
    const saveBtn = document.getElementById('save-api-settings');

    apiEnabled.addEventListener('change', () => {
        apiFields.style.display = apiEnabled.checked ? 'block' : 'none';
    });

    saveBtn.addEventListener('click', async () => {
        const settings = {
            enabled: apiEnabled.checked,
            apiUrl: document.getElementById('api-url').value.trim(),
            apiKey: document.getElementById('api-key').value.trim()
        };

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'saveApiSettings',
                settings: settings
            });

            if (response && response.success) {
                document.getElementById('api-status').textContent = '✅ Настройки сохранены!';
                document.getElementById('api-status').style.color = '#4CAF50';
                
                if (settings.enabled && settings.apiUrl) {
                    checkApiConnection(settings.apiUrl);
                }
            }
        } catch (e) {
            console.error('Error saving API settings:', e);
            document.getElementById('api-status').textContent = '❌ Ошибка при сохранении';
            document.getElementById('api-status').style.color = '#f44336';
        }
    });
}

async function checkApiConnection(apiUrl) {
    const statusEl = document.getElementById('api-status');
    statusEl.textContent = '⏳ Проверка соединения...';
    statusEl.style.color = '#666';

    try {
        const response = await fetch(`${apiUrl}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            statusEl.textContent = '✅ Соединение установлено';
            statusEl.style.color = '#4CAF50';
        } else {
            statusEl.textContent = '⚠️ Сервер недоступен';
            statusEl.style.color = '#FF9800';
        }
    } catch (e) {
        statusEl.textContent = '❌ Не удалось подключиться к серверу';
        statusEl.style.color = '#f44336';
    }
}