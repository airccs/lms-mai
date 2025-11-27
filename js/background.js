// Moodle Quiz Solver - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Moodle Quiz Solver installed');
    
    // Инициализация синхронизации статистики
    chrome.storage.sync.get(['questionStats', 'apiSettings'], (result) => {
        if (!result.questionStats) {
            chrome.storage.sync.set({ questionStats: {} });
        }
        // Инициализация настроек API
        if (!result.apiSettings) {
            chrome.storage.sync.set({ 
                apiSettings: {
                    enabled: false,
                    apiUrl: '',
                    apiKey: ''
                }
            });
        }
    });
});

// Обработка сообщений от content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveSolution') {
        chrome.storage.local.set({
            [request.questionId]: request.solution
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
    
    if (request.action === 'getSolution') {
        chrome.storage.local.get([request.questionId], (result) => {
            sendResponse({ solution: result[request.questionId] });
        });
        return true;
    }

    if (request.action === 'saveAnswer') {
        const { questionHash, answer, isCorrect } = request;
        chrome.storage.local.set({
            [`answer_${questionHash}`]: {
                answer: answer,
                timestamp: Date.now(),
                isCorrect: isCorrect
            }
        }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'updateStatistics') {
        const { questionHash, answer, isCorrect } = request;
        
        chrome.storage.sync.get(['questionStats'], (result) => {
            const stats = result.questionStats || {};
            const questionStats = stats[questionHash] || {
                totalAttempts: 0,
                correctAttempts: 0,
                answers: {},
                errors: []
            };

            questionStats.totalAttempts++;
            if (isCorrect) {
                questionStats.correctAttempts++;
            } else {
                questionStats.errors.push({
                    answer: answer,
                    timestamp: Date.now()
                });
            }

            const answerKey = JSON.stringify(answer);
            questionStats.answers[answerKey] = (questionStats.answers[answerKey] || 0) + 1;

            stats[questionHash] = questionStats;

            chrome.storage.sync.set({ questionStats: stats }, () => {
                sendResponse({ success: true, statistics: questionStats });
            });
        });
        return true;
    }

    if (request.action === 'getStatistics') {
        chrome.storage.sync.get(['questionStats'], (result) => {
            const stats = result.questionStats || {};
            sendResponse({ statistics: stats[request.questionHash] || null });
        });
        return true;
    }

    if (request.action === 'getAllStatistics') {
        chrome.storage.sync.get(['questionStats'], (result) => {
            sendResponse({ statistics: result.questionStats || {} });
        });
        return true;
    }

    // API синхронизация между пользователями
    if (request.action === 'syncWithServer') {
        handleServerSync(request, sendResponse);
        return true;
    }

    if (request.action === 'getApiSettings') {
        chrome.storage.sync.get(['apiSettings'], (result) => {
            sendResponse({ settings: result.apiSettings || { enabled: false, apiUrl: '', apiKey: '' } });
        });
        return true;
    }

    if (request.action === 'saveApiSettings') {
        chrome.storage.sync.set({ apiSettings: request.settings }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

// Обработка синхронизации с сервером
async function handleServerSync(request, sendResponse) {
    try {
        const { questionHash, answer, isCorrect, syncAction } = request;
        
        // Получаем настройки API
        const result = await chrome.storage.sync.get(['apiSettings', 'questionStats']);
        const settings = result.apiSettings || { enabled: false, apiUrl: '', apiKey: '' };
        
        if (!settings.enabled || !settings.apiUrl) {
            // Если API отключен, используем только локальное хранилище
            sendResponse({ success: true, localOnly: true });
            return;
        }

        // Отправляем на сервер
        const apiUrl = settings.apiUrl.endsWith('/') ? settings.apiUrl.slice(0, -1) : settings.apiUrl;
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (settings.apiKey) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }

        let response;
        if (syncAction === 'submitAnswer') {
            // Отправляем статистику ответа
            response = await fetch(`${apiUrl}/api/submit`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    questionHash,
                    answer,
                    isCorrect,
                    timestamp: Date.now()
                })
            });
        } else if (syncAction === 'getStatistics') {
            // Получаем статистику с сервера
            response = await fetch(`${apiUrl}/api/stats/${questionHash}`, {
                method: 'GET',
                headers: headers
            });
        } else if (syncAction === 'getAllStatistics') {
            // Получаем всю статистику
            response = await fetch(`${apiUrl}/api/stats`, {
                method: 'GET',
                headers: headers
            });
        }

        if (response && response.ok) {
            const data = await response.json();
            sendResponse({ success: true, data: data });
        } else {
            throw new Error(`HTTP error! status: ${response?.status}`);
        }
    } catch (error) {
        console.error('Server sync error:', error);
        // При ошибке используем локальное хранилище
        sendResponse({ success: false, error: error.message, localOnly: true });
    }
}