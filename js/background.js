// Moodle Quiz Solver - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('Moodle Quiz Solver installed');
    
    // Инициализация синхронизации статистики
    chrome.storage.sync.get(['questionStats', 'apiSettings'], (result) => {
        if (!result.questionStats) {
            chrome.storage.sync.set({ questionStats: {} });
        }
        // Инициализация настроек API (по умолчанию включена синхронизация)
        if (!result.apiSettings) {
            chrome.storage.sync.set({ 
                apiSettings: {
                    enabled: true,
                    apiUrl: 'http://130.61.200.70:8080',
                    apiKey: ''
                }
            });
        } else {
            // Принудительно обновляем настройки для всех пользователей
            chrome.storage.sync.set({ 
                apiSettings: {
                    enabled: true,
                    apiUrl: 'http://130.61.200.70:8080',
                    apiKey: result.apiSettings.apiKey || ''
                }
            });
        }
    });
    
    // Принудительно обновляем apiUrl в local storage
    chrome.storage.local.set({ 
        apiUrl: 'http://130.61.200.70:8080'
    });
});

// Также обновляем при каждом запуске расширения
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.set({ 
        apiUrl: 'http://130.61.200.70:8080'
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
        const { questionHash, answer, isCorrect, questionText, questionImage } = request;
        chrome.storage.local.set({
            [`answer_${questionHash}`]: {
                answer: answer,
                timestamp: Date.now(),
                isCorrect: isCorrect,
                questionText: questionText || null, // Сохраняем текст вопроса
                questionImage: questionImage || null // Сохраняем изображение вопроса
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
        // Всегда возвращаем фиксированные настройки
        const fixedSettings = {
            enabled: true,
            apiUrl: 'http://130.61.200.70:8080',
            apiKey: ''
        };
        // Обновляем настройки в хранилище, чтобы они всегда были правильными
        chrome.storage.sync.set({ apiSettings: fixedSettings }, () => {
            sendResponse({ settings: fixedSettings });
        });
        return true;
    }

    if (request.action === 'saveApiSettings') {
        // Игнорируем попытки изменить настройки - они всегда фиксированные
        const fixedSettings = {
            enabled: true,
            apiUrl: 'http://130.61.200.70:8080',
            apiKey: ''
        };
        chrome.storage.sync.set({ apiSettings: fixedSettings }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // Получить все сохраненные данные для страницы просмотра
    if (request.action === 'getAllSavedData') {
        console.log('[Background] Запрос getAllSavedData');
        
        chrome.storage.local.get(null, (localData) => {
            console.log('[Background] Local data получен:', Object.keys(localData).length, 'ключей');
            
            // Проверяем флаг очистки данных
            const dataCleared = localData.dataCleared;
            const dataClearedTimestamp = localData.dataClearedTimestamp;
            
            const savedAnswers = [];
            const statistics = {};
            const clearTimestamp = dataClearedTimestamp || 0;
            
            // Извлекаем ответы и статистику из local storage
            for (const [key, value] of Object.entries(localData)) {
                if (key.startsWith('answer_')) {
                    const hash = key.replace('answer_', '');
                    const answerTimestamp = value.timestamp || 0;
                    
                    // Если данные были очищены, показываем только те, что были сохранены ПОСЛЕ очистки
                    if (dataCleared && answerTimestamp <= clearTimestamp) {
                        continue; // Пропускаем данные, сохраненные до очистки
                    }
                    
                    savedAnswers.push({
                        hash: hash,
                        answer: value.answer,
                        timestamp: value.timestamp,
                        isCorrect: value.isCorrect,
                        questionText: value.questionText || 'Текст вопроса не сохранен',
                        questionImage: value.questionImage || null,
                        courseName: value.courseName || null,
                        quizName: value.quizName || null
                    });
                } else if (key.startsWith('stats_')) {
                    const hash = key.replace('stats_', '');
                    statistics[hash] = value;
                }
            }
            
            // Если данные были очищены и прошло достаточно времени, сбрасываем флаг
            if (dataCleared) {
                const timeSinceClear = Date.now() - clearTimestamp;
                if (timeSinceClear >= 5 * 60 * 1000) {
                    chrome.storage.local.set({ 
                        dataCleared: false,
                        dataClearedTimestamp: null
                    });
                }
            }

            console.log('[Background] Найдено сохраненных ответов:', savedAnswers.length);
            console.log('[Background] Статистика по вопросам:', Object.keys(statistics).length);

            // Объединяем данные
            const allData = savedAnswers.map(item => {
                const stats = statistics[item.hash];
                // Возвращаем statistics только если она существует и имеет данные
                return {
                    ...item,
                    statistics: stats && stats.totalAttempts > 0 ? stats : null
                };
            });

            // Сортируем по дате (новые первыми)
            allData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            console.log('[Background] Отправка данных:', allData.length, 'записей');
            sendResponse({ success: true, data: allData });
        });
        return true;
    }

    // Удалить сохраненный ответ (только в dev режиме)
    // В production режиме эти функции отключены для защиты данных
    const IS_DEV_MODE = false; // Установите в true только для разработки
    
    if (IS_DEV_MODE && request.action === 'deleteSavedAnswer') {
        const { hash } = request;
        chrome.storage.local.remove(`answer_${hash}`, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // Очистка всех сохраненных данных разрешена всегда (только локальные данные)
    if (request.action === 'clearAllSavedAnswers') {
        chrome.storage.local.get(null, (allData) => {
            const keysToRemove = Object.keys(allData).filter(key => key.startsWith('answer_'));
            console.log(`[Background] Очистка данных: удаление ${keysToRemove.length} ключей`);
            chrome.storage.local.remove(keysToRemove, () => {
                // Устанавливаем флаг, чтобы предотвратить автоматическую загрузку данных с сервера
                // Также сбрасываем lastScanTime, чтобы разрешить немедленный запуск сканирования
                chrome.storage.local.set({ 
                    dataCleared: true,
                    dataClearedTimestamp: Date.now(),
                    lastScanTime: null, // Сбрасываем lastScanTime при очистке данных
                    scannedUrls: [], // Очищаем список отсканированных URL для нового сканирования
                    scannedUrlsMeta: {} // Очищаем метаданные о сканировании
                }, () => {
                    console.log('[Background] Данные очищены, флаг dataCleared установлен, lastScanTime, scannedUrls и scannedUrlsMeta сброшены');
                    sendResponse({ success: true, cleared: keysToRemove.length });
                });
            });
        });
        return true;
    }
    
    // В production режиме возвращаем ошибку при попытке удаления отдельной записи
    if (!IS_DEV_MODE && request.action === 'deleteSavedAnswer') {
        sendResponse({ success: false, error: 'Удаление отдельных записей отключено в production версии' });
        return true;
    }
});

// Обработка синхронизации с сервером
async function handleServerSync(request, sendResponse) {
    try {
        const { questionHash, answer, isCorrect, syncAction } = request;
        
        // Всегда используем правильный URL (игнорируем chrome.storage.local для надежности)
        const apiUrl = 'http://130.61.200.70:8080';
        
        // Обновляем хранилище для будущих использований
        chrome.storage.local.set({ apiUrl: apiUrl });
        const headers = {
            'Content-Type': 'application/json'
        };

        // Функция для выполнения fetch с таймаутом
        const fetchWithTimeout = async (url, options, timeout = 8000) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error(`Timeout: запрос к ${url} превысил ${timeout}ms`);
                }
                throw fetchError;
            }
        };

        let response;
        if (syncAction === 'submitAnswer') {
            // Отправляем статистику ответа
            response = await fetchWithTimeout(`${apiUrl}/api/submit`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    questionHash,
                    answer,
                    isCorrect,
                    timestamp: Date.now()
                })
            });
        } else if (syncAction === 'saveAnswer') {
            // Отправляем сохраненный ответ на сервер
            const { questionText, questionImage } = request;
            
            // Нормализуем answer - убеждаемся, что это валидный объект/массив/строка
            let normalizedAnswer = answer;
            if (answer === null || answer === undefined) {
                normalizedAnswer = null;
            } else if (typeof answer === 'string') {
                // Если это строка, пытаемся распарсить как JSON, если не получается - оставляем как есть
                try {
                    normalizedAnswer = JSON.parse(answer);
                } catch (e) {
                    normalizedAnswer = answer;
                }
            }
            
            // Логируем размер данных перед отправкой
            const imageSize = questionImage ? questionImage.length : 0;
            const textSize = questionText ? questionText.length : 0;
            const answerType = Array.isArray(normalizedAnswer) ? 'array' : typeof normalizedAnswer;
            console.log(`[handleServerSync] Отправка saveAnswer: questionHash=${questionHash}, answerType=${answerType}, imageSize=${imageSize}, textSize=${textSize}`);
            
            const requestBody = {
                questionHash,
                answer: normalizedAnswer,
                isCorrect,
                questionText: questionText || null,
                questionImage: questionImage || null,
                timestamp: Date.now()
            };
            
            // Проверяем, что тело запроса можно сериализовать
            let requestBodyString;
            try {
                requestBodyString = JSON.stringify(requestBody);
            } catch (e) {
                console.error('[handleServerSync] Ошибка сериализации requestBody:', e);
                sendResponse({ 
                    success: false, 
                    error: 'Failed to serialize request body',
                    localOnly: true 
                });
                return;
            }
            
            response = await fetchWithTimeout(`${apiUrl}/api/save`, {
                method: 'POST',
                headers: headers,
                body: requestBodyString
            });
        } else if (syncAction === 'getSavedAnswers') {
            // Получаем сохраненные ответы других пользователей
            // Используем правильный endpoint /api/answers/:questionHash
            response = await fetchWithTimeout(`${apiUrl}/api/answers/${questionHash}`, {
                method: 'GET',
                headers: headers
            });
        } else if (syncAction === 'getAllSavedAnswers') {
            // Получаем все сохраненные ответы для синхронизации
            response = await fetchWithTimeout(`${apiUrl}/api/answers?limit=1000`, {
                method: 'GET',
                headers: headers
            });
        } else if (syncAction === 'getStatistics') {
            // Получаем статистику с сервера
            response = await fetchWithTimeout(`${apiUrl}/api/stats/${questionHash}`, {
                method: 'GET',
                headers: headers
            });
        } else if (syncAction === 'getAllStatistics') {
            // Получаем всю статистику
            console.log('[handleServerSync] Запрос getAllStatistics к:', `${apiUrl}/api/stats`);
            
            // Добавляем таймаут для fetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 секунд таймаут
            
            try {
                response = await fetch(`${apiUrl}/api/stats`, {
                    method: 'GET',
                    headers: headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                console.log('[handleServerSync] Ответ getAllStatistics:', response.status, response.statusText);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Timeout: запрос к серверу превысил 8 секунд');
                }
                throw fetchError;
            }
        }

        if (response && response.ok) {
            const data = await response.json();
            console.log('[handleServerSync] Данные получены:', Object.keys(data).length, 'ключей');
            console.log('[handleServerSync] Структура данных:', JSON.stringify(data).substring(0, 200));
            
            // Для getAllStatistics проверяем наличие statistics
            if (syncAction === 'getAllStatistics' && data.statistics) {
                console.log('[handleServerSync] Статистика найдена:', Object.keys(data.statistics).length, 'вопросов');
            }
            
            // Для getSavedAnswers и getAllSavedAnswers преобразуем формат ответа
            if (syncAction === 'getSavedAnswers') {
                // Сервер возвращает { answers: [...] }, преобразуем в формат, ожидаемый content script
                sendResponse({ 
                    success: true, 
                    answers: data.answers || [],
                    data: data 
                });
            } else if (syncAction === 'getAllSavedAnswers') {
                // Для getAllSavedAnswers возвращаем все ответы
                sendResponse({ 
                    success: true, 
                    answers: data.answers || [],
                    total: data.total || 0,
                    hasMore: data.hasMore || false,
                    data: data 
                });
            } else {
                sendResponse({ success: true, data: data });
            }
        } else {
            const status = response?.status || 0;
            const statusText = response?.statusText || 'Unknown error';
            
            // Пытаемся получить детали ошибки от сервера
            let errorDetails = null;
            try {
                const errorText = await response.text();
                if (errorText) {
                    try {
                        errorDetails = JSON.parse(errorText);
                    } catch (e) {
                        errorDetails = { message: errorText.substring(0, 500) };
                    }
                }
            } catch (e) {
                // Игнорируем ошибки при чтении ответа
            }
            
            const errorMessage = `HTTP error! status: ${status} ${statusText}`;
            console.error('[handleServerSync] Ошибка запроса:', errorMessage);
            if (errorDetails) {
                console.error('[handleServerSync] Детали ошибки от сервера:', errorDetails);
            }
            
            // Передаем код ошибки для обработки в content script
            sendResponse({ 
                success: false, 
                error: errorMessage,
                statusCode: status,
                errorDetails: errorDetails,
                localOnly: true 
            });
        }
    } catch (error) {
        console.error('[handleServerSync] Server sync error:', error);
        // При ошибке используем локальное хранилище
        sendResponse({ 
            success: false, 
            error: error.message || 'Unknown error', 
            localOnly: true 
        });
    }
}