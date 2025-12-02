// Moodle Quiz Solver - Content Script с поиском ответов и статистикой
(function MoodleQuizSolverInit() {
    'use strict';

    console.log('%c[Moodle Quiz Solver] Content script loaded', 'color: #2563eb; font-weight: bold; font-size: 16px;');
    console.log('[Moodle Quiz Solver] URL:', window.location.href);

    class MoodleQuizSolver {
        constructor() {
            console.log('%c[Moodle Quiz Solver] Constructor called', 'color: #16a34a; font-weight: bold;');
            this.questions = new Map();
            this.solvingInProgress = new Set();
            this.savedAnswers = new Map();
            this.statistics = new Map();
            this.isProcessingReview = false; // Флаг для предотвращения повторных вызовов
            this.isForceScanning = false; // Флаг для принудительного автосканирования
            
            // Оптимизация запросов к серверу
            this.serverCache = new Map(); // Кэш для запросов статистики и ответов (questionHash -> {data, timestamp, type})
            this.serverSyncDisabled = false; // Флаг для отключения синхронизации при ошибках
            this.serverSyncDisabledUntil = 0; // Время до которого синхронизация отключена
            this.pendingSyncRequests = []; // Очередь запросов для батчинга
            this.syncBatchTimeout = null; // Таймер для батчинга
            this.lastSyncTime = 0; // Время последнего запроса к серверу
            this.MIN_SYNC_INTERVAL = 500; // Минимальная задержка между запросами (мс)
            this.CACHE_TTL = 5 * 60 * 1000; // Время жизни кэша (5 минут)
            this.SYNC_DISABLE_DURATION = 60 * 60 * 1000; // Время отключения синхронизации при ошибках (1 час)
            
            this.init();
        }

        async init() {
            console.log('[Moodle Quiz Solver] Init started');
            await this.loadSavedAnswers();
            await this.loadStatistics();
            await this.loadSyncState();
            
            console.log('[Moodle Quiz Solver] Checking if review page...');
            // Проверяем, находимся ли мы на странице результатов
            if (this.isReviewPage()) {
                console.log('[Moodle Quiz Solver] Review page detected, processing...');
                // На страницах результатов не включаем observeDOM, чтобы избежать бесконечного цикла
                this.processReviewPage();
            } else {
                console.log('[Moodle Quiz Solver] Not a review page, parsing questions...');
            this.parseQuestions();
            this.addSolveButtons();
                this.setupAutoSave(); // Настраиваем автоматическое сохранение
                this.observeDOM(); // Включаем observeDOM только на страницах вопросов
            }
            
            console.log('[Moodle Quiz Solver] Setting up auto force scan...');
            // Автоматически запускаем принудительное автосканирование при взаимодействии с LMS
            this.setupAutoForceScan();
            console.log('[Moodle Quiz Solver] Init completed');
        }

        async safeSendMessage(message) {
            // Безопасная отправка сообщений в background script с обработкой ошибок
            try {
                // Проверяем, доступен ли chrome.runtime
                if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                    console.warn('[safeSendMessage] chrome.runtime недоступен');
                    return null;
                }

                // Используем Promise с таймаутом для предотвращения зависания
                const timeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout: запрос к серверу превысил 10 секунд')), 10000);
                });

                const sendMessage = new Promise((resolve, reject) => {
                    try {
                        chrome.runtime.sendMessage(message, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve(response);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                });

                const response = await Promise.race([sendMessage, timeout]);
                return response;
            } catch (error) {
                // Игнорируем ошибки, связанные с закрытием порта или недоступностью background script
                const errorMessage = error.message || error.toString();
                if (errorMessage.includes('Could not establish connection') ||
                    errorMessage.includes('message port closed') ||
                    errorMessage.includes('Extension context invalidated') ||
                    errorMessage.includes('The message port closed')) {
                    console.warn('[safeSendMessage] Background script недоступен или порт закрыт, игнорирую:', message.action);
                    return null;
                }
                // Для других ошибок логируем
                console.error('[safeSendMessage] Ошибка при отправке сообщения:', error, message);
                return null;
            }
        }

        async safeStorageGet(keys) {
            try {
                if (!chrome || !chrome.storage || !chrome.storage.local) {
                    console.warn('[safeStorageGet] chrome.storage.local недоступен');
                    return {};
                }
                return await chrome.storage.local.get(keys);
            } catch (error) {
                if (error.message && error.message.includes('Extension context invalidated')) {
                    console.warn('[safeStorageGet] Контекст расширения недействителен, игнорирую ошибку:', error.message);
                    return {};
                }
                console.error('[safeStorageGet] Ошибка при получении данных из storage:', error);
                return {};
            }
        }

        async safeStorageSet(items) {
            try {
                if (!chrome || !chrome.storage || !chrome.storage.local) {
                    console.warn('[safeStorageSet] chrome.storage.local недоступен');
                    return;
                }
                await chrome.storage.local.set(items);
            } catch (error) {
                if (error.message && error.message.includes('Extension context invalidated')) {
                    console.warn('[safeStorageSet] Контекст расширения недействителен, игнорирую ошибку:', error.message);
                    return;
                }
                console.error('[safeStorageSet] Ошибка при сохранении данных в storage:', error);
            }
        }

        isReviewPage() {
            // Проверяем URL - должна быть страница результатов, а не выбора теста
            const url = window.location.href;
            if (url.includes('/mod/quiz/view.php')) {
                // Это страница выбора теста, не страница результатов
                return false;
            }
            
            // Проверяем наличие вопросов - без них это не страница результатов
            const hasQuestions = document.querySelectorAll('.que').length > 0;
            if (!hasQuestions) {
                return false;
            }
            
            // Проверяем наличие элементов, характерных для страницы результатов
            const hasReviewElements = document.querySelector('#page-mod-quiz-review') !== null ||
                   document.querySelector('.quizreviewsummary') !== null ||
                   document.querySelector('.quiz-summary') !== null ||
                   document.querySelector('.quizresults') !== null;
            
            const hasReviewUrl = url.includes('review') ||
                   url.includes('summary') ||
                   url.includes('result');
            
            const hasCorrectnessIndicators = document.querySelector('.que.correct') !== null ||
                   document.querySelector('.que.incorrect') !== null ||
                   document.querySelector('.que.partiallycorrect') !== null ||
                   document.querySelector('.rightanswer') !== null ||
                   document.querySelector('.wronganswer') !== null ||
                   document.querySelector('.correctanswer') !== null;
            
            // Проверяем наличие текста "Результаты" или "Results"
            const hasResultsText = document.body.innerText.includes('Результаты теста') ||
                   document.body.innerText.includes('Результат') ||
                   document.body.innerText.includes('Правильных ответов') ||
                   document.body.innerText.includes('Правильно:') ||
                   document.body.innerText.includes('Неправильно:');
            
            return hasReviewElements || hasReviewUrl || hasCorrectnessIndicators || hasResultsText;
        }

        async processReviewPage() {
            // Защита от повторных вызовов
            if (this.isProcessingReview) {
                console.log('[Review Scanner] Сканирование уже выполняется, пропускаем...');
                return;
            }
            
            this.isProcessingReview = true;
            console.log('[Review Scanner] Начинаю сканирование страницы результатов...');
            
            try {
                const questionElements = document.querySelectorAll('.que');
            
                let totalQuestions = 0;
                let correctAnswers = 0;
                let incorrectAnswers = 0;
                let updatedCount = 0;
                const results = [];

                // Сначала обновляем все существующие сохраненные ответы
                console.log('[Review Scanner] Обновляю существующие сохраненные ответы...');
                await this.updateAllSavedAnswersFromReview(questionElements);

                for (const element of questionElements) {
                    try {
                        const question = this.parseQuestion(element, 0);
                        if (!question) continue;

                        totalQuestions++;
                        const isCorrect = this.determineCorrectnessFromReview(element);
                        const userAnswer = this.extractUserAnswerFromReview(element, question);

                        if (isCorrect === true) {
                            correctAnswers++;
                        } else if (isCorrect === false) {
                            incorrectAnswers++;
                        }

                        if (userAnswer && isCorrect !== null) {
                            // Извлекаем изображение из вопроса
                            const questionImage = await this.extractQuestionImage(element);
                            
                            // Сохраняем ответ с правильным isCorrect, текстом вопроса и изображением
                            const wasUpdated = await this.saveAnswer(question.hash, userAnswer, isCorrect, question.text, questionImage);
                            if (wasUpdated) updatedCount++;
                            await this.updateStatistics(question.hash, userAnswer, isCorrect);
                            
                            results.push({
                                question: question,
                                element: element,
                                isCorrect: isCorrect,
                                userAnswer: userAnswer
                            });
                        }
                    } catch (e) {
                        console.error('Error processing review question:', e);
                    }
                }

                // Показываем статистику выполнения
                this.showQuizResults(totalQuestions, correctAnswers, incorrectAnswers, results);
                
                // Добавляем кнопку для повторного сканирования
                this.addRescanButton();
            
                this.showNotification(`📊 Сканирование завершено! Обновлено ответов: ${updatedCount}`, 'success');
            } finally {
                this.isProcessingReview = false;
            }
        }

        async updateAllSavedAnswersFromReview(questionElements) {
            // Обновляем все сохраненные ответы на основе текущей страницы результатов
            try {
                const allSaved = await this.safeStorageGet(null) || {};
                let updatedCount = 0;

                for (const element of questionElements) {
                    try {
                        const question = this.parseQuestion(element, 0);
                        if (!question) continue;

                        const savedKey = `answer_${question.hash}`;
                        const savedData = allSaved[savedKey];
                        
                        if (savedData) {
                            // Определяем правильность на основе страницы результатов
                            const isCorrect = this.determineCorrectnessFromReview(element);
                            const userAnswer = this.extractUserAnswerFromReview(element, question);
                            
                            if (isCorrect !== null && userAnswer) {
                                // Обновляем только если статус изменился или был неизвестен
                                if (savedData.isCorrect !== isCorrect || savedData.isCorrect === null) {
                                    const questionImage = await this.extractQuestionImage(element);
                                    await this.saveAnswer(
                                        question.hash, 
                                        userAnswer || savedData.answer, 
                                        isCorrect, 
                                        question.text || savedData.questionText,
                                        questionImage || savedData.questionImage
                                    );
                                    updatedCount++;
                                    console.log(`[Review Scanner] Обновлен ответ для hash: ${question.hash}, isCorrect: ${isCorrect}`);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error updating saved answer:', e);
                    }
                }

                if (updatedCount > 0) {
                    console.log(`[Review Scanner] Обновлено ${updatedCount} сохраненных ответов`);
                }
            } catch (e) {
                console.error('Error updating all saved answers:', e);
            }
        }

        addRescanButton() {
            // Удаляем предыдущую кнопку, если есть
            const existing = document.getElementById('quiz-solver-rescan-btn');
            if (existing) existing.remove();

            // Добавляем кнопку повторного сканирования
            const rescanBtn = document.createElement('button');
            rescanBtn.id = 'quiz-solver-rescan-btn';
            rescanBtn.innerHTML = 'Повторно сканировать результаты';
            rescanBtn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 18px;
                background: white;
                color: #111827;
                border: 1px solid #2563eb;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                z-index: 100002;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: all 0.2s ease;
            `;

            rescanBtn.addEventListener('mouseenter', () => {
                if (!rescanBtn.disabled) {
                    rescanBtn.style.background = '#f3f4f6';
                    rescanBtn.style.boxShadow = '0 2px 4px -1px rgba(0, 0, 0, 0.1)';
                }
            });

            rescanBtn.addEventListener('mouseleave', () => {
                if (!rescanBtn.disabled) {
                    rescanBtn.style.background = 'white';
                    rescanBtn.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                }
            });

            rescanBtn.addEventListener('mousedown', () => {
                if (!rescanBtn.disabled) {
                    rescanBtn.style.background = '#e5e7eb';
                    rescanBtn.style.transform = 'scale(0.98)';
                }
            });

            rescanBtn.addEventListener('mouseup', () => {
                if (!rescanBtn.disabled) {
                    rescanBtn.style.background = '#f3f4f6';
                    rescanBtn.style.transform = 'scale(1)';
                }
            });

            rescanBtn.addEventListener('click', async () => {
                if (this.isProcessingReview) {
                    return; // Уже выполняется
                }
                rescanBtn.disabled = true;
                rescanBtn.innerHTML = 'Сканирование...';
                rescanBtn.style.opacity = '0.5';
                rescanBtn.style.cursor = 'not-allowed';
                rescanBtn.style.background = '#f9fafb';
                rescanBtn.style.borderColor = '#d1d5db';
                rescanBtn.style.color = '#9ca3af';
                try {
                    await this.processReviewPage();
                } finally {
                    rescanBtn.disabled = false;
                    rescanBtn.innerHTML = 'Повторно сканировать результаты';
                    rescanBtn.style.opacity = '1';
                    rescanBtn.style.cursor = 'pointer';
                    rescanBtn.style.background = 'white';
                    rescanBtn.style.borderColor = '#2563eb';
                    rescanBtn.style.color = '#111827';
                }
            });

            document.body.appendChild(rescanBtn);

            // Добавляем кнопку для принудительного автосканирования
            this.addForceScanButton();
        }

        addForceScanButton() {
            // Удаляем предыдущую кнопку, если есть
            const existing = document.getElementById('quiz-solver-force-scan-btn');
            if (existing) existing.remove();

            // Добавляем кнопку принудительного автосканирования
            const forceScanBtn = document.createElement('button');
            forceScanBtn.id = 'quiz-solver-force-scan-btn';
            forceScanBtn.innerHTML = 'Принудительное автосканирование';
            forceScanBtn.style.cssText = `
                position: fixed;
                bottom: 70px;
                right: 20px;
                padding: 10px 18px;
                background: white;
                color: #111827;
                border: 1px solid #2563eb;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
                z-index: 100002;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: all 0.2s ease;
            `;

            forceScanBtn.addEventListener('mouseenter', () => {
                if (!forceScanBtn.disabled) {
                    forceScanBtn.style.background = '#f3f4f6';
                    forceScanBtn.style.boxShadow = '0 2px 4px -1px rgba(0, 0, 0, 0.1)';
                }
            });

            forceScanBtn.addEventListener('mouseleave', () => {
                if (!forceScanBtn.disabled) {
                    forceScanBtn.style.background = 'white';
                    forceScanBtn.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                }
            });

            forceScanBtn.addEventListener('mousedown', () => {
                if (!forceScanBtn.disabled) {
                    forceScanBtn.style.background = '#e5e7eb';
                    forceScanBtn.style.transform = 'scale(0.98)';
                }
            });

            forceScanBtn.addEventListener('mouseup', () => {
                if (!forceScanBtn.disabled) {
                    forceScanBtn.style.background = '#f3f4f6';
                    forceScanBtn.style.transform = 'scale(1)';
                }
            });

            forceScanBtn.addEventListener('click', async () => {
                if (this.isForceScanning) {
                    return;
                }
                forceScanBtn.disabled = true;
                forceScanBtn.innerHTML = 'Сканирование...';
                forceScanBtn.style.opacity = '0.5';
                forceScanBtn.style.cursor = 'not-allowed';
                forceScanBtn.style.background = '#f9fafb';
                forceScanBtn.style.borderColor = '#d1d5db';
                forceScanBtn.style.color = '#9ca3af';
                try {
                    await this.forceAutoScan();
                } finally {
                    forceScanBtn.disabled = false;
                    forceScanBtn.innerHTML = 'Принудительное автосканирование';
                    forceScanBtn.style.opacity = '1';
                    forceScanBtn.style.cursor = 'pointer';
                    forceScanBtn.style.background = 'white';
                    forceScanBtn.style.borderColor = '#2563eb';
                    forceScanBtn.style.color = '#111827';
                }
            });

            document.body.appendChild(forceScanBtn);
        }

        async forceAutoScan() {
            // Принудительное автосканирование без открытия вкладок
            // Использует ту же логику, что и auto-scan.js, но через fetch
            
            // Проверяем, не идет ли уже сканирование (в фоне или на другой странице)
            const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
            if (scanState.autoScanInProgress) {
                console.log('[Force Auto Scan] Сканирование уже выполняется в фоне');
                return;
            }
            
            if (this.isForceScanning) {
                console.log('[Force Auto Scan] Сканирование уже выполняется локально');
                return;
            }

            // Устанавливаем флаг сканирования в storage для координации между страницами
            // Также сохраняем heartbeat для проверки активности и URL страницы
            await this.safeStorageSet({ 
                autoScanInProgress: true, 
                autoScanStartTime: Date.now(),
                autoScanHeartbeat: Date.now(), // Время последнего обновления
                autoScanUrl: window.location.href // URL страницы, где запущено сканирование
            });
            
            this.isForceScanning = true;
            console.log('[Force Auto Scan] Флаги установлены, начинаю сканирование...');
            this.showNotification('Начинаю принудительное автосканирование...', 'info');
            
            // Устанавливаем интервал для обновления heartbeat каждые 10 секунд
            const heartbeatInterval = setInterval(async () => {
                if (this.isForceScanning) {
                    await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                } else {
                    clearInterval(heartbeatInterval);
                }
            }, 10000);

            try {
                let totalScanned = 0;
                let totalFound = 0;
                let totalSaved = 0;

                const currentUrl = window.location.href;
                console.log(`[Force Auto Scan] Текущий URL: ${currentUrl}`);

                // Если это главная страница или список курсов, ищем курсы
                if (currentUrl.includes('lms.mai.ru') && 
                    (currentUrl === 'https://lms.mai.ru/' || 
                     currentUrl.includes('lms.mai.ru/my') ||
                     currentUrl.includes('lms.mai.ru/?redirect=0'))) {
                    
                    console.log('[Force Auto Scan] Главная страница, ищу курсы...');
                    const courseLinks = await this.findCoursesOnPage();
                    
                    // Дедупликация курсов по ID
                    const uniqueCourses = new Map();
                    courseLinks.forEach(url => {
                        const match = url.match(/[?&]id=(\d+)/);
                        if (match) {
                            const courseId = match[1];
                            if (!uniqueCourses.has(courseId)) {
                                uniqueCourses.set(courseId, url);
                            }
                        } else {
                            // Если нет ID, добавляем как есть
                            uniqueCourses.set(url, url);
                        }
                    });
                    
                    const uniqueCourseLinks = Array.from(uniqueCourses.values());
                    
                    if (uniqueCourseLinks.length > 0) {
                        console.log(`[Force Auto Scan] Найдено ${courseLinks.length} ссылок, уникальных курсов: ${uniqueCourseLinks.length}`);
                        this.showNotification(`Найдено ${uniqueCourseLinks.length} курсов. Сканирую...`, 'info');
                        
                        for (let i = 0; i < uniqueCourseLinks.length; i++) {
                            const courseUrl = uniqueCourseLinks[i];
                            console.log(`[Force Auto Scan] [${i + 1}/${uniqueCourseLinks.length}] Обрабатываю курс: ${courseUrl}`);
                            
                            // Обновляем heartbeat
                            if (this.isForceScanning) {
                                await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                            }
                            
                            const reviewLinks = await this.findReviewLinksFromCourse(courseUrl);
                            console.log(`[Force Auto Scan] В курсе найдено ${reviewLinks.length} ссылок на результаты`);
                            
                            // Сканируем все найденные результаты
                            for (const reviewLink of reviewLinks) {
                                // Обновляем heartbeat перед каждым сканированием
                                if (this.isForceScanning) {
                                    await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                                }
                                
                                try {
                                    const result = await this.scanReviewPageWithFetch(reviewLink);
                                    totalScanned++;
                                    totalFound += result.questions;
                                    totalSaved += result.saved;
                                } catch (error) {
                                    console.error(`[Force Auto Scan] Ошибка при сканировании ${reviewLink}:`, error);
                                }
                                
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                    }
                }

                // Ищем прямые ссылки на результаты на текущей странице
                const directReviewLinks = this.findDirectReviewLinksOnPage();
                console.log(`[Force Auto Scan] Найдено ${directReviewLinks.length} прямых ссылок на результаты на текущей странице`);
                
                if (directReviewLinks.length === 0 && totalScanned === 0) {
                    console.log('[Force Auto Scan] На текущей странице нет ссылок для сканирования');
                }
                
                for (const link of directReviewLinks) {
                    // Обновляем heartbeat перед каждым сканированием
                    if (this.isForceScanning) {
                        await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                    }
                    
                    try {
                        const result = await this.scanReviewPageWithFetch(link);
                        totalScanned++;
                        totalFound += result.questions;
                        totalSaved += result.saved;
                    } catch (error) {
                        console.error(`[Force Auto Scan] Ошибка при сканировании ${link}:`, error);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Ищем ссылки на тесты и находим в них результаты
                const quizLinks = this.findQuizLinksOnPage();
                console.log(`[Force Auto Scan] Найдено ${quizLinks.length} ссылок на тесты на текущей странице`);
                
                if (quizLinks.length === 0 && directReviewLinks.length === 0 && totalScanned === 0) {
                    console.log('[Force Auto Scan] ⚠️ На странице нет ссылок для сканирования. Сканирование завершено без результатов.');
                }
                
                for (const quizUrl of quizLinks) {
                    const reviewLinks = await this.findReviewLinksFromQuiz(quizUrl);
                    console.log(`[Force Auto Scan] В тесте найдено ${reviewLinks.length} ссылок на результаты`);
                    
                    for (const reviewLink of reviewLinks) {
                        // Обновляем heartbeat перед каждым сканированием
                        if (this.isForceScanning) {
                            await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                        }
                        
                        try {
                            const result = await this.scanReviewPageWithFetch(reviewLink);
                            totalScanned++;
                            totalFound += result.questions;
                            totalSaved += result.saved;
                        } catch (error) {
                            console.error(`[Force Auto Scan] Ошибка при сканировании ${reviewLink}:`, error);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Если на странице attempt.php, пытаемся найти ссылку на review страницу
                if (currentUrl.includes('attempt.php') && totalScanned === 0) {
                    console.log('[Force Auto Scan] Страница attempt.php, ищу ссылку на review...');
                    const reviewLink = this.findReviewLinkFromAttempt(currentUrl);
                    if (reviewLink) {
                        console.log(`[Force Auto Scan] Найдена ссылка на review: ${reviewLink}`);
                        try {
                            const result = await this.scanReviewPageWithFetch(reviewLink);
                            totalScanned++;
                            totalFound += result.questions;
                            totalSaved += result.saved;
                        } catch (error) {
                            console.error(`[Force Auto Scan] Ошибка при сканировании review:`, error);
                        }
                    } else {
                        console.log('[Force Auto Scan] Ссылка на review не найдена на странице attempt.php');
                    }
                }

                // Если на текущей странице ничего не найдено, запускаем полное сканирование всех курсов
                if (totalScanned === 0 && !currentUrl.includes('attempt.php')) {
                    console.log('[Force Auto Scan] На текущей странице нет ссылок, запускаю полное сканирование всех курсов...');
                    this.showNotification('Запускаю полное сканирование всех курсов...', 'info');
                    
                    // Переходим к сканированию всех курсов
                    try {
                        // Сначала ищем курсы на текущей странице
                        let courseLinks = await this.findCoursesOnPage();
                        console.log(`[Force Auto Scan] На текущей странице найдено ${courseLinks.length} курсов`);
                        
                        // Если на текущей странице нет курсов, предлагаем пользователю перейти на главную страницу
                        if (courseLinks.length === 0) {
                            console.warn('[Force Auto Scan] На текущей странице нет курсов. Для полного сканирования перейдите на главную страницу LMS (https://lms.mai.ru/)');
                            this.showNotification('На текущей странице нет курсов. Перейдите на главную страницу для полного сканирования.', 'warning');
                            // Не пытаемся загружать главную страницу через fetch, чтобы избежать 403
                            // Пользователь может вручную перейти на главную страницу
                        }
                        
                        const coursesToScan = courseLinks;
                        
                        // Дедупликация курсов по ID
                        const uniqueCourses = new Map();
                        coursesToScan.forEach(url => {
                            const match = url.match(/[?&]id=(\d+)/);
                            if (match) {
                                const courseId = match[1];
                                if (!uniqueCourses.has(courseId)) {
                                    uniqueCourses.set(courseId, url);
                                }
                            } else {
                                uniqueCourses.set(url, url);
                            }
                        });
                        
                        const uniqueCourseLinks = Array.from(uniqueCourses.values());
                        
                        if (uniqueCourseLinks.length > 0) {
                            console.log(`[Force Auto Scan] Найдено ${uniqueCourseLinks.length} уникальных курсов для полного сканирования`);
                            this.showNotification(`Сканирую ${uniqueCourseLinks.length} курсов...`, 'info');
                            
                            for (let i = 0; i < uniqueCourseLinks.length; i++) {
                                const courseUrl = uniqueCourseLinks[i];
                                console.log(`[Force Auto Scan] [${i + 1}/${uniqueCourseLinks.length}] Обрабатываю курс: ${courseUrl}`);
                                
                                // Обновляем heartbeat
                                if (this.isForceScanning) {
                                    await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                                }
                                
                                const reviewLinks = await this.findReviewLinksFromCourse(courseUrl);
                                console.log(`[Force Auto Scan] В курсе найдено ${reviewLinks.length} ссылок на результаты`);
                                
                                // Сканируем все найденные результаты
                                for (const reviewLink of reviewLinks) {
                                    // Обновляем heartbeat перед каждым сканированием
                                    if (this.isForceScanning) {
                                        await this.safeStorageSet({ autoScanHeartbeat: Date.now() });
                                    }
                                    
                                    try {
                                        const result = await this.scanReviewPageWithFetch(reviewLink);
                                        totalScanned++;
                                        totalFound += result.questions;
                                        totalSaved += result.saved;
                                    } catch (error) {
                                        console.error(`[Force Auto Scan] Ошибка при сканировании ${reviewLink}:`, error);
                                    }
                                    
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }
                        } else {
                            console.log('[Force Auto Scan] Не удалось найти курсы для полного сканирования');
                        }
                    } catch (error) {
                        console.error('[Force Auto Scan] Ошибка при полном сканировании курсов:', error);
                    }
                }

                console.log(`[Force Auto Scan] Итоги сканирования: просканировано ${totalScanned}, найдено ${totalFound}, сохранено ${totalSaved}`);
                this.showNotification(`Сканирование завершено! Просканировано: ${totalScanned}, найдено: ${totalFound}, сохранено: ${totalSaved}`, 'success');
            } catch (error) {
                console.error('[Force Auto Scan] Критическая ошибка:', error);
                this.showNotification('Ошибка при автосканировании: ' + error.message, 'error');
            } finally {
                // Сбрасываем флаги сканирования
                this.isForceScanning = false;
                await this.safeStorageSet({ 
                    autoScanInProgress: false, 
                    autoScanStartTime: null,
                    autoScanHeartbeat: null,
                    autoScanUrl: null
                });
                console.log('[Force Auto Scan] Флаги сканирования сброшены');
            }
        }

        async scanRecursively(url, depth = 0, visited = new Set()) {
            // Рекурсивное сканирование всех уровней
            const MAX_DEPTH = 3; // Максимальная глубина: главная → курсы → тесты → результаты
            const MAX_LINKS_PER_LEVEL = 10; // Максимум ссылок на каждом уровне для избежания перегрузки

            if (depth > MAX_DEPTH || visited.has(url)) {
                console.log(`[scanRecursively] Пропуск: depth=${depth}, visited=${visited.has(url)}`);
                return { scanned: 0, found: 0, saved: 0 };
            }

            visited.add(url);
            console.log(`%c[scanRecursively] Уровень ${depth}, сканирую: ${url}`, 'color: #2563eb; font-weight: bold;');

            let totalScanned = 0;
            let totalFound = 0;
            let totalSaved = 0;

            try {
                // Загружаем страницу
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: { 'Accept': 'text/html' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Проверяем, это страница результатов?
                const isReviewPage = doc.querySelector('.reviewoptions, #page-mod-quiz-review, .que');
                if (isReviewPage && doc.querySelectorAll('.que').length > 0) {
                    // Это страница результатов - сканируем её
                    console.log(`[scanRecursively] Найдена страница результатов на уровне ${depth}`);
                    const result = await this.scanReviewPageFromHTML(html, url);
                    return {
                        scanned: 1,
                        found: result.questions,
                        saved: result.saved
                    };
                }

                // Ищем ссылки на следующем уровне
                let linksToScan = [];

                if (depth === 0) {
                    // Главная страница - ищем ссылки на курсы
                    console.log('[scanRecursively] Главная страница, ищу ссылки на курсы...');
                    
                    // Расширенные селекторы для поиска ссылок на курсы
                    const courseSelectors = [
                        'a[href*="course/view"]',
                        'a[href*="course/index"]',
                        'a[href*="/course/"]',
                        '.coursebox a',
                        '.course a',
                        '[data-course-id] a',
                        '.coursename a'
                    ];
                    
                    const foundLinks = new Set();
                    
                    courseSelectors.forEach(selector => {
                        doc.querySelectorAll(selector).forEach(link => {
                            let href = link.getAttribute('href');
                            if (href && !href.includes('#') && !href.includes('javascript:')) {
                                // Пропускаем ссылки на категории и другие разделы
                                if (href.includes('category') || href.includes('search') || href.includes('login')) {
                                    return;
                                }
                                
                                if (!href.startsWith('http')) {
                                    href = new URL(href, url).href;
                                }
                                
                                // Проверяем, что это действительно ссылка на курс
                                if (href.includes('course') || href.includes('id=')) {
                                    const urlWithLang = href.includes('lang=') ? href : 
                                                      (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                                    foundLinks.add(urlWithLang);
                                }
                            }
                        });
                    });
                    
                    linksToScan = Array.from(foundLinks);
                    console.log(`[scanRecursively] На главной странице найдено ${linksToScan.length} ссылок на курсы`);
                } else if (depth === 1) {
                    // Страница курса - ищем ссылки на тесты
                    console.log('[scanRecursively] Страница курса, ищу ссылки на тесты...');
                    doc.querySelectorAll('a[href*="quiz"], a[href*="mod/quiz"]').forEach(link => {
                        let href = link.getAttribute('href');
                        if (href && !href.includes('#')) {
                            if (!href.startsWith('http')) {
                                href = new URL(href, url).href;
                            }
                            const urlWithLang = href.includes('lang=') ? href : 
                                              (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                            linksToScan.push(urlWithLang);
                        }
                    });
                } else if (depth === 2) {
                    // Страница теста - ищем ссылки на результаты
                    console.log('[scanRecursively] Страница теста, ищу ссылки на результаты...');
                    doc.querySelectorAll('a[href*="review"], a[href*="attempt"]').forEach(link => {
                        let href = link.getAttribute('href');
                        if (href && !href.includes('#')) {
                            if (!href.startsWith('http')) {
                                href = new URL(href, url).href;
                            }
                            const urlWithLang = href.includes('lang=') ? href : 
                                              (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                            linksToScan.push(urlWithLang);
                        }
                    });
                }

                // Ограничиваем количество ссылок для сканирования
                linksToScan = linksToScan.slice(0, MAX_LINKS_PER_LEVEL);
                console.log(`[scanRecursively] Найдено ${linksToScan.length} ссылок на уровне ${depth}`);

                // Рекурсивно сканируем найденные ссылки
                for (let i = 0; i < linksToScan.length; i++) {
                    const link = linksToScan[i];
                    try {
                        const result = await this.scanRecursively(link, depth + 1, visited);
                        totalScanned += result.scanned;
                        totalFound += result.found;
                        totalSaved += result.saved;
                    } catch (error) {
                        console.error(`[scanRecursively] Ошибка при сканировании ${link}:`, error);
                    }

                    // Задержка между запросами
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`[scanRecursively] Ошибка при загрузке ${url}:`, error);
            }

            return { scanned: totalScanned, found: totalFound, saved: totalSaved };
        }

        async scanReviewPageFromHTML(html, url) {
            // Сканирует страницу результатов из HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Извлекаем названия курса и теста из HTML
            const { courseName, quizName } = this.getCourseAndQuizNamesFromDOM(doc, url);

            const beforeData = await this.safeStorageGet(null) || {};
            const beforeCount = Object.keys(beforeData).filter(key => key.startsWith('answer_')).length;

            const questionElements = doc.querySelectorAll('.que');
            if (questionElements.length === 0) {
                return { questions: 0, saved: 0 };
            }

            let savedCount = 0;
            for (const element of questionElements) {
                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = element.outerHTML;
                    const tempElement = tempDiv.firstElementChild;

                    const baseUrl = new URL(url).origin;
                    tempElement.querySelectorAll('img').forEach(img => {
                        if (img.src && !img.src.startsWith('http')) {
                            img.src = new URL(img.src, baseUrl).href;
                        }
                    });

                    const question = this.parseQuestion(tempElement, 0);
                    if (!question) continue;

                    const isCorrect = this.determineCorrectnessFromReview(tempElement);
                    const userAnswer = this.extractUserAnswerFromReview(tempElement, question);

                    if (userAnswer && isCorrect !== null) {
                        let questionImage = null;
                        try {
                            questionImage = await this.extractQuestionImage(tempElement);
                        } catch (e) {
                            console.warn('[scanReviewPageFromHTML] Не удалось извлечь изображение:', e);
                        }

                        // Сохраняем ответ с названиями курса и теста
                        const existingKey = `answer_${question.hash}`;
                        const existing = await this.safeStorageGet([existingKey]);
                        const existingData = existing[existingKey];
                        
                        // Обновляем названия, если их еще нет
                        const answerData = {
                            answer: userAnswer,
                            timestamp: existingData?.timestamp || Date.now(),
                            isCorrect: isCorrect,
                            questionText: question.text,
                            questionImage: questionImage,
                            courseName: courseName || existingData?.courseName || null,
                            quizName: quizName || existingData?.quizName || null
                        };
                        
                        await this.safeStorageSet({ [existingKey]: answerData });
                        this.savedAnswers.set(question.hash, answerData);
                        
                        const wasUpdated = await this.saveAnswer(
                            question.hash,
                            userAnswer,
                            isCorrect,
                            question.text,
                            questionImage
                        );

                        if (wasUpdated) {
                            savedCount++;
                        }

                        await this.updateStatistics(question.hash, userAnswer, isCorrect);
                    }
                } catch (e) {
                    console.error('[scanReviewPageFromHTML] Ошибка при обработке вопроса:', e);
                }
            }

            const afterData = await this.safeStorageGet(null) || {};
            const afterCount = Object.keys(afterData).filter(key => key.startsWith('answer_')).length;
            const actuallySaved = afterCount - beforeCount;

            return {
                questions: questionElements.length,
                saved: Math.max(actuallySaved, savedCount)
            };
        }

        findCoursesOnPage() {
            // Находит ссылки на курсы на текущей странице
            const courses = [];
            const links = document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/"]');
            links.forEach(a => {
                if (a.href && a.href.includes('/course/') && !courses.includes(a.href)) {
                    const urlWithLang = a.href.includes('lang=') ? a.href : 
                                      (a.href.includes('?') ? `${a.href}&lang=ru` : `${a.href}?lang=ru`);
                    courses.push(urlWithLang);
                }
            });
            return courses;
        }

        async findReviewLinksFromCourse(courseUrl) {
            // Находит все ссылки на результаты тестов в курсе через fetch
            try {
                const urlWithLang = courseUrl.includes('lang=') ? courseUrl : 
                                  (courseUrl.includes('?') ? `${courseUrl}&lang=ru` : `${courseUrl}?lang=ru`);
                
                const response = await fetch(urlWithLang, {
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': window.location.href,
                        'User-Agent': navigator.userAgent,
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Cache-Control': 'max-age=0'
                    },
                    mode: 'cors',
                    redirect: 'follow'
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        console.warn(`[findReviewLinksFromCourse] Доступ запрещен (403) для ${urlWithLang}, пропускаю...`);
                        // Добавляем задержку перед следующим запросом, чтобы не перегружать сервер
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return [];
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Находим ссылки на тесты
                const quizLinks = [];
                doc.querySelectorAll('a[href*="/mod/quiz/view.php"]').forEach(a => {
                    if (a.href && !quizLinks.includes(a.href)) {
                        const urlWithLang = a.href.includes('lang=') ? a.href : 
                                          (a.href.includes('?') ? `${a.href}&lang=ru` : `${a.href}?lang=ru`);
                        quizLinks.push(urlWithLang);
                    }
                });

                // Для каждого теста находим ссылки на результаты
                const allReviewLinks = [];
                for (const quizUrl of quizLinks) {
                    const reviewLinks = await this.findReviewLinksFromQuiz(quizUrl);
                    allReviewLinks.push(...reviewLinks);
                    await new Promise(resolve => setTimeout(resolve, 500)); // Небольшая задержка
                }

                return allReviewLinks;
            } catch (error) {
                console.error(`[findReviewLinksFromCourse] Ошибка при обработке курса ${courseUrl}:`, error);
                return [];
            }
        }

        findDirectReviewLinksOnPage() {
            // Находит прямые ссылки на результаты на текущей странице
            const links = [];
            document.querySelectorAll('a[href*="/mod/quiz/review.php"]').forEach(a => {
                if (a.href && !links.includes(a.href)) {
                    const urlWithLang = a.href.includes('lang=') ? a.href : 
                                      (a.href.includes('?') ? `${a.href}&lang=ru` : `${a.href}?lang=ru`);
                    links.push(urlWithLang);
                }
            });
            return links;
        }

        findReviewLinkFromAttempt(attemptUrl) {
            // Пытаемся найти ссылку на review страницу из attempt.php
            // Обычно это ссылка вида: /mod/quiz/review.php?attempt=XXXXX
            try {
                // Ищем ссылку на review в DOM
                const reviewLink = document.querySelector('a[href*="review.php"], a[href*="/review"]');
                if (reviewLink && reviewLink.href) {
                    const urlWithLang = reviewLink.href.includes('lang=') ? reviewLink.href : 
                                      (reviewLink.href.includes('?') ? `${reviewLink.href}&lang=ru` : `${reviewLink.href}?lang=ru`);
                    return urlWithLang;
                }
                
                // Если не найдено, пытаемся сконструировать URL из attempt URL
                const attemptMatch = attemptUrl.match(/attempt=(\d+)/);
                if (attemptMatch) {
                    const attemptId = attemptMatch[1];
                    const baseUrl = attemptUrl.split('/mod/quiz/')[0];
                    return `${baseUrl}/mod/quiz/review.php?attempt=${attemptId}&lang=ru`;
                }
            } catch (error) {
                console.error('[Force Auto Scan] Ошибка при поиске review ссылки:', error);
            }
            return null;
        }

        findQuizLinksOnPage() {
            // Находит ссылки на тесты на текущей странице
            const links = [];
            document.querySelectorAll('a[href*="/mod/quiz/view.php"]').forEach(a => {
                if (a.href && !links.includes(a.href)) {
                    const urlWithLang = a.href.includes('lang=') ? a.href : 
                                      (a.href.includes('?') ? `${a.href}&lang=ru` : `${a.href}?lang=ru`);
                    links.push(urlWithLang);
                }
            });
            return links;
        }

        async findReviewLinksFromQuiz(quizUrl) {
            // Находит ссылки на результаты теста через fetch
            try {
                const urlWithLang = quizUrl.includes('lang=') ? quizUrl : 
                                  (quizUrl.includes('?') ? `${quizUrl}&lang=ru` : `${quizUrl}?lang=ru`);
                
                const response = await fetch(urlWithLang, {
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': window.location.href,
                        'User-Agent': navigator.userAgent,
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Cache-Control': 'max-age=0'
                    },
                    mode: 'cors',
                    redirect: 'follow'
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        console.warn(`[findReviewLinksFromQuiz] Доступ запрещен (403) для ${urlWithLang}, пропускаю...`);
                        // Добавляем задержку перед следующим запросом, чтобы не перегружать сервер
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return [];
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Проверяем, пройден ли тест (есть ли ссылки на результаты)
                const hasStartButton = doc.querySelector('input[value*="Начать"], button[value*="Начать"]');
                const hasAttemptTable = doc.querySelector('.generaltable, table.attempts');
                
                // Если есть кнопка "Начать" и нет таблицы попыток - тест не пройден
                if (hasStartButton && !hasAttemptTable) {
                    console.log(`[findReviewLinksFromQuiz] Тест не пройден, пропускаю: ${quizUrl}`);
                    return [];
                }

                // Ищем ссылки на результаты
                const reviewLinks = [];
                const baseUrl = new URL(urlWithLang).origin;
                
                doc.querySelectorAll('a[href*="review"], a[href*="attempt"]').forEach(link => {
                    let href = link.getAttribute('href');
                    if (href) {
                        if (!href.startsWith('http')) {
                            href = new URL(href, baseUrl).href;
                        }
                        const urlWithLang = href.includes('lang=') ? href : 
                                          (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                        if (!reviewLinks.includes(urlWithLang)) {
                            reviewLinks.push(urlWithLang);
                        }
                    }
                });

                return reviewLinks;
            } catch (error) {
                console.error(`[findReviewLinksFromQuiz] Ошибка при обработке теста ${quizUrl}:`, error);
                return [];
            }
        }

        findAllReviewLinksOnPage() {
            const links = new Set();
            
            console.log('[findAllReviewLinksOnPage] Начинаю поиск ссылок на странице...');
            
            // Ищем ссылки на результаты тестов и страницы тестов
            const reviewSelectors = [
                'a[href*="review"]',
                'a[href*="attempt"]',
                'a[href*="quiz"]',
                'a[href*="course/view"]', // Добавляем ссылки на курсы
                'a[href*="course/index"]'
            ];

            let totalFound = 0;
            reviewSelectors.forEach(selector => {
                const found = document.querySelectorAll(selector);
                console.log(`[findAllReviewLinksOnPage] Селектор "${selector}": найдено ${found.length} ссылок`);
                totalFound += found.length;
                
                found.forEach(link => {
                    const href = link.href;
                    if (href && !href.includes('#')) {
                        // Включаем ссылки на результаты (review, attempt)
                        if (href.includes('review') || href.includes('attempt')) {
                            const urlWithLang = href.includes('lang=') ? href : 
                                              (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                            links.add(urlWithLang);
                            console.log(`[findAllReviewLinksOnPage] Добавлена ссылка на результат: ${urlWithLang}`);
                        }
                        // Включаем ссылки на страницы тестов (view.php), они будут обработаны отдельно
                        else if (href.includes('quiz') && (href.includes('view.php') || href.includes('id='))) {
                            const urlWithLang = href.includes('lang=') ? href : 
                                              (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                            links.add(urlWithLang);
                            console.log(`[findAllReviewLinksOnPage] Добавлена ссылка на тест: ${urlWithLang}`);
                        }
                        // Включаем ссылки на курсы (для рекурсивного сканирования)
                        else if (href.includes('course/view') || href.includes('course/index')) {
                            const urlWithLang = href.includes('lang=') ? href : 
                                              (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                            links.add(urlWithLang);
                            console.log(`[findAllReviewLinksOnPage] Добавлена ссылка на курс: ${urlWithLang}`);
                        }
                    }
                });
            });

            const result = Array.from(links);
            console.log(`[findAllReviewLinksOnPage] Всего найдено ссылок: ${totalFound}, добавлено в список: ${result.length}`);
            
            return result;
        }

        async scanReviewPageWithFetch(url) {
            try {
                // Загружаем HTML страницы через fetch
                const response = await fetch(url, {
                    credentials: 'include', // Включаем cookies для авторизации
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Referer': window.location.href,
                        'User-Agent': navigator.userAgent,
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Cache-Control': 'max-age=0'
                    },
                    mode: 'cors',
                    redirect: 'follow'
                });

                if (!response.ok) {
                    // Если 403 - это нормально, возможно нет доступа к этой странице
                    if (response.status === 403) {
                        console.warn(`[scanReviewPageWithFetch] Доступ запрещен (403) для ${url}, пропускаю...`);
                        // Добавляем задержку перед следующим запросом, чтобы не перегружать сервер
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return { questions: 0, saved: 0 };
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const html = await response.text();
                
                // Парсим HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Проверяем, что это страница результатов
                const isReviewPage = doc.querySelector('.reviewoptions, #page-mod-quiz-review');
                
                // Если это не страница результатов, но это страница теста, ищем ссылки на результаты
                if (!isReviewPage) {
                    // Проверяем, это страница теста?
                    const isQuizPage = doc.querySelector('#page-mod-quiz-view, .quizinfo, [data-region="quiz-info"]');
                    if (isQuizPage) {
                        console.log('[Force Auto Scan] Это страница теста, ищу ссылки на результаты...');
                        
                        // Ищем ссылки на результаты на странице теста
                        const reviewLinks = [];
                        const baseUrl = new URL(url).origin;
                        
                        // Ищем ссылки на результаты
                        doc.querySelectorAll('a[href*="review"], a[href*="attempt"]').forEach(link => {
                            let href = link.getAttribute('href');
                            if (href) {
                                // Преобразуем относительный URL в абсолютный
                                if (!href.startsWith('http')) {
                                    href = new URL(href, baseUrl).href;
                                }
                                // Добавляем lang=ru если его нет
                                const urlWithLang = href.includes('lang=') ? href : 
                                                  (href.includes('?') ? `${href}&lang=ru` : `${href}?lang=ru`);
                                reviewLinks.push(urlWithLang);
                            }
                        });
                        
                        if (reviewLinks.length === 0) {
                            throw new Error('На странице теста не найдено ссылок на результаты');
                        }
                        
                        console.log(`[Force Auto Scan] Найдено ${reviewLinks.length} ссылок на результаты, сканирую их...`);
                        
                        // Сканируем все найденные ссылки на результаты
                        let totalQuestions = 0;
                        let totalSaved = 0;
                        
                        for (const reviewLink of reviewLinks) {
                            try {
                                const result = await this.scanReviewPageWithFetch(reviewLink);
                                totalQuestions += result.questions;
                                totalSaved += result.saved;
                            } catch (e) {
                                console.error(`[Force Auto Scan] Ошибка при сканировании ${reviewLink}:`, e);
                            }
                            
                            // Небольшая задержка между запросами
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        return {
                            questions: totalQuestions,
                            saved: totalSaved
                        };
                    } else {
                        throw new Error('Не страница результатов теста и не страница теста');
                    }
                }

                // Используем общую функцию для сканирования страницы результатов
                return await this.scanReviewPageFromHTML(html, url);
            } catch (error) {
                console.error('[Force Auto Scan] Ошибка при сканировании страницы:', error);
                throw error;
            }
        }

        async setupAutoForceScan() {
            // Автоматически запускаем принудительное автосканирование при взаимодействии с LMS
            const url = window.location.href;
            
            console.log('%c[Auto Force Scan] Настройка автоматического сканирования', 'color: #2563eb; font-weight: bold; font-size: 14px;');
            console.log('[Auto Force Scan] URL:', url);
            
            // Проверяем, что мы на сайте LMS
            if (!url.includes('lms.mai.ru')) {
                console.log('[Auto Force Scan] Не сайт LMS, пропускаю настройку');
                return;
            }
            
            // На страницах attempt.php автосканирование не нужно, сбрасываем флаг если он установлен
            if (url.includes('attempt.php')) {
                const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                if (scanState.autoScanInProgress) {
                    console.log('[Auto Force Scan] Страница attempt.php - сбрасываю флаг сканирования (автосканирование не нужно на этой странице)');
                    await this.safeStorageSet({ 
                        autoScanInProgress: false, 
                        autoScanStartTime: null,
                        autoScanHeartbeat: null,
                        autoScanUrl: null
                    });
                }
                console.log('[Auto Force Scan] Страница attempt.php - автосканирование отключено (это страница прохождения теста)');
                return;
            }
            
            // Проверяем, не идет ли уже сканирование (в фоне или на другой странице)
            const currentUrl = window.location.href;
            const scanState = await this.safeStorageGet(['autoScanInProgress', 'autoScanStartTime', 'autoScanHeartbeat', 'lastScanTime', 'autoScanUrl']) || {};
            
            // Константы для проверки зависшего сканирования
            const MAX_HEARTBEAT_INTERVAL = 20000; // 20 секунд (уменьшено с 30)
            const MAX_SCAN_DURATION = 120000; // 2 минуты
            
            if (scanState.autoScanInProgress) {
                const startTime = scanState.autoScanStartTime || Date.now();
                const lastHeartbeat = scanState.autoScanHeartbeat || startTime;
                const elapsed = Date.now() - startTime;
                const heartbeatElapsed = Date.now() - lastHeartbeat;
                const scanUrl = scanState.autoScanUrl;
                
                // Если сканирование было запущено на другой странице, разрешаем запуск нового
                if (scanUrl && scanUrl !== currentUrl) {
                    console.log(`[Auto Force Scan] Сканирование было запущено на другой странице (${scanUrl}), разрешаю запуск нового на текущей странице`);
                    await this.safeStorageSet({ 
                        autoScanInProgress: false, 
                        autoScanStartTime: null,
                        autoScanHeartbeat: null,
                        autoScanUrl: null,
                        lastScanTime: null // Сбрасываем lastScanTime, чтобы разрешить немедленный запуск
                    });
                    // Продолжаем выполнение, чтобы запустить новое сканирование
                } else if (heartbeatElapsed > MAX_HEARTBEAT_INTERVAL || elapsed > MAX_SCAN_DURATION) {
                    // Если heartbeat не обновлялся более 20 секунд, считаем сканирование зависшим
                    console.log(`[Auto Force Scan] Обнаружено зависшее сканирование (запущено ${Math.floor(elapsed / 1000)} сек назад, heartbeat ${Math.floor(heartbeatElapsed / 1000)} сек назад), сбрасываю...`);
                    await this.safeStorageSet({ 
                        autoScanInProgress: false, 
                        autoScanStartTime: null,
                        autoScanHeartbeat: null,
                        autoScanUrl: null,
                        lastScanTime: null // Сбрасываем lastScanTime при зависшем сканировании
                    });
                    // Продолжаем выполнение, чтобы запустить новое сканирование
                } else {
                    console.log(`[Auto Force Scan] Сканирование уже выполняется в фоне (запущено ${Math.floor(elapsed / 1000)} сек назад, heartbeat ${Math.floor(heartbeatElapsed / 1000)} сек назад), пропускаю...`);
                    console.log(`[Auto Force Scan] ⚠️ Если данные не появляются в "Сохраненные данные", возможно сканирование было прервано. Подождите ${Math.ceil((MAX_HEARTBEAT_INTERVAL - heartbeatElapsed) / 1000)} сек или перезагрузите страницу.`);
                    return;
                }
            } else {
                // Если сканирование не выполняется, но lastScanTime установлен и прошло много времени,
                // сбрасываем его, чтобы разрешить новое сканирование
                if (scanState.lastScanTime) {
                    const timeSinceLastScan = Date.now() - scanState.lastScanTime;
                    // Если прошло более 5 минут с последнего сканирования, сбрасываем lastScanTime
                    if (timeSinceLastScan > 5 * 60 * 1000) {
                        console.log(`[Auto Force Scan] Последнее сканирование было ${Math.floor(timeSinceLastScan / 1000)} сек назад, сбрасываю lastScanTime`);
                        await this.safeStorageSet({ lastScanTime: null });
                    }
                }
            }
            
            console.log('%c[Auto Force Scan] ✓ Автоматическое сканирование активировано', 'color: #16a34a; font-weight: bold;');

            // Защита от слишком частых запусков
            const scanHistory = await this.safeStorageGet(['lastScanTime', 'dataCleared']) || {};
            let lastScanTime = scanHistory.lastScanTime || 0;
            const MIN_SCAN_INTERVAL = 30000; // Минимум 30 секунд между запусками
            
            // Если данные были очищены, сбрасываем lastScanTime, чтобы разрешить немедленный запуск
            if (scanHistory.dataCleared) {
                console.log('[Auto Force Scan] Данные были очищены, сбрасываю lastScanTime для немедленного запуска');
                lastScanTime = 0;
            }

            // Запускаем сканирование с задержкой после загрузки страницы
            let scanTimeout = null;
            const startAutoScan = async (reason = 'неизвестно') => {
                console.log(`[Auto Force Scan] Запрос на запуск сканирования (причина: ${reason})`);
                
                // Проверяем состояние сканирования в storage
                const currentState = await this.safeStorageGet(['autoScanInProgress', 'lastScanTime']) || {};
                if (currentState.autoScanInProgress) {
                    console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, пропускаю...');
                    return;
                }
                
                // Проверяем, прошло ли достаточно времени с последнего сканирования
                const now = Date.now();
                if (now - lastScanTime < MIN_SCAN_INTERVAL) {
                    const remaining = Math.ceil((MIN_SCAN_INTERVAL - (now - lastScanTime)) / 1000);
                    console.log(`[Auto Force Scan] Слишком рано для повторного сканирования, осталось ${remaining} сек...`);
                    return;
                }

                // Проверяем, не выполняется ли уже сканирование локально
                if (this.isForceScanning) {
                    console.log('[Auto Force Scan] Сканирование уже выполняется локально, пропускаю...');
                    return;
                }

                if (this.isProcessingReview) {
                    console.log('[Auto Force Scan] Обработка результатов уже выполняется, пропускаю...');
                    return;
                }

                // Отменяем предыдущий таймер, если есть
                if (scanTimeout) {
                    clearTimeout(scanTimeout);
                    console.log('[Auto Force Scan] Отменен предыдущий таймер');
                }
                
                console.log('[Auto Force Scan] Установлен таймер на 3 секунды...');
                
                // Запускаем сканирование через 3 секунды после последнего взаимодействия
                scanTimeout = setTimeout(async () => {
                    // Еще раз проверяем состояние перед запуском
                    const finalCheck = await this.safeStorageGet(['autoScanInProgress']) || {};
                    if (finalCheck.autoScanInProgress) {
                        console.log('[Auto Force Scan] Сканирование уже запущено в фоне, отменяю...');
                        return;
                    }
                    
                    if (!this.isForceScanning && !this.isProcessingReview) {
                        lastScanTime = Date.now();
                        await this.safeStorageSet({ lastScanTime: lastScanTime });
                        console.log('%c[Auto Force Scan] 🚀 Автоматический запуск сканирования...', 'color: #2563eb; font-weight: bold; font-size: 14px;');
                        this.showNotification('Автоматическое сканирование запущено...', 'info');
                        try {
                            await this.forceAutoScan();
                        } catch (error) {
                            console.error('[Auto Force Scan] Ошибка при автоматическом сканировании:', error);
                            this.showNotification('Ошибка при автоматическом сканировании: ' + error.message, 'error');
                        }
                    } else {
                        console.log('[Auto Force Scan] Сканирование отменено (уже выполняется)');
                    }
                }, 3000);
            };

            // Запускаем при загрузке страницы (только если не страница attempt.php)
            // На страницах attempt.php автосканирование не нужно, так как это страница прохождения теста
            // Проверка уже выполнена выше, здесь просто запускаем
            if (document.readyState === 'loading') {
                console.log('[Auto Force Scan] Документ загружается, жду DOMContentLoaded...');
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('[Auto Force Scan] DOMContentLoaded, запускаю сканирование...');
                    startAutoScan('загрузка страницы');
                });
            } else {
                console.log('[Auto Force Scan] Документ уже загружен, запускаю сканирование...');
                startAutoScan('загрузка страницы');
            }

            // Слушаем изменения DOM для автоматического запуска при навигации
            // Добавляем дебаунсинг, чтобы избежать бесконечного цикла
            let domChangeTimeout = null;
            let lastDomCheck = 0;
            const DOM_CHECK_INTERVAL = 5000; // Проверяем не чаще раза в 5 секунд
            
            const observer = new MutationObserver((mutations) => {
                // Пропускаем изменения на страницах attempt.php (там не нужно автосканирование)
                if (url.includes('attempt.php')) {
                    return;
                }
                
                // Дебаунсинг: проверяем не чаще раза в 5 секунд
                const now = Date.now();
                if (now - lastDomCheck < DOM_CHECK_INTERVAL) {
                    return;
                }
                lastDomCheck = now;
                
                // Отменяем предыдущий таймер
                if (domChangeTimeout) {
                    clearTimeout(domChangeTimeout);
                }
                
                // Устанавливаем новый таймер с задержкой
                domChangeTimeout = setTimeout(() => {
                    // Проверяем, появились ли новые ссылки или элементы
                    let hasNewContent = false;
                    mutations.forEach((mutation) => {
                        if (mutation.addedNodes.length > 0) {
                            hasNewContent = true;
                        }
                    });

                    if (hasNewContent) {
                        // Проверяем, есть ли ссылки на тесты или результаты
                        const hasQuizLinks = document.querySelector('a[href*="quiz"], a[href*="review"], a[href*="attempt"]');
                        if (hasQuizLinks) {
                            // Проверяем состояние сканирования асинхронно
                            this.safeStorageGet(['autoScanInProgress']).then(scanState => {
                                if (!scanState || !scanState.autoScanInProgress) {
                                    startAutoScan('изменение DOM');
                                } else {
                                    console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при изменении DOM');
                                }
                            });
                        }
                    }
                }, 2000); // Задержка 2 секунды перед проверкой
            });

            // Наблюдаем за изменениями в body (только если не страница attempt.php)
            if (!url.includes('attempt.php')) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            // Слушаем клики по ссылкам для автоматического запуска
            document.addEventListener('click', async (e) => {
                const link = e.target.closest('a');
                if (link && (link.href.includes('quiz') || link.href.includes('review') || link.href.includes('attempt'))) {
                    // Проверяем, не идет ли уже сканирование
                    const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                    if (scanState.autoScanInProgress) {
                        console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при клике');
                        return;
                    }
                    startAutoScan('клик по ссылке');
                }
            }, true);

            // Слушаем изменения URL (для SPA навигации)
            let lastUrl = location.href;
            new MutationObserver(async () => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    
                    // Проверяем, не идет ли уже сканирование перед запуском нового
                    const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                    if (scanState.autoScanInProgress) {
                        console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при навигации');
                        return;
                    }
                    
                    startAutoScan('изменение URL');
                }
            }).observe(document, { subtree: true, childList: true });

            // Слушаем события навигации через History API
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = async function(...args) {
                originalPushState.apply(history, args);
                const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                if (!scanState.autoScanInProgress) {
                    startAutoScan('pushState');
                } else {
                    console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при pushState');
                }
            };
            
            history.replaceState = async function(...args) {
                originalReplaceState.apply(history, args);
                const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                if (!scanState.autoScanInProgress) {
                    startAutoScan('replaceState');
                } else {
                    console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при replaceState');
                }
            };
            
            window.addEventListener('popstate', async () => {
                const scanState = await this.safeStorageGet(['autoScanInProgress']) || {};
                if (!scanState.autoScanInProgress) {
                    startAutoScan('popstate');
                } else {
                    console.log('[Auto Force Scan] Сканирование уже выполняется в фоне, не запускаю новое при popstate');
                }
            });

            console.log('[Auto Force Scan] Автоматическое сканирование настроено');
        }

        showQuizResults(total, correct, incorrect, results) {
            // Не показываем панель если нет вопросов
            if (total === 0 || results.length === 0) {
                console.log('[showQuizResults] Нет вопросов для отображения, панель не создается');
                return;
            }
            
            const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
            
            // Создаем панель результатов
            const resultsPanel = document.createElement('div');
            resultsPanel.id = 'quiz-solver-results-panel';
            resultsPanel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                z-index: 100001;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-height: 85vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;

            const percentageColor = percentage >= 80 ? '#16a34a' : percentage >= 60 ? '#2563eb' : '#2563eb';
            
            resultsPanel.innerHTML = `
                <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #111827; font-size: 16px; font-weight: 700;">Результаты теста</h3>
                    <button id="close-results-panel" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; line-height: 1; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: 700;">×</button>
                </div>
                <div style="padding: 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 36px; font-weight: 700; color: ${percentageColor}; margin-bottom: 4px;">${percentage}%</div>
                    <div style="font-size: 13px; color: #6b7280; font-weight: 500;">Правильных ответов</div>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div style="text-align: center; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <div style="font-size: 20px; font-weight: 700; color: #16a34a; margin-bottom: 4px;">${correct}</div>
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Правильно</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <div style="font-size: 20px; font-weight: 700; color: #dc2626; margin-bottom: 4px;">${incorrect}</div>
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Неправильно</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <div style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px;">${total}</div>
                        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Всего</div>
                    </div>
                </div>
                <div style="padding: 16px; flex: 1; overflow-y: auto;">
                    <div style="font-size: 12px; font-weight: 700; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Детали по вопросам</div>
                    <div id="results-details" style="display: flex; flex-direction: column; gap: 8px;"></div>
                </div>
            `;

            document.body.appendChild(resultsPanel);

            // Добавляем детали по вопросам
            const detailsContainer = document.getElementById('results-details');
            results.forEach((result, index) => {
                const detailItem = document.createElement('div');
                detailItem.style.cssText = `
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: white;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                
                detailItem.addEventListener('mouseenter', () => {
                    detailItem.style.borderColor = result.isCorrect ? '#16a34a' : '#dc2626';
                    detailItem.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                });
                
                detailItem.addEventListener('mouseleave', () => {
                    detailItem.style.borderColor = '#e5e7eb';
                    detailItem.style.boxShadow = 'none';
                });
                
                const answerText = this.formatAnswer(result.userAnswer);
                detailItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 600; color: #111827;">Вопрос ${index + 1}</span>
                        <span style="font-size: 11px; font-weight: 700; color: ${result.isCorrect ? '#16a34a' : '#dc2626'}; padding: 2px 8px; background: ${result.isCorrect ? '#f0fdf4' : '#fef2f2'}; border-radius: 4px; border: 1px solid ${result.isCorrect ? '#bbf7d0' : '#fecaca'};">
                            ${result.isCorrect ? 'Правильно' : 'Неправильно'}
                        </span>
                    </div>
                    <div style="font-size: 12px; color: #6b7280; font-weight: 500;">
                        Ваш ответ: <span style="color: #111827; font-weight: 600;">${answerText}</span>
                    </div>
                `;
                
                detailItem.addEventListener('click', () => {
                    result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    result.element.style.outline = '2px solid #2563eb';
                    result.element.style.outlineOffset = '2px';
                    setTimeout(() => {
                        result.element.style.outline = '';
                        result.element.style.outlineOffset = '';
                    }, 2000);
                });
                
                detailsContainer.appendChild(detailItem);
            });

            // Закрытие панели
            const closeBtn = document.getElementById('close-results-panel');
            closeBtn.addEventListener('click', () => {
                resultsPanel.remove();
            });
            
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.color = '#111827';
                closeBtn.style.background = '#f3f4f6';
            });
            
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.color = '#6b7280';
                closeBtn.style.background = 'transparent';
            });
        }

        determineCorrectnessFromReview(element) {
            // Проверяем классы правильности
            if (element.classList.contains('correct')) {
                return true;
            }
            if (element.classList.contains('incorrect')) {
                return false;
            }
            if (element.classList.contains('partiallycorrect')) {
                return false; // Частично правильный считаем неправильным для статистики
            }

            // Проверяем наличие зеленых элементов (правильные ответы)
            const correctElements = element.querySelectorAll('.correct, .rightanswer');
            if (correctElements.length > 0) {
                return true;
            }

            // Проверяем наличие красных элементов (неправильные ответы)
            const incorrectElements = element.querySelectorAll('.incorrect, .wronganswer');
            if (incorrectElements.length > 0) {
                return false;
            }

            return null;
        }

        extractUserAnswerFromReview(element, question) {
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                // Способ 1: Ищем выбранный ответ в review (приоритет - checked input)
                const selected = element.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
                if (selected) {
                    const label = element.querySelector(`label[for="${selected.id}"]`) || 
                                 selected.closest('label') ||
                                 selected.parentElement;
                    if (label) {
                        // Получаем полный текст ответа
                        let text = label.innerText || label.textContent || '';
                        
                        // Убираем маркеры правильности (✓, ✗ и т.д.)
                        text = text.replace(/[✓✗✔✘]/g, '').trim();
                        
                        // ВАЖНО: Парсим ответ правильно, сохраняя все цифры
                        // Ищем паттерн: буква варианта, точка (опционально), пробелы, затем весь остальной текст
                        const answerMatch = text.match(/^([a-e])\.?\s*(.+)$/i);
                        if (answerMatch) {
                            const variant = answerMatch[1].toLowerCase();
                            let answerValue = answerMatch[2].trim();
                            
                            // Нормализуем пробелы, но сохраняем все символы (включая цифры)
                            answerValue = answerValue.replace(/\s+/g, ' ').trim();
                            
                            // Формируем полный ответ в формате "d. 32.7"
                            const fullText = `${variant}. ${answerValue}`;
                            
                            console.log('[extractUserAnswerFromReview] Способ 1: извлечен ответ:', fullText, 'из текста:', text);
                            
                            return {
                                value: selected.value,
                                text: fullText
                            };
                        }
                        
                        // Если паттерн не найден, используем весь текст как есть
                        // Нормализуем пробелы
                        text = text.replace(/\s+/g, ' ').trim();
                        
                        console.log('[extractUserAnswerFromReview] Способ 1: использован весь текст:', text);
                        
                        return {
                            value: selected.value,
                            text: text
                        };
                    }
                }

                // Способ 2: Ищем в тексте "Ваш ответ:" или "Your answer:" (более надежно)
                const answerText = element.innerText || element.textContent;
                // Ищем более широкий паттерн, включая числа с десятичными знаками
                const answerMatch = answerText.match(/(?:Ваш ответ|Your answer|Ответ|Выбранный ответ):\s*([a-z]\.?\s*[^\n]+?)(?:\n|$)/i);
                if (answerMatch) {
                    let answerStr = answerMatch[1].trim();
                    
                    console.log('[extractUserAnswerFromReview] Способ 2: найден текст ответа:', answerStr);
                    
                    // Извлекаем букву варианта и полное значение (включая числа)
                    // Паттерн: буква, точка (опционально), пробелы, затем все остальное до конца строки
                    const variantMatch = answerStr.match(/^([a-e])\.?\s*(.+)$/i);
                    if (variantMatch) {
                        const variant = variantMatch[1].toLowerCase();
                        let answerValue = variantMatch[2].trim();
                        
                        // Убираем лишние пробелы, но сохраняем все символы (включая цифры)
                        answerValue = answerValue.replace(/\s+/g, ' ').trim();
                        
                        // Формируем полный ответ в формате "d. 32.7"
                        const fullText = `${variant}. ${answerValue}`;
                        
                        console.log('[extractUserAnswerFromReview] Способ 2: извлечен ответ:', fullText, 'вариант:', variant, 'значение:', answerValue);
                        
                        // Пытаемся найти соответствующий вариант в question.answers
                        for (const answer of question.answers || []) {
                            if (answer.value === variant || answer.value.toLowerCase() === variant) {
                                // Используем извлеченное значение с полным форматом
                                return {
                                    value: answer.value,
                                    text: fullText
                                };
                            }
                        }
                        
                        // Если не нашли в question.answers, возвращаем то что извлекли
                        return {
                            value: variant,
                            text: fullText
                        };
                    } else {
                        console.log('[extractUserAnswerFromReview] Способ 2: не удалось распарсить вариант из:', answerStr);
                    }
                }
                
                // Способ 2.5: Ищем правильный ответ, если он выделен (для случаев когда нужно сохранить правильный)
                const correctAnswer = element.querySelector('.rightanswer, .correctanswer, .correct .answer');
                if (correctAnswer) {
                    const correctText = correctAnswer.innerText || correctAnswer.textContent;
                    console.log('[extractUserAnswerFromReview] Способ 2.5: найден правильный ответ:', correctText);
                    
                    const correctMatch = correctText.match(/^([a-e])\.?\s*(.+)$/i);
                    if (correctMatch) {
                        const variant = correctMatch[1].toLowerCase();
                        let answerValue = correctMatch[2].trim();
                        answerValue = answerValue.replace(/\s+/g, ' ').trim();
                        
                        // Формируем полный ответ в формате "d. 32.7"
                        const fullText = `${variant}. ${answerValue}`;
                        
                        console.log('[extractUserAnswerFromReview] Способ 2.5: извлечен ответ:', fullText);
                        
                        for (const answer of question.answers || []) {
                            if (answer.value === variant || answer.value.toLowerCase() === variant) {
                                return {
                                    value: answer.value,
                                    text: fullText
                                };
                            }
                        }
                    }
                }

                // Способ 3: Ищем в тексте ответа, который выделен как выбранный (не правильный!)
                const answerLabels = element.querySelectorAll('label, .answer, .option');
                for (const label of answerLabels) {
                    // Приоритет: checked input, затем selected/answered классы
                    const input = label.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
                    if (input) {
                        let text = label.innerText || label.textContent || '';
                        
                        // Убираем маркеры правильности
                        text = text.replace(/[✓✗✔✘]/g, '').trim();
                        
                        // ВАЖНО: Парсим ответ правильно, сохраняя все цифры
                        // Ищем паттерн: буква варианта, точка (опционально), пробелы, затем весь остальной текст
                        const answerMatch = text.match(/^([a-e])\.?\s*(.+)$/i);
                        if (answerMatch) {
                            const variant = answerMatch[1].toLowerCase();
                            let answerValue = answerMatch[2].trim();
                            answerValue = answerValue.replace(/\s+/g, ' ').trim();
                            const fullText = `${variant}. ${answerValue}`;
                            
                            console.log('[extractUserAnswerFromReview] Способ 3 (checked): извлечен ответ:', fullText);
                            
                            return {
                                value: input.value,
                                text: fullText
                            };
                        }
                        
                        // Если паттерн не найден, используем весь текст
                        text = text.replace(/\s+/g, ' ').trim();
                        
                        console.log('[extractUserAnswerFromReview] Способ 3 (checked): использован весь текст:', text);
                        
                        return {
                            value: input.value,
                            text: text
                        };
                    }
                    
                    // Если нет checked, но есть класс selected/answered (не correct!)
                    if (label.classList.contains('selected') || label.classList.contains('answered')) {
                        const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input) {
                            let text = label.innerText || label.textContent || '';
                            
                            // Убираем маркеры правильности
                            text = text.replace(/[✓✗✔✘]/g, '').trim();
                            
                            // ВАЖНО: Парсим ответ правильно, сохраняя все цифры
                            const answerMatch = text.match(/^([a-e])\.?\s*(.+)$/i);
                            if (answerMatch) {
                                const variant = answerMatch[1].toLowerCase();
                                let answerValue = answerMatch[2].trim();
                                answerValue = answerValue.replace(/\s+/g, ' ').trim();
                                const fullText = `${variant}. ${answerValue}`;
                                
                                console.log('[extractUserAnswerFromReview] Способ 3 (selected): извлечен ответ:', fullText);
                                
                                return {
                                    value: input.value,
                                    text: fullText
                                };
                            }
                            
                            // Если паттерн не найден, используем весь текст
                            text = text.replace(/\s+/g, ' ').trim();
                            
                            console.log('[extractUserAnswerFromReview] Способ 3 (selected): использован весь текст:', text);
                            
                            return {
                                value: input.value,
                                text: text
                            };
                        }
                    }
                }
            } else if (question.type === 'shortanswer' || question.type === 'numerical') {
                // Ищем в input или в тексте
                const input = element.querySelector('input[type="text"], input[type="number"]');
                if (input && input.value) {
                    return input.value.trim();
                }
                
                // Ищем в тексте "Ваш ответ:"
                const answerText = element.innerText || element.textContent;
                const answerMatch = answerText.match(/(?:Ваш ответ|Your answer|Ответ):\s*([^\n]+)/i);
                if (answerMatch) {
                    return answerMatch[1].trim();
                }
            }
            return null;
        }

        // Хеширование текста вопроса для идентификации
        hashQuestion(questionText) {
            if (!questionText) return 'empty';
            
            let hash = 0;
            // Нормализация текста для стабильного hash:
            // 1. Приводим к нижнему регистру
            // 2. Убираем лишние пробелы
            // 3. Нормализуем пробелы вокруг знаков равенства (a=1 -> a = 1)
            // 4. Убираем множественные пробелы
            // 5. ВАЖНО: Сохраняем все числовые значения, включая параметры в экспонентах
            let normalized = questionText.toLowerCase().trim();
            
            // Нормализуем пробелы вокруг знаков равенства, но сохраняем все числовые значения
            normalized = normalized.replace(/\s*=\s*/g, ' = ');
            
            // Нормализуем пробелы вокруг операторов, но сохраняем числовые значения
            normalized = normalized.replace(/\s*([+\-*/^])\s*/g, ' $1 ');
            
            // Убираем множественные пробелы, но сохраняем одиночные пробелы
            normalized = normalized.replace(/\s+/g, ' ');
            normalized = normalized.trim();
            
            // ВАЖНО: Убеждаемся, что все числовые значения (включая десятичные и отрицательные) сохраняются
            // Проверяем, что числовые паттерны не потеряны
            const numberPattern = /[-+]?\d+\.?\d*/g;
            const numbers = normalized.match(numberPattern);
            if (numbers) {
                // Добавляем числовые значения в хеш отдельно для надежности
                numbers.forEach(num => {
                    const numStr = num.trim();
                    for (let i = 0; i < numStr.length; i++) {
                        hash = ((hash << 5) - hash) + numStr.charCodeAt(i);
                        hash = hash & hash;
                    }
                });
            }
            
            // Хешируем весь нормализованный текст
            for (let i = 0; i < normalized.length; i++) {
                const char = normalized.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            const finalHash = Math.abs(hash).toString(36);
            console.log('[hashQuestion] Хеш вычислен:', finalHash, 'для текста длиной', normalized.length, 'символов');
            if (numbers) {
                console.log('[hashQuestion] Найдено числовых значений:', numbers.length, numbers);
            }
            
            return finalHash;
        }

        async loadSavedAnswers() {
            try {
                // Проверяем, не была ли выполнена очистка данных
                const clearState = await this.safeStorageGet(['dataCleared', 'dataClearedTimestamp']);
                if (clearState.dataCleared) {
                    const clearTime = clearState.dataClearedTimestamp || 0;
                    const timeSinceClear = Date.now() - clearTime;
                    // Если прошло менее 5 минут с момента очистки, не загружаем данные с сервера
                    if (timeSinceClear < 5 * 60 * 1000) {
                        console.log('[loadSavedAnswers] Данные были очищены недавно, пропускаю загрузку с сервера');
                        // Сбрасываем флаг через 5 минут
                        setTimeout(async () => {
                            await this.safeStorageSet({ 
                                dataCleared: false,
                                dataClearedTimestamp: null
                            });
                        }, 5 * 60 * 1000 - timeSinceClear);
                    } else {
                        // Сбрасываем флаг, если прошло достаточно времени
                        await this.safeStorageSet({ 
                            dataCleared: false,
                            dataClearedTimestamp: null
                        });
                    }
                }
                
                const result = await this.safeStorageGet(null);
                if (!result) {
                    return;
                }
                
                for (const [key, value] of Object.entries(result)) {
                    if (key.startsWith('answer_')) {
                        this.savedAnswers.set(key.replace('answer_', ''), value);
                    }
                }
                console.log(`Loaded ${this.savedAnswers.size} saved answers`);
            } catch (e) {
                console.error('Error loading saved answers:', e);
            }
        }

        async loadStatistics() {
            try {
                // Загружаем статистику из local storage (каждая статистика хранится отдельно с префиксом stats_)
                const allData = await this.safeStorageGet(null);
                if (!allData) {
                    return;
                }
                
                let loadedCount = 0;
                
                for (const [key, value] of Object.entries(allData)) {
                    if (key.startsWith('stats_')) {
                        const questionHash = key.replace('stats_', '');
                        this.statistics.set(questionHash, value);
                        loadedCount++;
                    }
                }
                
                console.log(`Loaded ${loadedCount} questions from local storage`);

                // Всегда загружаем статистику с сервера (синхронизация всегда включена)
                const settings = { enabled: true, apiUrl: 'http://130.61.200.70:8080', apiKey: '' };
                await this.loadStatisticsFromServer(settings);
            } catch (e) {
                console.error('Error loading statistics:', e);
            }
        }

        async loadStatisticsFromServer(settings) {
            try {
                console.log('[loadStatisticsFromServer] Начало загрузки статистики с сервера');
                const response = await this.safeSendMessage({
                    action: 'syncWithServer',
                    syncAction: 'getAllStatistics'
                });

                console.log('[loadStatisticsFromServer] Ответ от сервера:', response);

                if (!response) {
                    console.warn('[loadStatisticsFromServer] Нет ответа от сервера');
                    return;
                }

                if (!response.success) {
                    console.warn('[loadStatisticsFromServer] Запрос не успешен:', response.error || 'Unknown error');
                    return;
                }

                if (!response.data) {
                    console.warn('[loadStatisticsFromServer] Нет данных в ответе');
                    return;
                }

                const serverStats = response.data.statistics || {};
                let loadedCount = 0;

                console.log('[loadStatisticsFromServer] Получено статистики с сервера:', Object.keys(serverStats).length, 'вопросов');

                // Объединяем статистику с сервера с локальной
                for (const [key, value] of Object.entries(serverStats)) {
                    const localStats = this.statistics.get(key);
                    if (localStats) {
                        // Объединяем: берем максимум из обоих источников
                        const localErrors = Array.isArray(localStats.errors) ? localStats.errors : [];
                        const serverErrors = Array.isArray(value.errors) ? value.errors : [];
                        const merged = {
                            totalAttempts: Math.max(localStats.totalAttempts || 0, value.totalAttempts || 0),
                            correctAttempts: Math.max(localStats.correctAttempts || 0, value.correctAttempts || 0),
                            answers: { ...(localStats.answers || {}), ...(value.answers || {}) },
                            errors: [...localErrors, ...serverErrors]
                        };
                        this.statistics.set(key, merged);
                    } else {
                        // Убеждаемся, что все обязательные поля присутствуют
                        const statsWithDefaults = {
                            totalAttempts: value.totalAttempts || 0,
                            correctAttempts: value.correctAttempts || 0,
                            answers: value.answers || {},
                            errors: Array.isArray(value.errors) ? value.errors : []
                        };
                        this.statistics.set(key, statsWithDefaults);
                    }
                    loadedCount++;
                }

                console.log(`Loaded ${loadedCount} questions from server`);
            } catch (e) {
                console.error('Error loading statistics from server:', e);
            }
        }

        // Извлечение названия курса и теста из DOM (может быть document или DocumentFragment)
        getCourseAndQuizNamesFromDOM(doc = document, url = window.location.href) {
            try {
                let courseName = null;
                let quizName = null;
                
                // Пытаемся извлечь название курса из breadcrumb или заголовка
                const breadcrumb = doc.querySelector('.breadcrumb, .breadcrumb-item, nav[aria-label="breadcrumb"]');
                if (breadcrumb) {
                    const breadcrumbLinks = breadcrumb.querySelectorAll('a');
                    breadcrumbLinks.forEach(link => {
                        const href = link.getAttribute('href') || '';
                        if (href.includes('/course/view.php')) {
                            courseName = link.textContent.trim();
                        }
                        if (href.includes('/mod/quiz/view.php')) {
                            quizName = link.textContent.trim();
                        }
                    });
                }
                
                // Если не нашли в breadcrumb, ищем в заголовках
                if (!courseName) {
                    const courseHeader = doc.querySelector('h1.coursename, .page-header-headings h1, .course-header h1');
                    if (courseHeader) {
                        courseName = courseHeader.textContent.trim();
                    }
                }
                
                // Ищем название теста в заголовке
                if (!quizName) {
                    const quizHeader = doc.querySelector('h1.quizname, .page-header-headings h1, .quiz-header h1, h2.quizname');
                    if (quizHeader) {
                        quizName = quizHeader.textContent.trim();
                    }
                }
                
                // Если все еще не нашли, пытаемся извлечь из URL
                if (!courseName && url.includes('/course/view.php')) {
                    const courseMatch = url.match(/[?&]id=(\d+)/);
                    if (courseMatch) {
                        courseName = `Курс #${courseMatch[1]}`;
                    }
                }
                
                if (!quizName && url.includes('/mod/quiz/')) {
                    const quizMatch = url.match(/[?&]id=(\d+)/);
                    if (quizMatch) {
                        quizName = `Тест #${quizMatch[1]}`;
                    }
                }
                
                return { courseName, quizName };
            } catch (e) {
                console.warn('[getCourseAndQuizNamesFromDOM] Ошибка при извлечении названий:', e);
                return { courseName: null, quizName: null };
            }
        }

        // Извлечение названия курса и теста из текущей страницы
        getCourseAndQuizNames() {
            return this.getCourseAndQuizNamesFromDOM(document, window.location.href);
        }

        async saveAnswer(questionHash, answer, isCorrect = null, questionText = null, questionImage = null) {
            try {
                // Проверяем доступность chrome.storage
                if (!chrome || !chrome.storage || !chrome.storage.local) {
                    console.warn('[Save] chrome.storage недоступен, пропускаю сохранение');
                    return false;
                }
                
                // Проверяем, есть ли уже сохраненный ответ
                const existingKey = `answer_${questionHash}`;
                const existing = await this.safeStorageGet([existingKey]);
                const existingData = existing[existingKey];
                
                // Если ответ уже есть, обновляем только если новый статус более точный
                let shouldUpdate = true;
                if (existingData) {
                    // Обновляем если:
                    // 1. Старый статус был null, а новый известен
                    // 2. Новый статус отличается от старого (исправляем ошибку)
                    // 3. Есть текст вопроса, а раньше не было
                    // 4. Есть изображение, а раньше не было
                    if (existingData.isCorrect !== null && isCorrect === null) {
                        shouldUpdate = false; // Не перезаписываем известный статус на null
                    } else if (existingData.isCorrect === isCorrect && 
                               existingData.questionText && !questionText &&
                               existingData.questionImage && !questionImage) {
                        shouldUpdate = false; // Не теряем текст вопроса и изображение
                    }
                } else {
                    // Если данных нет, всегда сохраняем (новый ответ)
                    shouldUpdate = true;
                }

                if (shouldUpdate) {
                    // Извлекаем названия курса и теста, если их еще нет
                    const { courseName, quizName } = this.getCourseAndQuizNames();
                    
                    const answerData = {
                        answer: answer,
                        timestamp: existingData?.timestamp || Date.now(), // Сохраняем оригинальную дату
                        isCorrect: isCorrect !== null ? isCorrect : (existingData?.isCorrect || null),
                        questionText: questionText || existingData?.questionText || null,
                        questionImage: questionImage || existingData?.questionImage || null,
                        courseName: courseName || existingData?.courseName || null,
                        quizName: quizName || existingData?.quizName || null
                    };
                    
                    console.log(`[Save] Сохраняем данные: questionImage=${questionImage ? 'есть (' + questionImage.length + ' байт)' : 'нет'}`);
                    
                    const saved = await this.safeStorageSet({
                        [existingKey]: answerData
                    });
                    if (!saved) {
                        console.warn(`[Save] Не удалось сохранить данные для ${questionHash}`);
                        return false;
                    }
                    
                    this.savedAnswers.set(questionHash, answerData);
                    console.log(`[Save] ${existingData ? 'Обновлен' : 'Сохранен'} ответ для вопроса (hash: ${questionHash}, isCorrect: ${isCorrect})`);
                    
                    // Добавляем запрос на синхронизацию в очередь (батчинг)
                    this.queueSyncRequest({
                        syncAction: 'saveAnswer',
                        questionHash: questionHash,
                        answer: answer,
                        isCorrect: answerData.isCorrect,
                        questionText: answerData.questionText,
                        questionImage: answerData.questionImage
                    });
                    
                    return true; // Возвращаем true если было обновление
                }
                
                return false; // Не было обновления
            } catch (e) {
                console.error('Error saving answer:', e);
                return false;
            }
        }

        async updateStatistics(questionHash, answer, isCorrect) {
            try {
                let stats = this.statistics.get(questionHash);
                
                // Если статистики нет или она некорректна, создаем новую
                if (!stats || typeof stats !== 'object') {
                    stats = {
                        totalAttempts: 0,
                        correctAttempts: 0,
                        answers: {},
                        errors: []
                    };
                }

                // Убеждаемся, что все обязательные поля присутствуют
                if (!Array.isArray(stats.errors)) {
                    stats.errors = [];
                }
                if (!stats.answers || typeof stats.answers !== 'object') {
                    stats.answers = {};
                }
                if (typeof stats.totalAttempts !== 'number') {
                    stats.totalAttempts = 0;
                }
                if (typeof stats.correctAttempts !== 'number') {
                    stats.correctAttempts = 0;
                }

                stats.totalAttempts++;
                if (isCorrect) {
                    stats.correctAttempts++;
                } else {
                    stats.errors.push({
                        answer: answer,
                        timestamp: Date.now()
                    });
                }

                // Подсчет популярности ответов
                const answerKey = JSON.stringify(answer);
                stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

                this.statistics.set(questionHash, stats);

                // Используем local storage вместо sync чтобы избежать quota exceeded
                // Сохраняем каждую статистику отдельно
                await this.safeStorageSet({
                    [`stats_${questionHash}`]: stats
                });

                // Добавляем запрос на синхронизацию статистики в очередь (батчинг)
                this.queueSyncRequest({
                    syncAction: 'submitAnswer',
                    questionHash: questionHash,
                    answer: answer,
                    isCorrect: isCorrect
                });
            } catch (e) {
                console.error('Error updating statistics:', e);
            }
        }

        parseQuestions() {
            const questionElements = document.querySelectorAll('.que');
            
            questionElements.forEach((element, index) => {
                const question = this.parseQuestion(element, index);
                if (question) {
                    this.questions.set(question.id, question);
                }
            });

            console.log(`Parsed ${this.questions.size} questions`);
        }

        parseQuestion(element, index) {
            try {
                const questionId = this.extractQuestionId(element) || `question_${index}`;
                const type = this.detectQuestionType(element);
                const text = this.extractQuestionText(element);
                
                if (!text) return null;

                console.log('[parseQuestion] Извлеченный текст вопроса:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
                const questionHash = this.hashQuestion(text);
                console.log('[parseQuestion] Хеш вопроса:', questionHash);
                const savedAnswer = this.savedAnswers.get(questionHash);
                const stats = this.statistics.get(questionHash);

                return {
                    id: questionId,
                    hash: questionHash,
                    type: type,
                    text: text,
                    element: element,
                    answers: this.extractAnswers(element, type),
                    options: this.extractOptions(element, type),
                    savedAnswer: savedAnswer,
                    statistics: stats
                };
            } catch (e) {
                console.error('Error parsing question:', e);
                return null;
            }
        }

        extractQuestionId(element) {
            const input = element.querySelector('input[name*="qid"], input[name*="question"]');
            if (input) {
                const match = input.name.match(/qid[:\[](\d+)/) || input.name.match(/question[:\[](\d+)/);
                if (match) return match[1];
            }
            
            const idAttr = element.id || element.querySelector('[id*="q"]')?.id;
            if (idAttr) {
                const match = idAttr.match(/(\d+)/);
                if (match) return match[1];
            }
            
            return null;
        }

        async extractQuestionImage(element) {
            try {
                // Ищем изображение в тексте вопроса
                const qtext = element.querySelector('.qtext, .questiontext');
                if (!qtext) {
                    console.log('[extractQuestionImage] .qtext не найден');
                    return null;
                }

                const img = qtext.querySelector('img');
                if (!img || !img.src) {
                    console.log('[extractQuestionImage] img не найдено в .qtext');
                    return null;
                }

                console.log('[extractQuestionImage] Найдено изображение:', img.src.substring(0, 100));
                
                // Конвертируем изображение в base64
                const base64 = await this.imageToBase64(img.src);
                if (base64) {
                    console.log('[extractQuestionImage] Изображение успешно конвертировано, размер:', base64.length);
                }
                return base64;
            } catch (e) {
                console.error('Error extracting question image:', e);
                return null;
            }
        }

        async imageToBase64(url) {
            try {
                // Если уже base64, проверяем размер
                if (url.startsWith('data:')) {
                    // Если изображение слишком большое, сжимаем его
                    if (url.length > 50000) { // ~50KB
                        return await this.compressImage(url);
                    }
                    return url;
                }

                // Загружаем изображение
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        'Referer': window.location.href,
                        'User-Agent': navigator.userAgent
                    },
                    mode: 'cors'
                });
                
                if (!response.ok) {
                    if (response.status === 403) {
                        console.warn(`[imageToBase64] Доступ запрещен (403) для изображения ${url}, пропускаю...`);
                        return null;
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const base64 = reader.result;
                        // Если изображение слишком большое, сжимаем
                        if (base64.length > 50000) { // ~50KB
                            resolve(await this.compressImage(base64));
                        } else {
                            resolve(base64);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error('Error converting image to base64:', e);
                return null;
            }
        }

        async compressImage(base64) {
            try {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        
                        // Уменьшаем размер если изображение большое
                        const maxSize = 400; // максимальная ширина/высота
                        if (width > maxSize || height > maxSize) {
                            if (width > height) {
                                height = (height / width) * maxSize;
                                width = maxSize;
                            } else {
                                width = (width / height) * maxSize;
                                height = maxSize;
                            }
                        }
                        
                        canvas.width = width;
                        canvas.height = height;
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // Сжимаем в JPEG с качеством 0.7
                        const compressed = canvas.toDataURL('image/jpeg', 0.7);
                        resolve(compressed);
                    };
                    img.onerror = () => {
                        console.warn('Failed to compress image, using original');
                        resolve(base64); // Если не удалось сжать, возвращаем оригинал
                    };
                    img.src = base64;
                });
            } catch (e) {
                console.error('Error compressing image:', e);
                return base64; // Возвращаем оригинал при ошибке
            }
        }

        detectQuestionType(element) {
            const classes = Array.from(element.classList);
            
            if (classes.some(c => c.includes('multichoice'))) return 'multichoice';
            if (classes.some(c => c.includes('shortanswer'))) return 'shortanswer';
            if (classes.some(c => c.includes('numerical'))) return 'numerical';
            if (classes.some(c => c.includes('truefalse'))) return 'truefalse';
            if (classes.some(c => c.includes('match'))) return 'match';
            
            return 'unknown';
        }

        extractQuestionText(element) {
            // Сначала извлекаем параметры из исходного DOM (до клонирования)
            const originalNolinks = Array.from(element.querySelectorAll('.nolink, span.nolink'));
            const nolinkParams = new Map();
            
            console.log('[extractQuestionText] Найдено .nolink элементов:', originalNolinks.length);
            
            originalNolinks.forEach((nolinkEl, index) => {
                let paramText = '';
                
                // Пытаемся извлечь из script type="math/tex"
                const mathTexScript = nolinkEl.querySelector('script[type="math/tex"]');
                if (mathTexScript) {
                    paramText = mathTexScript.textContent || mathTexScript.innerText || '';
                    console.log(`[extractQuestionText] .nolink[${index}] script content:`, paramText);
                }
                
                // Если не нашли в script, пробуем MathJax элементы
                if (!paramText) {
                    const mathJaxEl = nolinkEl.querySelector('.MathJax, [class*="MathJax"], mjx-container, mjx-math');
                    if (mathJaxEl) {
                        paramText = mathJaxEl.getAttribute('alttext') || 
                                   mathJaxEl.getAttribute('data-math') ||
                                   mathJaxEl.getAttribute('aria-label') ||
                                   '';
                        console.log(`[extractQuestionText] .nolink[${index}] MathJax attr:`, paramText);
                    }
                }
                
                // Обрабатываем LaTeX команды
                if (paramText) {
                    // Сначала обрабатываем \overline и другие команды (могут быть без скобок)
                    paramText = paramText.replace(/\\overline\s*/g, '');
                    paramText = paramText.replace(/\\hat\s*/g, '');
                    paramText = paramText.replace(/\\vec\s*/g, '');
                    paramText = paramText.replace(/[¯]+/g, '');
                    
                    // Обрабатываем LaTeX команды для греческих букв
                    paramText = paramText.replace(/\\varepsilon/g, 'ε');
                    paramText = paramText.replace(/\\epsilon/g, 'ε');
                    paramText = paramText.replace(/\\alpha/g, 'α');
                    paramText = paramText.replace(/\\beta/g, 'β');
                    paramText = paramText.replace(/\\gamma/g, 'γ');
                    paramText = paramText.replace(/\\delta/g, 'δ');
                    paramText = paramText.replace(/\\theta/g, 'θ');
                    paramText = paramText.replace(/\\lambda/g, 'λ');
                    paramText = paramText.replace(/\\mu/g, 'μ');
                    paramText = paramText.replace(/\\pi/g, 'π');
                    paramText = paramText.replace(/\\rho/g, 'ρ');
                    paramText = paramText.replace(/\\sigma/g, 'σ');
                    paramText = paramText.replace(/\\tau/g, 'τ');
                    paramText = paramText.replace(/\\phi/g, 'φ');
                    paramText = paramText.replace(/\\omega/g, 'ω');
                    
                    // Обрабатываем градусы
                    paramText = paramText.replace(/\\circ/g, '°');
                    paramText = paramText.replace(/\^\\circ/g, '°');
                    paramText = paramText.replace(/\^\{\\circ\}/g, '°');
                    
                    // Обрабатываем умножение
                    paramText = paramText.replace(/\\cdot\s*/g, '·');
                    paramText = paramText.replace(/\\cdotj/g, '·j');
                    paramText = paramText.replace(/\\cdot\s*j/g, '·j');
                    
                    // Убираем фигурные скобки LaTeX (но сохраняем содержимое)
                    paramText = paramText.replace(/\{([^}]+)\}/g, '$1');
                    
                    // Убираем лишние пробелы, которые могли остаться после удаления LaTeX команд
                    paramText = paramText.replace(/\s+/g, '');
                    
                    console.log(`[extractQuestionText] .nolink[${index}] после очистки:`, paramText);
                    
                    // ВАЖНО: Сохраняем весь текст из .nolink, даже если он не соответствует простому паттерну
                    // Это нужно для сложных уравнений типа yC=10(1−e−0.539t)−8t
                    if (paramText.trim()) {
                        // Пытаемся найти параметр в формате key=value (простой случай)
                        // Поддерживаем значения с переменными: -0.1v, 4t^3, и т.д.
                        const paramMatch = paramText.match(/^([a-zA-Zα-ωΑ-Ωа-яА-Я][a-zA-Zα-ωΑ-Ωа-яА-Я0-9_]*)[=＝]([-+]?(?:\d+\.?\d*|\d*\.?\d+)?[a-zA-Zα-ωΑ-Ωа-яА-Я0-9^_]*)$/);
                        if (paramMatch && paramMatch[2]) {
                            // Простой параметр: key=value
                            const key = paramMatch[1];
                            const value = paramMatch[2];
                            const fullParam = key + ' = ' + value;
                            nolinkParams.set(index, fullParam);
                            console.log(`[extractQuestionText] .nolink[${index}] сохранен простой параметр:`, fullParam);
                        } else {
                            // Сложное выражение или уравнение - сохраняем как есть
                            // Восстанавливаем пробелы вокруг знака равенства для читаемости
                            let savedText = paramText.trim();
                            // Заменяем = на = с пробелами, если их нет
                            savedText = savedText.replace(/([a-zA-Zα-ωΑ-Ωа-яА-Я0-9_\)])=([a-zA-Zα-ωΑ-Ωа-яА-Я0-9_\(])/g, '$1 = $2');
                            nolinkParams.set(index, savedText);
                            console.log(`[extractQuestionText] .nolink[${index}] сохранен сложный текст:`, savedText);
                        }
                    } else {
                        console.log(`[extractQuestionText] .nolink[${index}] пустой текст после обработки`);
                    }
                }
            });
            
            console.log('[extractQuestionText] Всего сохранено параметров:', nolinkParams.size);
            
            // Теперь клонируем элемент для обработки
            let qtext = element.querySelector('.qtext');
            
            if (!qtext) {
                qtext = element.querySelector('.questiontext, .question-text, [class*="question"]');
            }
            
            if (!qtext) {
                qtext = element.cloneNode(true);
                qtext.querySelectorAll('.answer, .ablock, .formulation, input[type="radio"], input[type="checkbox"]').forEach(el => {
                    const parent = el.closest('.answer, .ablock, .formulation, label');
                    if (parent) parent.remove();
                });
            } else {
                qtext = qtext.cloneNode(true);
            }
            
            if (qtext) {
                // ВАЖНО: Обрабатываем .nolink элементы ПЕРВЫМ ДЕЛОМ, до удаления скриптов!
                // Заменяем .nolink на параметры из сохраненной Map
                const nolinks = Array.from(qtext.querySelectorAll('.nolink, span.nolink'));
                console.log('[extractQuestionText] Обработка .nolink в клоне, найдено:', nolinks.length);
                
                nolinks.forEach((nolinkEl, index) => {
                    let replacementText = '';
                    
                    // Используем сохраненный параметр из исходного DOM
                    if (nolinkParams.has(index)) {
                        replacementText = nolinkParams.get(index);
                        console.log(`[extractQuestionText] .nolink[${index}] используем сохраненный параметр:`, replacementText);
                    } else {
                        // Если параметр не найден в Map, пытаемся извлечь напрямую из элемента
                        console.log(`[extractQuestionText] .nolink[${index}] параметр не найден в Map, пытаемся извлечь напрямую`);
                        
                        // Пытаемся извлечь из script type="math/tex"
                        const mathTexScript = nolinkEl.querySelector('script[type="math/tex"]');
                        if (mathTexScript) {
                            replacementText = mathTexScript.textContent || mathTexScript.innerText || '';
                        }
                        
                        // Если не нашли в script, пробуем MathJax элементы
                        if (!replacementText) {
                            const mathJaxEl = nolinkEl.querySelector('.MathJax, [class*="MathJax"], mjx-container, mjx-math');
                            if (mathJaxEl) {
                                replacementText = mathJaxEl.getAttribute('alttext') || 
                                                 mathJaxEl.getAttribute('data-math') ||
                                                 mathJaxEl.getAttribute('aria-label') ||
                                                 '';
                            }
                        }
                        
                        // Если не нашли, пробуем textContent
                        if (!replacementText) {
                            replacementText = nolinkEl.textContent || nolinkEl.innerText || '';
                        }
                        
                        // Обрабатываем LaTeX команды
                        if (replacementText) {
                            replacementText = replacementText.replace(/\\overline\s*/g, '');
                            replacementText = replacementText.replace(/\\hat\s*/g, '');
                            replacementText = replacementText.replace(/\\vec\s*/g, '');
                            replacementText = replacementText.replace(/[¯]+/g, '');
                            
                            // Обрабатываем градусы
                            replacementText = replacementText.replace(/\\circ/g, '°');
                            replacementText = replacementText.replace(/\^\\circ/g, '°');
                            replacementText = replacementText.replace(/\^\{\\circ\}/g, '°');
                            
                            // Обрабатываем умножение
                            replacementText = replacementText.replace(/\\cdot\s*/g, '·');
                            replacementText = replacementText.replace(/\\cdotj/g, '·j');
                            replacementText = replacementText.replace(/\\cdot\s*j/g, '·j');
                            
                            // Убираем фигурные скобки LaTeX
                            replacementText = replacementText.replace(/\{([^}]+)\}/g, '$1');
                            
                            // Восстанавливаем пробелы вокруг знака равенства
                            replacementText = replacementText.replace(/([a-zA-Zα-ωΑ-Ωа-яА-Я0-9_\)])=([a-zA-Zα-ωΑ-Ωа-яА-Я0-9_\(])/g, '$1 = $2');
                            replacementText = replacementText.trim();
                        }
                        
                        if (replacementText) {
                            console.log(`[extractQuestionText] .nolink[${index}] извлечен напрямую:`, replacementText);
                        }
                    }
                    
                    // Заменяем .nolink на параметр
                    if (replacementText) {
                        const textNode = document.createTextNode(' ' + replacementText + ' ');
                        nolinkEl.parentNode.replaceChild(textNode, nolinkEl);
                        console.log(`[extractQuestionText] .nolink[${index}] заменен на: "${replacementText}"`);
                    } else {
                        const textNode = document.createTextNode(' ');
                        nolinkEl.parentNode.replaceChild(textNode, nolinkEl);
                        console.log(`[extractQuestionText] .nolink[${index}] заменен на пробел (текст не найден)`);
                    }
                });
                
                // Теперь убираем скрытые элементы, скрипты и стили
                qtext.querySelectorAll('.accesshide, .sr-only, [aria-hidden="true"]').forEach(el => el.remove());
                qtext.querySelectorAll('script, style').forEach(el => el.remove());
                qtext.querySelectorAll('.quiz-solver-btn, .quiz-solver-buttons, .quiz-solver-saved, .quiz-solver-stats, button').forEach(el => el.remove());
                
                // Обрабатываем MathJax элементы (которые не внутри .nolink, те уже заменены)
                const mathElements = qtext.querySelectorAll('.MathJax, [class*="math"], [data-math], [class*="MathJax"], mjx-container, mjx-math');
                mathElements.forEach(mathEl => {
                    let mathText = mathEl.getAttribute('alttext') || 
                                  mathEl.getAttribute('data-math') ||
                                  mathEl.getAttribute('aria-label') ||
                                  mathEl.textContent ||
                                  '';
                    
                    if (mathText) {
                        // Очищаем от LaTeX команд
                        mathText = mathText.replace(/\\overline\s*\{?([^}]+)\}?/g, '$1');
                        mathText = mathText.replace(/\\hat\s*\{?([^}]+)\}?/g, '$1');
                        mathText = mathText.replace(/\\vec\s*\{?([^}]+)\}?/g, '$1');
                        mathText = mathText.replace(/[¯]+/g, '');
                        
                        // Обрабатываем градусы
                        mathText = mathText.replace(/\\circ/g, '°');
                        mathText = mathText.replace(/\^\\circ/g, '°');
                        mathText = mathText.replace(/\^\{\\circ\}/g, '°');
                        
                        // Обрабатываем умножение
                        mathText = mathText.replace(/\\cdot\s*/g, '·');
                        mathText = mathText.replace(/\\cdotj/g, '·j');
                        mathText = mathText.replace(/\\cdot\s*j/g, '·j');
                        
                        // Убираем фигурные скобки LaTeX
                        mathText = mathText.replace(/\{([^}]+)\}/g, '$1');
                        
                        const textNode = document.createTextNode(' ' + mathText.trim() + ' ');
                        mathEl.parentNode.replaceChild(textNode, mathEl);
                    } else {
                        mathEl.remove();
                    }
                });
                
                // Обрабатываем элементы <sup> и <sub>
                qtext.querySelectorAll('sup').forEach(supEl => {
                    const supText = supEl.textContent || '';
                    if (supText) {
                        const replacement = supText.match(/^\d+$/) ? '^' + supText : supText;
                        const textNode = document.createTextNode(replacement);
                        supEl.parentNode.replaceChild(textNode, supEl);
                    } else {
                        supEl.remove();
                    }
                });
                
                qtext.querySelectorAll('sub').forEach(subEl => {
                    const subText = subEl.textContent || '';
                    if (subText) {
                        const replacement = subText.match(/^\d+$/) ? '_' + subText : subText;
                        const textNode = document.createTextNode(replacement);
                        subEl.parentNode.replaceChild(textNode, subEl);
                    } else {
                        subEl.remove();
                    }
                });
                
                // Убираем блоки с ответами и вариантами
                qtext.querySelectorAll('.answer, .ablock, .formulation').forEach(el => {
                    if (el.querySelector('input[type="radio"], input[type="checkbox"]')) {
                        el.remove();
                    }
                });
                
                // Получаем текст
                let text = qtext.textContent || qtext.innerText || '';
                text = text.trim();
                
                // Обрабатываем LaTeX команды в тексте
                text = text.replace(/\\overline\s*\{?([^}]+)\}?/g, '$1');
                text = text.replace(/([a-zA-Zа-яА-Я])([¯]+)/g, '$1');
                text = text.replace(/([¯]+)([a-zA-Zа-яА-Я])/g, '$2');
                text = text.replace(/\\hat\s*\{?([^}]+)\}?/g, '$1');
                text = text.replace(/\\vec\s*\{?([^}]+)\}?/g, '$1');
                
                // Обрабатываем градусы
                text = text.replace(/\\circ/g, '°');
                text = text.replace(/\^\\circ/g, '°');
                text = text.replace(/\^\{\\circ\}/g, '°');
                
                // Обрабатываем умножение
                text = text.replace(/\\cdot\s*/g, '·');
                text = text.replace(/\\cdotj/g, '·j');
                text = text.replace(/\\cdot\s*j/g, '·j');
                
                // Убираем фигурные скобки LaTeX (но сохраняем содержимое)
                text = text.replace(/\{([^}]+)\}/g, '$1');
                
                text = text.replace(/\^\{([^}]+)\}/g, '^$1');
                text = text.replace(/_\{([^}]+)\}/g, '_$1');
                text = text.replace(/\\[a-zA-Z]+\s*\{?([^}]*)\}?/g, '$1');
                
                // Убираем дубликаты параметров (простой подход)
                for (let i = 0; i < 3; i++) {
                    text = text.replace(/([a-zA-Zа-яА-Я0-9]+)\s*=\s*(\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)\s+\1\s*=\s*\2/g, '$1 = $2');
                    text = text.replace(/([a-zA-Zа-яА-Я0-9]+)\s*=\s*(\d+(?:\.\d+)?)\s+\1\s*=\s*\2/g, '$1 = $2');
                }
                
                // Обрабатываем незакрытые фигурные скобки (остатки от LaTeX)
                text = text.replace(/\{([^}]*)$/g, '$1'); // Незакрытая скобка в конце
                text = text.replace(/^([^{]*)\}/g, '$1'); // Открывающая скобка в начале
                
                // Обрабатываем векторы в фигурных скобках (если остались после предыдущей обработки)
                text = text.replace(/\{([F_0-9]+)\}/g, '$1'); // {F_1} -> F_1
                text = text.replace(/\{([F_0-9]+)\s*=\s*([^}]+)\}/g, '$1 = $2'); // {F_1 = ...} -> F_1 = ...
                
                // Нормализуем пробелы
                text = text.replace(/\s{2,}/g, ' ');
                text = text.replace(/([a-zA-Zа-яА-Я0-9])\s*=\s*([-]?\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)/g, '$1 = $2');
                text = text.replace(/(\d+(?:\.\d+)?)\s{2,}([а-яА-Я]+)/g, '$1 $2');
                text = text.trim();
                
                console.log('[extractQuestionText] Финальный извлеченный текст:', text.substring(0, 300) + (text.length > 300 ? '...' : ''));
                console.log('[extractQuestionText] Длина финального текста:', text.length, 'символов');
                
                return text || 'Текст вопроса не сохранен';
            }
            
            return 'Текст вопроса не сохранен';
        }

        extractAnswers(element, type) {
            const answers = [];
            
            if (type === 'multichoice' || type === 'truefalse') {
                const inputs = element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                inputs.forEach(input => {
                    const label = element.querySelector(`label[for="${input.id}"]`) || 
                                 input.closest('label') ||
                                 input.parentElement;
                    
                    if (label) {
                        const text = label.innerText.replace(input.value, '').trim();
                        const isCorrect = this.isAnswerCorrect(label, element);
                        
                        answers.push({
                            value: input.value,
                            text: text,
                            input: input,
                            label: label,
                            correct: isCorrect
                        });
                    }
                });
            } else if (type === 'shortanswer' || type === 'numerical') {
                const input = element.querySelector('input[type="text"], input[type="number"]');
                if (input) {
                    answers.push({
                        input: input,
                        value: input.value
                    });
                }
            }
            
            return answers;
        }

        extractOptions(element, type) {
            if (type === 'multichoice' || type === 'truefalse') {
                const options = [];
                const inputs = element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                inputs.forEach(input => {
                    const label = element.querySelector(`label[for="${input.id}"]`) || 
                                 input.closest('label') ||
                                 input.parentElement;
                    
                    if (label) {
                        const text = label.innerText.replace(input.value, '').trim();
                        options.push({
                            value: input.value,
                            text: text
                        });
                    }
                });
                return options;
            }
            return [];
        }
        
        extractOptions(element, type) {
            if (type === 'multichoice' || type === 'truefalse') {
                const options = [];
                const inputs = element.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                inputs.forEach(input => {
                    const label = element.querySelector(`label[for="${input.id}"]`) || 
                                 input.closest('label') ||
                                 input.parentElement;
                    
                    if (label) {
                        const text = label.innerText.replace(input.value, '').trim();
                        options.push({
                            value: input.value,
                            text: text
                        });
                    }
                });
                return options;
            }
            return [];
        }

        isAnswerCorrect(label, container) {
            // Проверяем классы правильности
            if (label.classList.contains('correct') || 
                label.querySelector('.correct')) {
                return true;
            }

            // Проверяем родительские элементы
            let parent = label.parentElement;
            while (parent && parent !== container) {
                if (parent.classList.contains('correct')) {
                    return true;
                }
                parent = parent.parentElement;
            }

            // Проверяем по классам неправильности
            if (label.classList.contains('incorrect') || 
                label.querySelector('.incorrect')) {
                return false;
            }

            return null; // Неизвестно
        }

        addSolveButtons() {
            this.questions.forEach((question, id) => {
                this.addButtonToQuestion(question);
            });
        }

        addButtonToQuestion(question) {
            if (question.element.querySelector('.quiz-solver-btn')) {
                return;
            }

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'quiz-solver-buttons';
            buttonContainer.style.cssText = `
                margin: 15px 0;
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                align-items: center;
            `;

            // Кнопка поиска ответа
            const solveBtn = document.createElement('button');
            solveBtn.className = 'quiz-solver-btn solve';
            solveBtn.innerHTML = 'Найти ответ';
            solveBtn.style.cssText = this.getButtonStyle('#2563eb', 'info');

            const handleSolveClick = () => {
                this.findAndApplyAnswer(question, solveBtn);
            };
            solveBtn.addEventListener('click', handleSolveClick);

            // Кнопка сохранения ответа
            const saveBtn = document.createElement('button');
            saveBtn.className = 'quiz-solver-btn save';
            saveBtn.innerHTML = 'Сохранить ответ';
            saveBtn.style.cssText = this.getButtonStyle('#2563eb', 'info');

            const handleSaveClick = () => {
                this.saveCurrentAnswer(question, saveBtn);
            };
            saveBtn.addEventListener('click', handleSaveClick);

            // Кнопка авто-решения
            const autoBtn = document.createElement('button');
            autoBtn.className = 'quiz-solver-btn auto';
            autoBtn.innerHTML = 'Авто-решение';
            autoBtn.style.cssText = this.getButtonStyle('#2563eb', 'info');

            const handleAutoClick = () => {
                this.autoSolveAll();
            };
            autoBtn.addEventListener('click', handleAutoClick);

            buttonContainer.appendChild(solveBtn);
            buttonContainer.appendChild(saveBtn);
            buttonContainer.appendChild(autoBtn);

            // Добавляем статистику, если есть
            if (question.statistics) {
                const statsDiv = this.createStatisticsDisplay(question);
                buttonContainer.appendChild(statsDiv);
            }

            // Показываем сохраненный ответ, если есть
            if (question.savedAnswer) {
                const savedDiv = document.createElement('div');
                savedDiv.className = 'quiz-solver-saved';
                savedDiv.innerHTML = `Сохранен ответ: ${this.formatAnswer(question.savedAnswer.answer)}`;
                savedDiv.style.cssText = `
                    padding: 8px 12px;
                    background: #E1F5FE;
                    border-left: 3px solid #2196F3;
                    border-radius: 4px;
                    font-size: 13px;
                    color: #0277BD;
                    margin-top: 10px;
                `;
                buttonContainer.appendChild(savedDiv);
            }

            const qtext = question.element.querySelector('.qtext');
            if (qtext && qtext.parentElement) {
                qtext.parentElement.insertBefore(buttonContainer, qtext.nextSibling);
            } else {
                question.element.insertBefore(buttonContainer, question.element.firstChild);
            }

            // Настраиваем автосохранение для этого вопроса
            this.setupQuestionAutoSave(question);
        }

        createStatisticsDisplay(question) {
            const stats = question.statistics;
            const accuracy = stats.totalAttempts > 0 
                ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) 
                : 0;

            const statsDiv = document.createElement('div');
            statsDiv.className = 'quiz-solver-stats';
            statsDiv.style.cssText = `
                padding: 10px 15px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 8px;
                color: white;
                font-size: 12px;
                margin-top: 10px;
                width: 100%;
            `;

            statsDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>📊 Статистика ответов других пользователей:</strong>
                    <span style="font-size: 16px; font-weight: bold;">${accuracy}%</span>
                </div>
                <div style="font-size: 11px; opacity: 0.9;">
                    Всего попыток: ${stats.totalAttempts} | Правильных: ${stats.correctAttempts}
                </div>
                ${stats.errors.length > 0 ? `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                        <strong>⚠️ Популярные ошибки:</strong>
                        <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 11px;">
                            ${this.getTopErrors(stats.errors).map(err => `<li>${this.formatAnswer(err.answer)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            `;

            return statsDiv;
        }

        getTopErrors(errors, limit = 3) {
            const errorCounts = {};
            errors.forEach(err => {
                const key = JSON.stringify(err.answer);
                if (!errorCounts[key]) {
                    errorCounts[key] = { answer: err.answer, count: 0 };
                }
                errorCounts[key].count++;
            });

            return Object.values(errorCounts)
                .sort((a, b) => b.count - a.count)
                .slice(0, limit)
                .map(item => item);
        }

        formatAnswer(answer) {
            if (typeof answer === 'string') return answer;
            if (Array.isArray(answer)) return answer.join(', ');
            if (typeof answer === 'object') {
                if (answer.text) return answer.text;
                if (answer.value) return answer.value;
            }
            return JSON.stringify(answer);
        }

        async saveCurrentAnswer(question, button) {
            try {
                const currentAnswer = this.getCurrentAnswer(question);
                if (!currentAnswer) {
                    this.showNotification('❌ Не выбран ответ для сохранения', 'error');
                    return;
                }

                button.disabled = true;
                button.innerHTML = 'Сохранение...';

                // Определяем правильность ответа, если возможно
                const isCorrect = this.checkAnswerCorrectness(question, currentAnswer);
                
                // Извлекаем изображение из вопроса
                const questionImage = await this.extractQuestionImage(question.element);

                await this.saveAnswer(question.hash, currentAnswer, isCorrect, question.text, questionImage);
                await this.updateStatistics(question.hash, currentAnswer, isCorrect);

                this.showNotification('✅ Ответ сохранен!', 'success');
                button.innerHTML = '✅ Сохранено';
                button.style.background = '#4CAF50';

                // Обновляем отображение
                setTimeout(() => {
                    location.reload();
                }, 1000);
            } catch (e) {
                console.error('Error saving answer:', e);
                this.showNotification('❌ Ошибка при сохранении', 'error');
                button.disabled = false;
                button.innerHTML = 'Сохранить ответ';
            }
        }

        getCurrentAnswer(question) {
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                const checked = question.answers.find(a => a.input && a.input.checked);
                if (checked) {
                    return {
                        value: checked.value,
                        text: checked.text
                    };
                }
            } else if (question.type === 'shortanswer' || question.type === 'numerical') {
                const input = question.answers[0]?.input;
                if (input && input.value) {
                    return input.value;
                }
            }
            return null;
        }

        checkAnswerCorrectness(question, answer) {
            // Пытаемся определить правильность ответа
            // На странице теста (до проверки) правильность обычно неизвестна
            // Эта функция используется только при ручном сохранении во время теста
            
            // Если мы на странице результатов, используем более точный метод
            if (this.isReviewPage()) {
                // На странице результатов правильность уже определена
                // Но эта функция вызывается только при ручном сохранении, не при автосохранении
                return null; // Пусть определяет processReviewPage
            }
            
            // На странице теста правильность неизвестна до проверки
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                const selectedAnswer = question.answers.find(a => 
                    (a.value === answer.value || a.text === answer.text)
                );
                if (selectedAnswer) {
                    // На странице теста correct обычно false или null
                    // Возвращаем null, чтобы не помечать как неправильный
                    return selectedAnswer.correct || null;
                }
            }
            return null;
        }

        getButtonStyle(color, type = 'info') {
            const colorMap = {
                success: '#16a34a',
                error: '#dc2626',
                warning: '#f59e0b',
                info: '#2563eb'
            };
            const borderColor = colorMap[type] || color;
            
            return `
                padding: 8px 16px;
                background: white;
                color: #111827;
                border: 1px solid ${borderColor};
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s ease;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            `;
        }

        async findAndApplyAnswer(question, button) {
            if (this.solvingInProgress.has(question.id)) {
                return;
            }

            this.solvingInProgress.add(question.id);
            button.disabled = true;
            button.innerHTML = 'Ищу ответ...';
            button.style.opacity = '0.7';

            const methods = [];
            try {
                // Метод 1: Сохраненные ответы (локальные и с сервера)
                console.log('[Method 1] Проверяю сохраненные ответы...');
                
                // Сначала проверяем локальные ответы
                if (question.savedAnswer) {
                    const saved = question.savedAnswer.answer;
                    if (this.applySavedAnswer(question, saved)) {
                        methods.push('Сохраненные ответы (локально)');
                        this.showNotification('✅ Применен сохраненный ответ!', 'success');
                        button.innerHTML = '✅ Ответ применен';
                        button.style.background = '#4CAF50';
                        this.solvingInProgress.delete(question.id);
                        return;
                    }
                }
                
                // Загружаем ответы других пользователей с сервера
                try {
                    // Проверяем кэш
                    const cacheKey = `answers_${question.hash}`;
                    const cached = this.serverCache.get(cacheKey);
                    let serverAnswers = null;
                    
                    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL && cached.type === 'answers') {
                        console.log('[Method 1] Используем кэш для сохраненных ответов', question.hash);
                        serverAnswers = cached.data;
                    } else {
                        // Проверяем, не отключена ли синхронизация
                        if (!this.serverSyncDisabled && Date.now() >= this.serverSyncDisabledUntil) {
                            // Проверяем минимальный интервал между запросами
                            const timeSinceLastSync = Date.now() - this.lastSyncTime;
                            if (timeSinceLastSync < this.MIN_SYNC_INTERVAL) {
                                await new Promise(resolve => setTimeout(resolve, this.MIN_SYNC_INTERVAL - timeSinceLastSync));
                            }

                            const serverResponse = await this.safeSendMessage({
                                action: 'syncWithServer',
                                syncAction: 'getSavedAnswers',
                                questionHash: question.hash
                            });
                            
                            this.lastSyncTime = Date.now();
                            
                            if (serverResponse && serverResponse.success && serverResponse.data && serverResponse.data.answers) {
                                serverAnswers = serverResponse.data.answers;
                                // Сохраняем в кэш
                                this.serverCache.set(cacheKey, {
                                    data: serverAnswers,
                                    timestamp: Date.now(),
                                    type: 'answers'
                                });
                            } else if (serverResponse && serverResponse.error) {
                                this.handleServerError(serverResponse.error, serverResponse.statusCode);
                            }
                        }
                    }
                    
                    if (serverAnswers && serverAnswers.length > 0) {
                        console.log(`[Method 1] Найдено ${serverAnswers.length} ответов с сервера`);
                        
                        // Проверяем, не была ли выполнена очистка данных
                        const clearState = await this.safeStorageGet(['dataCleared', 'dataClearedTimestamp']);
                        const shouldSaveToLocal = !clearState.dataCleared || 
                            (clearState.dataClearedTimestamp && (Date.now() - clearState.dataClearedTimestamp) >= 5 * 60 * 1000);
                        
                        // Ищем правильный ответ (isCorrect === true)
                        const correctAnswer = serverAnswers.find(a => a.isCorrect === true);
                        if (correctAnswer && correctAnswer.answer) {
                            if (this.applySavedAnswer(question, correctAnswer.answer)) {
                                // Сохраняем ответ локально только если не была выполнена очистка
                                if (shouldSaveToLocal) {
                                    await this.saveAnswer(
                                        question.hash,
                                        correctAnswer.answer,
                                        correctAnswer.isCorrect,
                                        correctAnswer.questionText,
                                        correctAnswer.questionImage
                                    );
                                }
                                methods.push('Сохраненные ответы (с сервера)');
                                this.showNotification('✅ Применен ответ другого пользователя!', 'success');
                                button.innerHTML = '✅ Ответ применен';
                                button.style.background = '#4CAF50';
                                this.solvingInProgress.delete(question.id);
                                return;
                            }
                        }
                        
                        // Если правильного ответа нет, используем первый доступный
                        if (serverAnswers[0].answer) {
                            if (this.applySavedAnswer(question, serverAnswers[0].answer)) {
                                // Сохраняем ответ локально только если не была выполнена очистка
                                if (shouldSaveToLocal) {
                                    await this.saveAnswer(
                                        question.hash,
                                        serverAnswers[0].answer,
                                        serverAnswers[0].isCorrect,
                                        serverAnswers[0].questionText,
                                        serverAnswers[0].questionImage
                                    );
                                }
                                methods.push('Сохраненные ответы (с сервера)');
                                this.showNotification('✅ Применен ответ другого пользователя!', 'success');
                                button.innerHTML = '✅ Ответ применен';
                                button.style.background = '#4CAF50';
                                this.solvingInProgress.delete(question.id);
                                return;
                            }
                        }
                    }
                } catch (serverError) {
                    console.warn('[Method 1] Ошибка загрузки ответов с сервера:', serverError);
                    this.handleServerError(serverError.message, serverError.statusCode);
                }
                
                console.log('[Method 1] Сохраненные ответы не найдены');

                // Метод 2: Статистика других пользователей
                console.log('[Method 2] Загружаю статистику с сервера...');
                await this.loadQuestionStatisticsFromServer(question);

                if (question.statistics) {
                    const popularAnswer = this.findMostPopularCorrectAnswer(question);
                    if (popularAnswer) {
                        methods.push('Статистика других пользователей');
                        this.applyAnswer(question, popularAnswer);
                        this.showNotification('✅ Применен наиболее популярный правильный ответ!', 'success');
                        button.innerHTML = '✅ Ответ применен';
                        button.style.background = '#4CAF50';
                        this.solvingInProgress.delete(question.id);
                        return;
                    }
                }
                console.log('[Method 2] Популярный ответ не найден в статистике');

                // Метод 3: Поиск на странице
                console.log('[Method 3] Ищу правильный ответ на странице...');
                const correctAnswer = this.findCorrectAnswerOnPage(question);
                
                if (correctAnswer) {
                    methods.push('Поиск на странице');
                    this.applyAnswer(question, correctAnswer);
                    this.showNotification('✅ Правильный ответ найден и применен!', 'success');
                    button.innerHTML = '✅ Ответ найден';
                    button.style.background = '#4CAF50';
                    this.solvingInProgress.delete(question.id);
                    return;
                }
                console.log('[Method 3] Правильный ответ на странице не найден');

                // Метод 4: Эвристический анализ
                console.log('[Method 4] Анализирую варианты ответов...');
                const heuristicAnswer = this.findAnswerByHeuristics(question);
                
                if (heuristicAnswer) {
                    console.log('[Method 4] Эвристика: найден возможный ответ (не применяем автоматически)');
                    // Не применяем автоматически, так как эвристика ненадежна
                    // Пользователь должен выбрать ответ вручную или использовать онлайн поиск
                }
                console.log('[Method 4] Эвристический анализ завершен (ответ не применен автоматически)');

                // Метод 5: Онлайн поиск
                console.log('[Method 5] Открываю поиск в Google...');
                methods.push('Онлайн поиск');
                this.searchAnswerOnline(question);
                this.showNotification('Открываю поиск ответа в Google. Проверьте результаты и заполните вручную.', 'info');
                button.innerHTML = 'Искать онлайн';
                button.style.background = '';

            } catch (e) {
                console.error('Error finding answer:', e);
                this.showNotification('Ошибка при поиске ответа', 'error');
            } finally {
                this.solvingInProgress.delete(question.id);
                setTimeout(function resetButtonState() {
                    button.disabled = false;
                    button.innerHTML = 'Найти ответ';
                    button.style.opacity = '1';
                    button.style.background = '';
                }, 2000);
            }
        }

        applySavedAnswer(question, savedAnswer) {
            // Метод 1: Сохраненные ответы
            // Использует ранее сохраненные правильные ответы
            
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                // Сначала пытаемся найти по точному совпадению value
                if (savedAnswer.value) {
                    const answer = question.answers.find(a => a.value === savedAnswer.value);
                    if (answer) {
                        this.applyAnswer(question, answer);
                        console.log('[Method 1] Найден ответ по value:', savedAnswer.value);
                        return true;
                    }
                }
                
                // Если не нашли по value, ищем по тексту (более гибкое сопоставление)
                if (savedAnswer.text) {
                    const normalizedSaved = savedAnswer.text.toLowerCase().trim();
                    const answer = question.answers.find(a => {
                        const normalizedAnswer = a.text.toLowerCase().trim();
                        // Точное совпадение
                        if (normalizedAnswer === normalizedSaved) return true;
                        // Частичное совпадение (если сохраненный текст содержится в варианте)
                        if (normalizedAnswer.includes(normalizedSaved) || 
                            normalizedSaved.includes(normalizedAnswer)) return true;
                        return false;
                    });
                    
                    if (answer) {
                        this.applyAnswer(question, answer);
                        console.log('[Method 1] Найден ответ по тексту:', savedAnswer.text);
                        return true;
                    }
                }
            } else if (question.type === 'shortanswer' || question.type === 'numerical') {
                const input = question.answers[0]?.input;
                if (input) {
                    // Для текстовых полей просто вставляем сохраненное значение
                    const valueToSet = typeof savedAnswer === 'string' ? savedAnswer : 
                                      (savedAnswer.text || savedAnswer.value || savedAnswer);
                    input.value = valueToSet;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('[Method 1] Применен сохраненный текстовый ответ:', valueToSet);
                    return true;
                }
            }
            
            console.log('[Method 1] Не удалось применить сохраненный ответ');
            return false;
        }

        async loadQuestionStatisticsFromServer(question) {
            try {
                // Проверяем кэш
                const cached = this.serverCache.get(question.hash);
                if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
                    console.log('[loadQuestionStatisticsFromServer] Используем кэш для вопроса', question.hash);
                    const serverStats = cached.data;
                    if (serverStats) {
                        const localStats = this.statistics.get(question.hash);
                        if (localStats) {
                            const merged = {
                                totalAttempts: (localStats.totalAttempts || 0) + (serverStats.totalAttempts || 0),
                                correctAttempts: (localStats.correctAttempts || 0) + (serverStats.correctAttempts || 0),
                                answers: this.mergeAnswers(localStats.answers || {}, serverStats.answers || {}),
                                errors: this.mergeErrors(localStats.errors || [], serverStats.errors || [])
                            };
                            this.statistics.set(question.hash, merged);
                            question.statistics = merged;
                        } else {
                            this.statistics.set(question.hash, serverStats);
                            question.statistics = serverStats;
                        }
                    }
                    return;
                }

                // Проверяем, не отключена ли синхронизация
                if (this.serverSyncDisabled || Date.now() < this.serverSyncDisabledUntil) {
                    console.log('[loadQuestionStatisticsFromServer] Синхронизация отключена, используем локальные данные');
                    return;
                }

                // Проверяем минимальный интервал между запросами
                const timeSinceLastSync = Date.now() - this.lastSyncTime;
                if (timeSinceLastSync < this.MIN_SYNC_INTERVAL) {
                    await new Promise(resolve => setTimeout(resolve, this.MIN_SYNC_INTERVAL - timeSinceLastSync));
                }

                // Загружаем статистику с сервера
                const response = await this.safeSendMessage({
                    action: 'syncWithServer',
                    questionHash: question.hash,
                    syncAction: 'getStatistics'
                });

                this.lastSyncTime = Date.now();

                if (response && response.success && response.data && response.data.statistics) {
                    const serverStats = response.data.statistics;
                    // Сохраняем в кэш
                    this.serverCache.set(question.hash, {
                        data: serverStats,
                        timestamp: Date.now(),
                        type: 'statistics'
                    });
                    
                    if (serverStats) {
                        // Объединяем с локальной статистикой
                        const localStats = this.statistics.get(question.hash);
                        if (localStats) {
                            // Улучшенное объединение: суммируем попытки и объединяем ответы
                            const merged = {
                                totalAttempts: (localStats.totalAttempts || 0) + (serverStats.totalAttempts || 0),
                                correctAttempts: (localStats.correctAttempts || 0) + (serverStats.correctAttempts || 0),
                                answers: this.mergeAnswers(localStats.answers || {}, serverStats.answers || {}),
                                errors: this.mergeErrors(localStats.errors || [], serverStats.errors || [])
                            };
                            this.statistics.set(question.hash, merged);
                            question.statistics = merged;
                        } else {
                            this.statistics.set(question.hash, serverStats);
                            question.statistics = serverStats;
                        }
                    }
                } else if (response && response.error) {
                    // Обрабатываем ошибки сервера
                    this.handleServerError(response.error, response.statusCode);
                }
            } catch (e) {
                console.warn('Failed to load statistics from server:', e);
                this.handleServerError(e.message, e.statusCode);
            }
        }

        mergeAnswers(localAnswers, serverAnswers) {
            const merged = { ...localAnswers };
            for (const [key, count] of Object.entries(serverAnswers)) {
                merged[key] = (merged[key] || 0) + count;
            }
            return merged;
        }

        // Загрузка состояния синхронизации из storage
        async loadSyncState() {
            try {
                const state = await this.safeStorageGet(['serverSyncDisabled', 'serverSyncDisabledUntil']);
                if (state.serverSyncDisabled && state.serverSyncDisabledUntil) {
                    const now = Date.now();
                    if (now < state.serverSyncDisabledUntil) {
                        this.serverSyncDisabled = true;
                        this.serverSyncDisabledUntil = state.serverSyncDisabledUntil;
                        const remainingMinutes = Math.ceil((state.serverSyncDisabledUntil - now) / 1000 / 60);
                        console.log(`[loadSyncState] Синхронизация отключена, осталось ${remainingMinutes} минут`);
                    } else {
                        // Время истекло, сбрасываем флаг
                        this.serverSyncDisabled = false;
                        this.serverSyncDisabledUntil = 0;
                        await this.safeStorageSet({
                            serverSyncDisabled: false,
                            serverSyncDisabledUntil: 0
                        });
                    }
                }
            } catch (e) {
                console.warn('[loadSyncState] Ошибка загрузки состояния синхронизации:', e);
            }
        }

        // Обработка ошибок сервера (429, 503 и т.д.)
        handleServerError(error, statusCode) {
            const errorStr = error?.toString() || '';
            const shouldDisable = statusCode === 429 || statusCode === 503 || 
                                 errorStr.includes('429') || errorStr.includes('503') || 
                                 errorStr.includes('quota') || errorStr.includes('limit') ||
                                 errorStr.includes('rate limit') || errorStr.includes('too many requests');
            
            if (shouldDisable) {
                console.warn('[handleServerError] Обнаружена ошибка сервера (лимит запросов), отключаю синхронизацию на', this.SYNC_DISABLE_DURATION / 1000 / 60, 'минут');
                this.serverSyncDisabled = true;
                this.serverSyncDisabledUntil = Date.now() + this.SYNC_DISABLE_DURATION;
                
                // Сохраняем состояние в storage
                this.safeStorageSet({
                    serverSyncDisabled: true,
                    serverSyncDisabledUntil: this.serverSyncDisabledUntil
                });
            }
        }

        // Добавление запроса в очередь для батчинга
        queueSyncRequest(request) {
            // Проверяем, не отключена ли синхронизация
            if (this.serverSyncDisabled || Date.now() < this.serverSyncDisabledUntil) {
                console.log('[queueSyncRequest] Синхронизация отключена, пропускаю запрос');
                return;
            }

            this.pendingSyncRequests.push(request);

            // Если таймер еще не установлен, устанавливаем его
            if (!this.syncBatchTimeout) {
                this.syncBatchTimeout = setTimeout(() => {
                    this.processSyncQueue();
                }, 1000); // Обрабатываем очередь каждую секунду
            }
        }

        // Обработка очереди запросов (батчинг)
        async processSyncQueue() {
            if (this.pendingSyncRequests.length === 0) {
                this.syncBatchTimeout = null;
                return;
            }

            // Берем до 5 запросов за раз
            const batch = this.pendingSyncRequests.splice(0, 5);
            this.syncBatchTimeout = null;

            // Проверяем минимальный интервал между запросами
            const timeSinceLastSync = Date.now() - this.lastSyncTime;
            if (timeSinceLastSync < this.MIN_SYNC_INTERVAL) {
                await new Promise(resolve => setTimeout(resolve, this.MIN_SYNC_INTERVAL - timeSinceLastSync));
            }

            // Отправляем запросы последовательно
            for (const request of batch) {
                try {
                    const response = await this.safeSendMessage({
                        action: 'syncWithServer',
                        ...request
                    });

                    this.lastSyncTime = Date.now();

                    if (response && response.success) {
                        if (request.syncAction === 'submitAnswer' && response.data) {
                            // Обновляем статистику с сервера
                            const serverStats = response.data.statistics;
                            if (serverStats) {
                                this.statistics.set(request.questionHash, serverStats);
                            }
                        }
                    } else if (response && response.error) {
                        this.handleServerError(response.error, response.statusCode);
                        // Прерываем обработку очереди при ошибке
                        break;
                    }
                } catch (error) {
                    console.warn('[processSyncQueue] Ошибка при синхронизации:', error);
                    this.handleServerError(error.message, error.statusCode);
                    // Прерываем обработку очереди при ошибке
                    break;
                }

                // Небольшая задержка между запросами
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Если в очереди еще есть запросы, обрабатываем их
            if (this.pendingSyncRequests.length > 0) {
                this.syncBatchTimeout = setTimeout(() => {
                    this.processSyncQueue();
                }, 1000);
            }
        }

        mergeErrors(localErrors, serverErrors) {
            // Объединяем ошибки, убирая дубликаты по ответу
            const errorMap = new Map();
            
            [...localErrors, ...serverErrors].forEach(error => {
                const key = JSON.stringify(error.answer);
                if (!errorMap.has(key) || errorMap.get(key).timestamp < error.timestamp) {
                    errorMap.set(key, error);
                }
            });
            
            return Array.from(errorMap.values()).slice(0, 10); // Ограничиваем до 10 последних ошибок
        }

        findMostPopularCorrectAnswer(question) {
            // Метод 2: Статистика других пользователей
            // Показывает наиболее популярные правильные ответы
            
            const stats = question.statistics;
            if (!stats || !stats.answers) {
                console.log('[Method 2] Статистика отсутствует');
                return null;
            }

            // Собираем все ответы с их популярностью
            const answerCandidates = [];
            
            for (const [answerKey, count] of Object.entries(stats.answers)) {
                try {
                    const answerData = JSON.parse(answerKey);
                    if (question.type === 'multichoice' || question.type === 'truefalse') {
                        // Ищем ответ в вариантах вопроса
                        const found = question.answers.find(a => {
                            // Точное совпадение по value
                            if (a.value === answerData.value) return true;
                            // Совпадение по тексту
                            if (answerData.text) {
                                const normalizedAnswer = a.text.toLowerCase().trim();
                                const normalizedSaved = answerData.text.toLowerCase().trim();
                                if (normalizedAnswer === normalizedSaved) return true;
                                // Частичное совпадение
                                if (normalizedAnswer.includes(normalizedSaved) || 
                                    normalizedSaved.includes(normalizedAnswer)) return true;
                            }
                            return false;
                        });
                        
                        if (found) {
                            answerCandidates.push({
                                answer: found,
                                count: count,
                                answerData: answerData
                            });
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки парсинга
                    console.warn('[Method 2] Ошибка парсинга ответа:', answerKey, e);
                }
            }

            if (answerCandidates.length === 0) {
                console.log('[Method 2] Не найдено подходящих ответов в статистике');
                return null;
            }

            // Сортируем по популярности (количество использований)
            answerCandidates.sort((a, b) => b.count - a.count);
            
            // Учитываем правильность ответов, если доступна информация
            // Предпочитаем ответы, которые были правильными чаще
            const bestCandidate = answerCandidates[0];
            
            // Проверяем, есть ли информация о правильности в статистике
            if (stats.correctAttempts && stats.totalAttempts) {
                const accuracy = stats.correctAttempts / stats.totalAttempts;
                console.log(`[Method 2] Точность статистики: ${Math.round(accuracy * 100)}%`);
            }
            
            console.log(`[Method 2] Найден наиболее популярный ответ: "${bestCandidate.answer.text}" (${bestCandidate.count} использований)`);
            return bestCandidate.answer;
        }

        findCorrectAnswerOnPage(question) {
            // Метод 3: Поиск на странице
            // Ищет уже отмеченные правильные ответы
            
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                // Способ 1: Ищем ответы, помеченные как правильные в структуре вопроса
                const correctAnswer = question.answers.find(a => a.correct);
                if (correctAnswer) {
                    console.log('[Method 3] Найден правильный ответ по флагу correct');
                    return correctAnswer;
                }

                // Способ 2: Ищем в feedback или outcome блоках
                const feedbackSelectors = [
                    '.feedback', 
                    '.outcome', 
                    '.specificfeedback',
                    '.generalfeedback',
                    '.rightanswer',
                    '.correctanswer',
                    '[class*="correct"]',
                    '[class*="right"]'
                ];
                
                for (const selector of feedbackSelectors) {
                    const feedback = question.element.querySelector(selector);
                if (feedback) {
                    const feedbackText = feedback.innerText.toLowerCase();
                        const feedbackHTML = feedback.innerHTML.toLowerCase();
                        
                        // Ищем упоминания правильности
                        const correctnessKeywords = [
                            'правильн', 'correct', 'верн', 'right', 
                            'верный', 'верный ответ', 'правильный ответ'
                        ];
                        
                        const isCorrectFeedback = correctnessKeywords.some(kw => 
                            feedbackText.includes(kw) || feedbackHTML.includes(kw)
                        );
                        
                        if (isCorrectFeedback) {
                            // Ищем упоминание конкретного ответа
                            for (const answer of question.answers) {
                                const answerText = answer.text.toLowerCase().trim();
                                // Проверяем, упоминается ли текст ответа в feedback
                                if (answerText && (feedbackText.includes(answerText) || 
                                    feedbackHTML.includes(answerText))) {
                                    console.log('[Method 3] Найден правильный ответ в feedback:', answer.text);
                                    return answer;
                                }
                            }
                        }
                    }
                }

                // Способ 3: Ищем визуальные индикаторы правильности (зеленый цвет, галочки)
                for (const answer of question.answers) {
                    if (answer.label) {
                        const styles = window.getComputedStyle(answer.label);
                        const color = styles.color;
                        const bgColor = styles.backgroundColor;
                        
                        // Проверяем зеленый цвет (индикатор правильности)
                        if (color.includes('rgb(40, 167, 69)') || 
                            color.includes('rgb(76, 175, 80)') ||
                            color.includes('green') ||
                            bgColor.includes('rgb(40, 167, 69)') ||
                            bgColor.includes('rgb(76, 175, 80)')) {
                            console.log('[Method 3] Найден правильный ответ по цвету');
                            return answer;
                        }
                        
                        // Проверяем наличие галочек или других индикаторов
                        if (answer.label.querySelector('.fa-check, .icon-check, [class*="check"]')) {
                            console.log('[Method 3] Найден правильный ответ по иконке');
                            return answer;
                        }
                    }
                }

                // Способ 4: Ищем в скрытых полях или атрибутах
                const hiddenInputs = question.element.querySelectorAll('input[type="hidden"]');
                for (const input of hiddenInputs) {
                    if (input.name && input.name.includes('correct') && input.value) {
                        const matchingAnswer = question.answers.find(a => 
                            a.value === input.value || a.text.includes(input.value)
                        );
                        if (matchingAnswer) {
                            console.log('[Method 3] Найден правильный ответ в скрытом поле');
                            return matchingAnswer;
                        }
                    }
                }
            }

            console.log('[Method 3] Правильный ответ на странице не найден');
            return null;
        }

        findAnswerByHeuristics(question) {
            // Метод 4: Эвристический анализ
            // Анализирует варианты ответов и выбирает наиболее вероятный
            
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                const answers = question.answers;
                if (answers.length === 0) return null;

                // Эвристика 1: Ответы с ключевыми словами "все", "все вышеперечисленное"
                const inclusiveKeywords = [
                    'все', 'все вышеперечисленное', 'all of the above', 
                    'все перечисленное', 'все варианты', 'все ответы',
                    'правильны все', 'all are correct'
                ];
                const inclusiveAnswer = answers.find(a => {
                    const text = a.text.toLowerCase();
                    return inclusiveKeywords.some(kw => text.includes(kw));
                });
                if (inclusiveAnswer) {
                    console.log('[Method 4] Эвристика: найден ответ с ключевым словом "все"');
                    return inclusiveAnswer;
                }

                // Эвристика 2: Для True/False - обычно True более вероятен
                if (question.type === 'truefalse') {
                    const trueKeywords = ['true', 'да', 'верно', 'правильно', 'истина'];
                    const trueAnswer = answers.find(a => {
                        const text = a.text.toLowerCase().trim();
                        return trueKeywords.some(kw => text === kw || text.includes(kw));
                    });
                    if (trueAnswer) {
                        console.log('[Method 4] Эвристика: для True/False выбран True');
                        return trueAnswer;
                    }
                }

                // Эвристика 3: Самый длинный ответ часто правильный (больше деталей)
                const longestAnswer = answers.reduce((a, b) => 
                    a.text.length > b.text.length ? a : b
                );
                
                // Но проверяем, не слишком ли он длинный (может быть отвлекающим)
                const avgLength = answers.reduce((sum, a) => sum + a.text.length, 0) / answers.length;
                if (longestAnswer.text.length > avgLength * 1.5) {
                    console.log('[Method 4] Эвристика: выбран самый длинный ответ (детальный)');
                return longestAnswer;
            }

                // Эвристика 4: Ответ с наибольшим количеством слов (более детальный)
                const mostWordsAnswer = answers.reduce((a, b) => {
                    const aWords = a.text.split(/\s+/).length;
                    const bWords = b.text.split(/\s+/).length;
                    return aWords > bWords ? a : b;
                });
                console.log('[Method 4] Эвристика: выбран ответ с наибольшим количеством слов');
                return mostWordsAnswer;

                // Эвристика 5: Избегаем ответов с отрицаниями ("не", "никогда", "нет")
                // (не применяем, так как это может быть неправильно)
            }

            console.log('[Method 4] Эвристический анализ не дал результата');
            return null;
        }

        searchAnswerOnline(question) {
            // Метод 5: Онлайн поиск
            // Открывает Google для поиска ответа
            
            // Формируем умный поисковый запрос
            let searchQuery = question.text;
            
            // Очищаем вопрос от лишних символов и форматирования
            searchQuery = searchQuery
                .replace(/\s+/g, ' ') // Убираем множественные пробелы
                .replace(/[^\w\s\?\.]/g, ' ') // Убираем спецсимволы, оставляем буквы, цифры, пробелы, знаки вопроса и точки
                .trim();
            
            // Ограничиваем длину запроса (Google имеет лимит)
            if (searchQuery.length > 200) {
                // Берем первые слова до 200 символов
                searchQuery = searchQuery.substring(0, 200);
                const lastSpace = searchQuery.lastIndexOf(' ');
                if (lastSpace > 0) {
                    searchQuery = searchQuery.substring(0, lastSpace);
                }
            }
            
            // Добавляем контекст для лучшего поиска
            // Если есть варианты ответов, добавляем их к запросу
            if (question.type === 'multichoice' && question.answers.length > 0) {
                const answerTexts = question.answers
                    .slice(0, 3) // Берем первые 3 варианта
                    .map(a => a.text.trim())
                    .filter(t => t.length > 0 && t.length < 50) // Фильтруем слишком длинные
                    .join(' OR ');
                
                if (answerTexts) {
                    searchQuery += ' ' + answerTexts;
                }
            }
            
            // Кодируем для URL
            const encodedQuery = encodeURIComponent(searchQuery);
            const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;
            
            console.log('[Method 5] Открываю поиск в Google:', searchQuery);
            window.open(googleUrl, '_blank');
        }

        applyAnswer(question, answer) {
            console.log('[applyAnswer] Применяю ответ:', answer);
            
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                let input = answer.input;
                
                // Если input не найден, пытаемся найти его по value
                if (!input && answer.value) {
                    console.log('[applyAnswer] input не найден, ищу по value:', answer.value);
                    const questionElement = question.element;
                    input = questionElement.querySelector(`input[type="radio"][value="${answer.value}"], input[type="checkbox"][value="${answer.value}"]`);
                    
                    if (input) {
                        console.log('[applyAnswer] Найден input по value');
                    } else {
                        // Пытаемся найти по тексту ответа
                        const allInputs = questionElement.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                        for (const inp of allInputs) {
                            const label = questionElement.querySelector(`label[for="${inp.id}"]`) || 
                                        inp.closest('label') || 
                                        inp.parentElement;
                            if (label && (label.innerText.includes(answer.text) || answer.text.includes(label.innerText.trim()))) {
                                input = inp;
                                console.log('[applyAnswer] Найден input по тексту');
                                break;
                            }
                        }
                    }
                }
                
                if (input) {
                    console.log('[applyAnswer] Применяю к input:', input.value);
                    // Сначала кликаем на label, если есть
                    const label = input.closest('label') || 
                                 question.element.querySelector(`label[for="${input.id}"]`);
                    if (label) {
                        console.log('[applyAnswer] Кликаю на label');
                        label.click();
                    }
                    
                    // Затем устанавливаем checked и отправляем события
                    input.checked = true;
                    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    input.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    
                    console.log('[applyAnswer] Ответ применен успешно');
                } else {
                    console.error('[applyAnswer] Не удалось найти input для ответа:', answer);
                }
            } else if (question.type === 'shortanswer' || question.type === 'numerical') {
                // Для текстовых полей нужен поиск ответа отдельно
                this.showNotification('Для текстовых вопросов используйте поиск в Google', 'info');
            }
        }

        async autoSolveAll() {
            if (!confirm('Автоматически решить все вопросы? Это может занять некоторое время.')) {
                return;
            }

            this.showNotification('🚀 Начинаю автоматическое решение всех вопросов...', 'info');

            for (const [id, question] of this.questions) {
                if (this.solvingInProgress.has(id)) continue;

                const button = question.element.querySelector('.quiz-solver-btn.solve');
                if (button) {
                    await this.findAndApplyAnswer(question, button);
                    // Небольшая задержка между вопросами
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            this.showNotification('✅ Автоматическое решение завершено! Проверьте ответы.', 'success');
        }

        showNotification(message, type = 'info') {
            // Удаляем предыдущие уведомления
            const existing = document.querySelectorAll('.quiz-solver-notification');
            existing.forEach(el => el.remove());

            // Убираем эмодзи из сообщения
            const cleanMessage = message.replace(/[📊✅❌💡🔍🚀]/g, '').trim();

            const notification = document.createElement('div');
            notification.className = 'quiz-solver-notification';
            
            const colors = {
                success: { border: '#16a34a', text: '#16a34a', bg: '#f0fdf4' },
                error: { border: '#dc2626', text: '#dc2626', bg: '#fef2f2' },
                warning: { border: '#f59e0b', text: '#f59e0b', bg: '#fffbeb' },
                info: { border: '#2563eb', text: '#2563eb', bg: '#eff6ff' }
            };
            
            const colorScheme = colors[type] || colors.info;
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                background: white;
                border: 1px solid ${colorScheme.border};
                border-left-width: 4px;
                color: #111827;
                border-radius: 6px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                z-index: 100000;
                font-size: 14px;
                font-weight: 600;
                max-width: 400px;
                animation: slideIn 0.3s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 4px; height: 4px; border-radius: 50%; background: ${colorScheme.border}; flex-shrink: 0;"></div>
                    <span style="color: #111827; font-weight: 600;">${cleanMessage}</span>
                </div>
            `;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 4000);
        }

        setupAutoSave() {
            // Отслеживаем изменения ответов для автоматического сохранения
            this.questions.forEach((question) => {
                this.setupQuestionAutoSave(question);
            });
        }

        setupQuestionAutoSave(question) {
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                // Отслеживаем изменения радио-кнопок и чекбоксов
                question.answers.forEach((answer) => {
                    if (answer.input) {
                        const handleChange = async () => {
                            if (answer.input.checked) {
                                const currentAnswer = this.getCurrentAnswer(question);
                                if (currentAnswer) {
                                    // Автоматически сохраняем ответ
                                    await this.autoSaveAnswer(question, currentAnswer);
                                }
                            }
                        };
                        
                        answer.input.addEventListener('change', handleChange);
                        answer.input.addEventListener('click', handleChange);
                    }
                });
            } else if (question.type === 'shortanswer' || question.type === 'numerical') {
                // Отслеживаем изменения текстовых полей
                const input = question.answers[0]?.input;
                if (input) {
                    let saveTimeout;
                    const handleInput = async () => {
                        // Используем debounce для текстовых полей
                        clearTimeout(saveTimeout);
                        saveTimeout = setTimeout(async () => {
                            const currentAnswer = this.getCurrentAnswer(question);
                            if (currentAnswer) {
                                await this.autoSaveAnswer(question, currentAnswer);
                            }
                        }, 1000); // Сохраняем через 1 секунду после последнего изменения
                    };
                    
                    input.addEventListener('input', handleInput);
                    input.addEventListener('change', handleInput);
                }
            }
        }

        async autoSaveAnswer(question, answer) {
            try {
                // Определяем правильность, если возможно
                const isCorrect = this.checkAnswerCorrectness(question, answer);
                
                // Извлекаем изображение из вопроса
                const questionImage = await this.extractQuestionImage(question.element);
                
                // Сохраняем ответ
                await this.saveAnswer(question.hash, answer, isCorrect, question.text, questionImage);
                
                // Показываем индикатор сохранения
                this.showAutoSaveIndicator(question.element);
                
                console.log(`Auto-saved answer for question ${question.hash}`);
            } catch (e) {
                console.error('Error auto-saving answer:', e);
            }
        }

        showAutoSaveIndicator(element) {
            // Удаляем предыдущий индикатор, если есть
            const existing = element.querySelector('.auto-save-indicator');
            if (existing) {
                existing.remove();
            }

            // Создаем новый индикатор
            const indicator = document.createElement('div');
            indicator.className = 'auto-save-indicator';
            indicator.innerHTML = 'Автосохранено';
            indicator.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                background: #4CAF50;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
                z-index: 1000;
                animation: fadeInOut 2s ease;
                pointer-events: none;
            `;

            // Добавляем стили для анимации, если их еще нет
            if (!document.getElementById('auto-save-styles')) {
                const style = document.createElement('style');
                style.id = 'auto-save-styles';
                style.textContent = `
                    @keyframes fadeInOut {
                        0% { opacity: 0; transform: translateY(-5px); }
                        20% { opacity: 1; transform: translateY(0); }
                        80% { opacity: 1; transform: translateY(0); }
                        100% { opacity: 0; transform: translateY(-5px); }
                    }
                `;
                document.head.appendChild(style);
            }

            const questionContainer = element.querySelector('.qtext')?.parentElement || element;
            if (questionContainer.style.position !== 'relative') {
                questionContainer.style.position = 'relative';
            }
            
            questionContainer.appendChild(indicator);

            // Удаляем индикатор через 2 секунды
            setTimeout(() => {
                if (indicator.parentElement) {
                    indicator.remove();
                }
            }, 2000);
        }

        observeDOM() {
            let isProcessing = false;
            let timeoutId = null;
            
            const observer = new MutationObserver((mutations) => {
                // Пропускаем мутации, вызванные самим расширением
                const isOurMutation = mutations.some(mutation => {
                    return Array.from(mutation.addedNodes).some(node => {
                        if (node.nodeType === 1) { // Element node
                            return node.classList?.contains('quiz-solver-btn') ||
                                   node.classList?.contains('quiz-solver-buttons') ||
                                   node.classList?.contains('quiz-solver-saved') ||
                                   node.classList?.contains('quiz-solver-stats') ||
                                   node.id === 'quiz-solver-results-panel' ||
                                   node.id === 'quiz-solver-rescan-btn';
                        }
                        return false;
                    });
                });
                
                if (isOurMutation || isProcessing) {
                    return; // Пропускаем мутации, вызванные расширением
                }
                
                // Debounce: ждем 500ms перед обработкой
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                timeoutId = setTimeout(() => {
                    if (isProcessing) return;
                    
                    // Проверяем только на страницах вопросов (не на страницах результатов)
                    if (this.isReviewPage()) {
                        return; // Не обрабатываем мутации на страницах результатов
                    }
                    
                const newQuestions = document.querySelectorAll('.que');
                    if (newQuestions.length !== this.questions.size && newQuestions.length > 0) {
                        isProcessing = true;
                        try {
                    this.parseQuestions();
                    this.addSolveButtons();
                            this.setupAutoSave();
                        } finally {
                            isProcessing = false;
                }
                    }
                }, 500);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Инициализация
    function initializeSolver() {
            new MoodleQuizSolver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSolver);
    } else {
        initializeSolver();
    }

    // Добавляем CSS анимации
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }

        .quiz-solver-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
        }

        .quiz-solver-btn:active {
            transform: translateY(0);
        }

        .quiz-solver-btn:disabled {
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

})();