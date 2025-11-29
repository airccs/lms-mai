// Moodle Quiz Solver - Content Script с поиском ответов и статистикой
(function MoodleQuizSolverInit() {
    'use strict';

    console.log('Moodle Quiz Solver: Content script loaded');

    class MoodleQuizSolver {
        constructor() {
            this.questions = new Map();
            this.solvingInProgress = new Set();
            this.savedAnswers = new Map();
            this.statistics = new Map();
            this.init();
        }

        async init() {
            await this.loadSavedAnswers();
            await this.loadStatistics();
            
            // Проверяем, находимся ли мы на странице результатов
            if (this.isReviewPage()) {
                this.processReviewPage();
            } else {
                this.parseQuestions();
                this.addSolveButtons();
                this.setupAutoSave(); // Настраиваем автоматическое сохранение
            }
            
            this.observeDOM();
        }

        isReviewPage() {
            // Проверяем наличие элементов, характерных для страницы результатов
            const hasReviewElements = document.querySelector('#page-mod-quiz-review') !== null ||
                   document.querySelector('.quizreviewsummary') !== null ||
                   document.querySelector('.quiz-summary') !== null ||
                   document.querySelector('.quizresults') !== null;
            
            const hasReviewUrl = window.location.href.includes('review') ||
                   window.location.href.includes('summary') ||
                   window.location.href.includes('result');
            
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
            console.log('[Review Scanner] Начинаю сканирование страницы результатов...');
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
                        // Сохраняем ответ с правильным isCorrect и текстом вопроса
                        const wasUpdated = await this.saveAnswer(question.hash, userAnswer, isCorrect, question.text);
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
        }

        async updateAllSavedAnswersFromReview(questionElements) {
            // Обновляем все сохраненные ответы на основе текущей страницы результатов
            try {
                const allSaved = await chrome.storage.local.get(null);
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
                                    await this.saveAnswer(
                                        question.hash, 
                                        userAnswer || savedData.answer, 
                                        isCorrect, 
                                        question.text || savedData.questionText
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
            rescanBtn.innerHTML = '🔄 Повторно сканировать результаты';
            rescanBtn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 100002;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: all 0.3s ease;
            `;

            rescanBtn.addEventListener('mouseenter', () => {
                rescanBtn.style.transform = 'translateY(-2px)';
                rescanBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
            });

            rescanBtn.addEventListener('mouseleave', () => {
                rescanBtn.style.transform = 'translateY(0)';
                rescanBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            });

            rescanBtn.addEventListener('click', async () => {
                rescanBtn.disabled = true;
                rescanBtn.innerHTML = '⏳ Сканирование...';
                await this.processReviewPage();
                rescanBtn.disabled = false;
                rescanBtn.innerHTML = '🔄 Повторно сканировать результаты';
            });

            document.body.appendChild(rescanBtn);
        }

        showQuizResults(total, correct, incorrect, results) {
            const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
            
            // Создаем панель результатов
            const resultsPanel = document.createElement('div');
            resultsPanel.id = 'quiz-solver-results-panel';
            resultsPanel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                z-index: 100001;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-height: 80vh;
                overflow-y: auto;
            `;

            const color = percentage >= 80 ? '#4CAF50' : percentage >= 60 ? '#FF9800' : '#f44336';
            
            resultsPanel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; color: #333; font-size: 18px;">📊 Результаты теста</h3>
                    <button id="close-results-panel" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">×</button>
                </div>
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 48px; font-weight: bold; color: ${color}; margin-bottom: 5px;">${percentage}%</div>
                    <div style="font-size: 14px; color: #666;">Правильных ответов</div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <div style="flex: 1; text-align: center; padding: 10px; background: #E8F5E9; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">${correct}</div>
                        <div style="font-size: 12px; color: #666;">Правильно</div>
                    </div>
                    <div style="flex: 1; text-align: center; padding: 10px; background: #FFEBEE; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #f44336;">${incorrect}</div>
                        <div style="font-size: 12px; color: #666;">Неправильно</div>
                    </div>
                    <div style="flex: 1; text-align: center; padding: 10px; background: #F5F5F5; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #666;">${total}</div>
                        <div style="font-size: 12px; color: #666;">Всего</div>
                    </div>
                </div>
                <div style="border-top: 1px solid #eee; padding-top: 15px;">
                    <div style="font-weight: bold; margin-bottom: 10px; color: #333;">Детали по вопросам:</div>
                    <div id="results-details" style="max-height: 300px; overflow-y: auto;"></div>
                </div>
            `;

            document.body.appendChild(resultsPanel);

            // Добавляем детали по вопросам
            const detailsContainer = document.getElementById('results-details');
            results.forEach((result, index) => {
                const detailItem = document.createElement('div');
                detailItem.style.cssText = `
                    padding: 10px;
                    margin-bottom: 8px;
                    border-radius: 6px;
                    border-left: 4px solid ${result.isCorrect ? '#4CAF50' : '#f44336'};
                    background: ${result.isCorrect ? '#E8F5E9' : '#FFEBEE'};
                    font-size: 13px;
                `;
                
                const answerText = this.formatAnswer(result.userAnswer);
                detailItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span><strong>Вопрос ${index + 1}:</strong> ${result.isCorrect ? '✅' : '❌'}</span>
                        <span style="color: ${result.isCorrect ? '#4CAF50' : '#f44336'}; font-weight: bold;">
                            ${result.isCorrect ? 'Правильно' : 'Неправильно'}
                        </span>
                    </div>
                    <div style="margin-top: 5px; color: #666; font-size: 12px;">
                        Ваш ответ: ${answerText}
                    </div>
                `;
                
                detailItem.addEventListener('click', () => {
                    result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    result.element.style.outline = '3px solid #2196F3';
                    setTimeout(() => {
                        result.element.style.outline = '';
                    }, 2000);
                });
                
                detailsContainer.appendChild(detailItem);
            });

            // Закрытие панели
            document.getElementById('close-results-panel').addEventListener('click', () => {
                resultsPanel.remove();
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
                        
                        // Убираем значение input.value только если оно в начале и совпадает с буквой варианта
                        // Например, если value="c" и текст "c. 23.6", оставляем "c. 23.6"
                        const valuePattern = new RegExp(`^${selected.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?\\s*`, 'i');
                        if (text.match(valuePattern)) {
                            // Убираем только букву варианта в начале, сохраняя остальное
                            text = text.replace(valuePattern, '').trim();
                            // Добавляем букву обратно для полного формата
                            text = `${selected.value}. ${text}`;
                        }
                        
                        // Нормализуем пробелы
                        text = text.replace(/\s+/g, ' ').trim();
                        
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
                    
                    // Извлекаем букву варианта и полное значение (включая числа)
                    // Паттерн: буква, точка (опционально), пробелы, затем все остальное до конца строки
                    const variantMatch = answerStr.match(/^([a-e])\.?\s*(.+)$/i);
                    if (variantMatch) {
                        const variant = variantMatch[1].toLowerCase();
                        let answerValue = variantMatch[2].trim();
                        
                        // Убираем лишние пробелы, но сохраняем числа
                        answerValue = answerValue.replace(/\s+/g, ' ').trim();
                        
                        // Пытаемся найти соответствующий вариант в question.answers
                        for (const answer of question.answers || []) {
                            if (answer.value === variant || answer.value.toLowerCase() === variant) {
                                // Используем извлеченное значение, если оно содержит число
                                // Иначе используем текст из answer
                                const finalText = answerValue || answer.text || answer.value;
                                return {
                                    value: answer.value,
                                    text: finalText
                                };
                            }
                        }
                        
                        // Если не нашли в question.answers, возвращаем то что извлекли
                        return {
                            value: variant,
                            text: answerValue
                        };
                    }
                }
                
                // Способ 2.5: Ищем правильный ответ, если он выделен (для случаев когда нужно сохранить правильный)
                const correctAnswer = element.querySelector('.rightanswer, .correctanswer, .correct .answer');
                if (correctAnswer) {
                    const correctText = correctAnswer.innerText || correctAnswer.textContent;
                    const correctMatch = correctText.match(/^([a-e])\.?\s*(.+)$/i);
                    if (correctMatch) {
                        const variant = correctMatch[1].toLowerCase();
                        let answerValue = correctMatch[2].trim();
                        answerValue = answerValue.replace(/\s+/g, ' ').trim();
                        
                        for (const answer of question.answers || []) {
                            if (answer.value === variant || answer.value.toLowerCase() === variant) {
                                return {
                                    value: answer.value,
                                    text: answerValue || answer.text || answer.value
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
                        let text = label.innerText || label.textContent;
                        text = text.replace(input.value, '').trim();
                        text = text.replace(/[✓✗✔✘]/g, '').trim();
                        text = text.replace(/\s+/g, ' ').trim();
                        return {
                            value: input.value,
                            text: text
                        };
                    }
                    
                    // Если нет checked, но есть класс selected/answered (не correct!)
                    if (label.classList.contains('selected') || label.classList.contains('answered')) {
                        const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input) {
                            let text = label.innerText || label.textContent;
                            text = text.replace(input.value, '').trim();
                            text = text.replace(/[✓✗✔✘]/g, '').trim();
                            text = text.replace(/\s+/g, ' ').trim();
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
            let hash = 0;
            const normalized = questionText.toLowerCase().trim().replace(/\s+/g, ' ');
            for (let i = 0; i < normalized.length; i++) {
                const char = normalized.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash).toString(36);
        }

        async loadSavedAnswers() {
            try {
                const result = await chrome.storage.local.get(null);
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
                // Сначала загружаем локальную статистику
                const result = await chrome.storage.sync.get(['questionStats', 'apiSettings']);
                if (result.questionStats) {
                    for (const [key, value] of Object.entries(result.questionStats)) {
                        this.statistics.set(key, value);
                    }
                    console.log(`Loaded ${this.statistics.size} questions from local storage`);
                }

                // Всегда загружаем статистику с сервера (синхронизация всегда включена)
                const settings = { enabled: true, apiUrl: 'https://lms-mai-api.iljakir-06.workers.dev', apiKey: '' };
                await this.loadStatisticsFromServer(settings);
            } catch (e) {
                console.error('Error loading statistics:', e);
            }
        }

        async loadStatisticsFromServer(settings) {
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'syncWithServer',
                    syncAction: 'getAllStatistics'
                });

                if (response && response.success && response.data) {
                    const serverStats = response.data.statistics || {};
                    let loadedCount = 0;

                    // Объединяем статистику с сервера с локальной
                    for (const [key, value] of Object.entries(serverStats)) {
                        const localStats = this.statistics.get(key);
                        if (localStats) {
                            // Объединяем: берем максимум из обоих источников
                            const merged = {
                                totalAttempts: Math.max(localStats.totalAttempts || 0, value.totalAttempts || 0),
                                correctAttempts: Math.max(localStats.correctAttempts || 0, value.correctAttempts || 0),
                                answers: { ...localStats.answers, ...value.answers },
                                errors: [...(localStats.errors || []), ...(value.errors || [])]
                            };
                            this.statistics.set(key, merged);
                        } else {
                            this.statistics.set(key, value);
                        }
                        loadedCount++;
                    }

                    console.log(`Loaded ${loadedCount} questions from server`);
                }
            } catch (e) {
                console.error('Error loading statistics from server:', e);
            }
        }

        async saveAnswer(questionHash, answer, isCorrect = null, questionText = null) {
            try {
                // Проверяем, есть ли уже сохраненный ответ
                const existingKey = `answer_${questionHash}`;
                const existing = await chrome.storage.local.get([existingKey]);
                const existingData = existing[existingKey];
                
                // Если ответ уже есть, обновляем только если новый статус более точный
                let shouldUpdate = true;
                if (existingData) {
                    // Обновляем если:
                    // 1. Старый статус был null, а новый известен
                    // 2. Новый статус отличается от старого (исправляем ошибку)
                    // 3. Есть текст вопроса, а раньше не было
                    if (existingData.isCorrect !== null && isCorrect === null) {
                        shouldUpdate = false; // Не перезаписываем известный статус на null
                    } else if (existingData.isCorrect === isCorrect && 
                               existingData.questionText && !questionText) {
                        shouldUpdate = false; // Не теряем текст вопроса
                    }
                }

                if (shouldUpdate) {
                    const answerData = {
                        answer: answer,
                        timestamp: existingData?.timestamp || Date.now(), // Сохраняем оригинальную дату
                        isCorrect: isCorrect !== null ? isCorrect : (existingData?.isCorrect || null),
                        questionText: questionText || existingData?.questionText || null
                    };
                    
                    await chrome.storage.local.set({
                        [existingKey]: answerData
                    });
                    this.savedAnswers.set(questionHash, answerData);
                    console.log(`[Save] ${existingData ? 'Обновлен' : 'Сохранен'} ответ для вопроса (hash: ${questionHash}, isCorrect: ${isCorrect})`);
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
                const stats = this.statistics.get(questionHash) || {
                    totalAttempts: 0,
                    correctAttempts: 0,
                    answers: {},
                    errors: []
                };

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

                // Сохраняем в sync storage для синхронизации между устройствами
                const allStats = {};
                for (const [key, value] of this.statistics) {
                    allStats[key] = value;
                }
                await chrome.storage.sync.set({ questionStats: allStats });

                // Отправляем на сервер для синхронизации между пользователями (всегда включено)
                try {
                    const response = await chrome.runtime.sendMessage({
                        action: 'syncWithServer',
                        questionHash: questionHash,
                        answer: answer,
                        isCorrect: isCorrect,
                        syncAction: 'submitAnswer'
                    });

                    if (response && response.success && response.data) {
                        // Обновляем статистику с сервера
                        const serverStats = response.data.statistics;
                        if (serverStats) {
                            this.statistics.set(questionHash, serverStats);
                        }
                        console.log('Statistics synced with server');
                    }
                } catch (serverError) {
                    console.warn('Failed to sync with server, using local only:', serverError);
                }
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

                const questionHash = this.hashQuestion(text);
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
            // Пытаемся найти текст вопроса в разных местах
            let qtext = element.querySelector('.qtext');
            
            // Если не нашли .qtext, ищем в других местах
            if (!qtext) {
                qtext = element.querySelector('.questiontext, .question-text, [class*="question"]');
            }
            
            // Если все еще не нашли, берем весь элемент вопроса, но исключаем ответы
            if (!qtext) {
                qtext = element.cloneNode(true);
                // Убираем блоки с ответами
                qtext.querySelectorAll('.answer, .ablock, .formulation, input[type="radio"], input[type="checkbox"]').forEach(el => {
                    const parent = el.closest('.answer, .ablock, .formulation, label');
                    if (parent) parent.remove();
                });
            } else {
                qtext = qtext.cloneNode(true);
            }
            
            if (qtext) {
                // ВАЖНО: Сначала извлекаем параметры из исходного элемента ДО клонирования
                // Ищем все параметры в формате "переменная = значение" в исходном DOM
                const originalQtext = element.querySelector('.qtext') || 
                                      element.querySelector('.questiontext, .question-text, [class*="question"]') ||
                                      element;
                
                // Извлекаем параметры из исходного DOM, включая те, что рядом с .nolink
                const originalNolinks = originalQtext ? originalQtext.querySelectorAll('.nolink, span.nolink') : [];
                const params = [];
                
                // Для каждого .nolink элемента ищем ближайший параметр в исходном DOM
                originalNolinks.forEach((nolinkEl, nolinkIndex) => {
                    // Ищем параметр в тексте вокруг nolink элемента
                    // Стратегия: ищем параметр в родительском элементе, но учитываем позицию nolink
                    
                    let parent = nolinkEl.parentElement;
                    let found = false;
                    
                    // Получаем весь текст родителя до обработки
                    const parentClone = parent ? parent.cloneNode(true) : null;
                    if (!parentClone) return;
                    
                    parentClone.querySelectorAll('script, style').forEach(el => el.remove());
                    
                    // Обрабатываем sup/sub в клоне
                    parentClone.querySelectorAll('sup').forEach(supEl => {
                        const supText = supEl.textContent || '';
                        if (supText) {
                            const textNode = document.createTextNode(supText);
                            supEl.parentNode.replaceChild(textNode, supEl);
                        } else {
                            supEl.remove();
                        }
                    });
                    
                    parentClone.querySelectorAll('sub').forEach(subEl => {
                        const subText = subEl.textContent || '';
                        if (subText) {
                            const textNode = document.createTextNode(subText);
                            subEl.parentNode.replaceChild(textNode, subEl);
                        } else {
                            subEl.remove();
                        }
                    });
                    
                    const parentText = parentClone.textContent || parentClone.innerText || '';
                    
                    // Находим позицию текущего nolink в тексте
                    // ВАЖНО: Работаем только с клоном, не изменяем исходный DOM
                    // Создаем копию nolink элемента в клоне для определения позиции
                    const nolinkClone = parentClone.querySelector('.nolink, span.nolink');
                    let markerIndex = -1;
                    
                    if (nolinkClone) {
                        // Создаем временный маркер в клоне (не в исходном DOM!)
                        const tempMarker = document.createTextNode('__NOLINK_MARKER__');
                        nolinkClone.parentNode.insertBefore(tempMarker, nolinkClone);
                        const markerText = parentClone.textContent || '';
                        markerIndex = markerText.indexOf('__NOLINK_MARKER__');
                        tempMarker.remove();
                    }
                    
                    // Ищем все параметры в тексте родителя
                    const paramPattern = /([a-zA-Zа-яА-Я][a-zA-Zа-яА-Я0-9]*)\s*=\s*([-]?\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)/g;
                    const allParams = [];
                    let match;
                    while ((match = paramPattern.exec(parentText)) !== null) {
                        const paramStart = match.index;
                        const paramEnd = paramStart + match[0].length;
                        const key = match[1];
                        const value = match[2];
                        const full = key + ' = ' + value;
                        
                        allParams.push({
                            key,
                            value,
                            full,
                            start: paramStart,
                            end: paramEnd
                        });
                    }
                    
                    // Находим параметр, который ближе всего к позиции nolink
                    if (allParams.length > 0 && markerIndex >= 0) {
                        // Сортируем параметры по расстоянию до маркера
                        allParams.sort((a, b) => {
                            const distA = Math.abs(a.start - markerIndex);
                            const distB = Math.abs(b.start - markerIndex);
                            return distA - distB;
                        });
                        
                        // Берем ближайший параметр, но только если он не слишком далеко (в пределах 200 символов)
                        const closestParam = allParams[0];
                        if (closestParam && Math.abs(closestParam.start - markerIndex) < 200) {
                            // Проверяем, не добавили ли мы уже этот параметр для этого nolink
                            if (!params.some(p => p.full === closestParam.full && p.nolinkEl === nolinkEl)) {
                                params.push({ 
                                    key: closestParam.key, 
                                    value: closestParam.value, 
                                    full: closestParam.full, 
                                    nolinkEl,
                                    index: nolinkIndex
                                });
                            }
                            found = true;
                        }
                    }
                    
                    // Если не нашли по позиции, пробуем найти по контексту (старый метод)
                    if (!found) {
                        // Ищем параметр в формате "переменная = значение" рядом с nolink
                        const paramMatch = parentText.match(/([a-zA-Zа-яА-Я][a-zA-Zа-яА-Я0-9]*)\s*=\s*([-]?\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)/);
                        if (paramMatch) {
                            const key = paramMatch[1];
                            const value = paramMatch[2];
                            const full = key + ' = ' + value;
                            // Проверяем, не добавили ли мы уже этот параметр
                            if (!params.some(p => p.full === full && p.nolinkEl === nolinkEl)) {
                                params.push({ key, value, full, nolinkEl, index: nolinkIndex });
                            }
                        }
                    }
                });
                
                // Также извлекаем все параметры из исходного текста (на случай, если они не рядом с .nolink)
                const originalText = originalQtext ? (originalQtext.textContent || originalQtext.innerText || '') : '';
                const paramPattern = /([a-zA-Zа-яА-Я0-9]+)\s*=\s*(\d+(?:\.\d+)?)/g;
                const paramsMap = new Map();
                let match;
                while ((match = paramPattern.exec(originalText)) !== null) {
                    const key = match[1];
                    const value = match[2];
                    const full = key + ' = ' + value;
                    // Сохраняем только уникальные параметры
                    if (!paramsMap.has(full) && !params.some(p => p.full === full)) {
                        paramsMap.set(full, { key, value, full });
                    }
                }
                // Добавляем параметры, которые не были найдены рядом с .nolink
                params.push(...Array.from(paramsMap.values()));
                
                // Убираем скрытые элементы
                qtext.querySelectorAll('.accesshide, .sr-only, [aria-hidden="true"]').forEach(el => el.remove());
                
                // Убираем скрипты и стили
                qtext.querySelectorAll('script, style').forEach(el => el.remove());
                
                // Убираем кнопки и элементы управления расширения
                qtext.querySelectorAll('.quiz-solver-btn, .quiz-solver-buttons, .quiz-solver-saved, .quiz-solver-stats, button').forEach(el => el.remove());
                
                // Обрабатываем элементы .nolink - заменяем их на соответствующие параметры
                const clonedNolinks = Array.from(qtext.querySelectorAll('.nolink, span.nolink'));
                clonedNolinks.forEach((nolinkEl, index) => {
                    let value = '';
                    
                    // Пытаемся найти соответствующий параметр из исходного DOM
                    const originalNolink = originalNolinks[index];
                    if (originalNolink) {
                        // Ищем параметр, который был связан с этим nolink
                        // Сначала ищем по точному совпадению nolinkEl
                        let param = params.find(p => p.nolinkEl === originalNolink);
                        
                        // Если не нашли, ищем по индексу
                        if (!param) {
                            param = params.find(p => p.index === index);
                        }
                        
                        if (param) {
                            value = param.full;
                        }
                    }
                    
                    // Если не нашли по связи, пытаемся найти по позиции или контексту
                    if (!value && params.length > 0) {
                        // Ищем параметр в контексте родительского элемента
                        const parent = nolinkEl.parentElement;
                        if (parent) {
                            const context = parent.textContent || '';
                            // Улучшенный паттерн: учитываем отрицательные числа и переменные с цифрами
                            const contextMatch = context.match(/([a-zA-Zа-яА-Я][a-zA-Zа-яА-Я0-9]*)\s*=\s*([-]?\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)/);
                            if (contextMatch) {
                                value = contextMatch[1] + ' = ' + contextMatch[2];
                            }
                        }
                        
                        // Если все еще не нашли, используем параметр по индексу (только если их количество совпадает)
                        if (!value && index < params.length) {
                            // Но только если это не первый параметр (чтобы не подставлять m=1 везде)
                            const paramByIndex = params[index];
                            if (paramByIndex && paramByIndex.full && index > 0) {
                                value = paramByIndex.full;
                            }
                        }
                    }
                    
                    // Заменяем элемент на найденное значение или на пробел
                    if (value) {
                        const textNode = document.createTextNode(' ' + value + ' ');
                        nolinkEl.parentNode.replaceChild(textNode, nolinkEl);
                    } else {
                        // Если значение не найдено, заменяем на пробел
                        const textNode = document.createTextNode(' ');
                        nolinkEl.parentNode.replaceChild(textNode, nolinkEl);
                    }
                });
                
                // Убираем блоки с ответами и вариантами
                qtext.querySelectorAll('.answer, .ablock, .formulation').forEach(el => {
                    // Проверяем, не является ли это частью вопроса
                    if (el.querySelector('input[type="radio"], input[type="checkbox"]')) {
                        el.remove();
                    }
                });
                
                // Получаем текст - используем textContent для сохранения всех данных
                // ВАЖНО: Сначала обрабатываем специальные элементы (sup, sub, MathJax) перед получением textContent
                
                // Обрабатываем элементы <sup> и <sub> - заменяем на читаемый текст
                qtext.querySelectorAll('sup').forEach(supEl => {
                    const supText = supEl.textContent || supEl.innerText || '';
                    if (supText) {
                        // Заменяем на символ степени или просто добавляем в скобках
                        const replacement = supText.match(/^\d+$/) ? '^' + supText : supText;
                        const textNode = document.createTextNode(replacement);
                        supEl.parentNode.replaceChild(textNode, supEl);
                    } else {
                        supEl.remove();
                    }
                });
                
                qtext.querySelectorAll('sub').forEach(subEl => {
                    const subText = subEl.textContent || subEl.innerText || '';
                    if (subText) {
                        // Заменяем на символ индекса или просто добавляем в скобках
                        const replacement = subText.match(/^\d+$/) ? '_' + subText : subText;
                        const textNode = document.createTextNode(replacement);
                        subEl.parentNode.replaceChild(textNode, subEl);
                    } else {
                        subEl.remove();
                    }
                });
                
                // Ищем MathJax элементы и извлекаем их текст ПЕРЕД получением основного текста
                const mathElements = qtext.querySelectorAll('.MathJax, [class*="math"], [data-math], [class*="MathJax"], mjx-container, mjx-math');
                mathElements.forEach(mathEl => {
                    // Пытаемся извлечь текст из различных источников
                    let mathText = mathEl.getAttribute('alttext') || 
                                  mathEl.getAttribute('data-math') ||
                                  mathEl.getAttribute('aria-label') ||
                                  '';
                    
                    // Если не нашли в атрибутах, пытаемся извлечь из содержимого
                    if (!mathText) {
                        // Создаем клон и обрабатываем все дочерние элементы, включая sup/sub
                        const clone = mathEl.cloneNode(true);
                        clone.querySelectorAll('script, style').forEach(el => el.remove());
                        
                        // Обрабатываем sup/sub в клоне перед извлечением текста
                        clone.querySelectorAll('sup').forEach(supEl => {
                            const supText = supEl.textContent || '';
                            if (supText) {
                                const replacement = supText.match(/^\d+$/) ? supText : supText;
                                const textNode = document.createTextNode(replacement);
                                supEl.parentNode.replaceChild(textNode, supEl);
                            } else {
                                supEl.remove();
                            }
                        });
                        
                        clone.querySelectorAll('sub').forEach(subEl => {
                            const subText = subEl.textContent || '';
                            if (subText) {
                                const replacement = subText.match(/^\d+$/) ? subText : subText;
                                const textNode = document.createTextNode(replacement);
                                subEl.parentNode.replaceChild(textNode, subEl);
                            } else {
                                subEl.remove();
                            }
                        });
                        
                        mathText = clone.textContent || clone.innerText || '';
                    }
                    
                    // Если нашли текст, заменяем MathJax элемент на текст
                    if (mathText) {
                        const textNode = document.createTextNode(' ' + mathText.trim() + ' ');
                        mathEl.parentNode.replaceChild(textNode, mathEl);
                    } else {
                        // Если не нашли, просто удаляем
                        mathEl.remove();
                    }
                });
                
                // Получаем основной текст после обработки всех специальных элементов
                let text = qtext.textContent || qtext.innerText || '';
                text = text.trim();
                
                // Обрабатываем LaTeX команды - заменяем на читаемый текст
                // ВАЖНО: Сохраняем степени и индексы
                text = text.replace(/\\overline\s*\{?([^}]+)\}?/g, '$1'); // \overline{v} -> v
                text = text.replace(/\\hat\s*\{?([^}]+)\}?/g, '$1'); // \hat{v} -> v
                text = text.replace(/\\vec\s*\{?([^}]+)\}?/g, '$1'); // \vec{v} -> v
                
                // Обрабатываем степени: x^{3} -> x^3, x^3 -> x^3
                text = text.replace(/\^\{([^}]+)\}/g, '^$1');
                
                // Обрабатываем индексы: x_{i} -> x_i, x_i -> x_i
                text = text.replace(/_\{([^}]+)\}/g, '_$1');
                
                // Убираем другие LaTeX команды, но сохраняем содержимое
                // ВАЖНО: Не удаляем команды, которые могут содержать степени
                text = text.replace(/\\[a-zA-Z]+\s*\{?([^}]*)\}?/g, '$1');
                
                // Сохраняем степени в читаемом виде - не удаляем символы ^
                // Например: s = 4t^3 должно остаться s = 4t^3
                
                // Убираем дубликаты - применяем несколько раз для надежности
                // Важно: применяем в правильном порядке, от более специфичных к общим
                
                // Случай 1: "s = 4t3s = 4t3" (переменная содержит цифры в значении)
                text = text.replace(/([a-zA-Zа-яА-Я]+)\s*=\s*(\d+[a-zA-Zа-яА-Я0-9]+)\s*\1\s*=\s*\2/g, '$1 = $2');
                
                // Случай 2: "m = 1m = 1", "m = 10m = 10", "a = 14a = 14" (переменная = число переменная = число без пробела)
                // Более точный паттерн: переменная = число, затем та же переменная = то же число
                text = text.replace(/([a-zA-Zа-яА-Я]+)\s*=\s*(\d+(?:\.\d+)?)([a-zA-Zа-яА-Я]+)\s*=\s*\2/g, '$1 = $2');
                
                // Случай 3: "m = 1 m = 1", "m = 10 m = 10" (с пробелом между, с единицами измерения)
                text = text.replace(/([a-zA-Zа-яА-Я]+)\s*=\s*(\d+(?:\.\d+)?)\s+([а-яА-Я]+)?\s+\1\s*=\s*\2(?:\s+\3)?/g, '$1 = $2 $3');
                
                // Случай 4: "m2=5m2=5", "ε=120ε=120" (без пробелов, с цифрами в переменной)
                text = text.replace(/([a-zA-Zа-яА-Я0-9]+)=(\d+(?:\.\d+)?)\1=\2/g, '$1=$2');
                
                // Случай 5: Общий паттерн для любых дубликатов "переменная = значение переменная = значение"
                // Применяем несколько раз для надежности
                for (let i = 0; i < 3; i++) {
                    text = text.replace(/([a-zA-Zа-яА-Я0-9]+)\s*=\s*(\d+(?:\.\d+)?[a-zA-Zа-яА-Я0-9]*)\s*\1\s*=\s*\2/g, '$1 = $2');
                    text = text.replace(/([a-zA-Zа-яА-Я0-9]+)\s*=\s*(\d+(?:\.\d+)?)\s*\1\s*=\s*\2/g, '$1 = $2');
                }
                
                // Убираем множественные пробелы (но сохраняем одиночные)
                text = text.replace(/\s{2,}/g, ' ');
                
                // Нормализуем пробелы вокруг знаков равенства (добавляем пробелы для читаемости)
                text = text.replace(/([a-zA-Zа-яА-Я0-9])\s*=\s*(\d+(?:\.\d+)?)/g, '$1 = $2');
                text = text.replace(/(\d+(?:\.\d+)?)\s*=\s*([a-zA-Zа-яА-Я0-9])/g, '$1 = $2');
                
                // Убираем пробелы в начале и конце строк
                text = text.trim();
                
                // Убираем пустые строки
                text = text.replace(/\n\s*\n/g, '\n');
                
                // Удаляем дубликаты всего текста вопроса
                // Стратегия: ищем повторяющиеся большие блоки текста и удаляем дубликаты
                
                // Метод 1: Удаляем повторяющиеся предложения (более 50 символов)
                const minSentenceLength = 50;
                const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length >= minSentenceLength);
                if (sentences.length > 1) {
                    const seenSentences = new Set();
                    const uniqueSentences = [];
                    
                    for (const sentence of sentences) {
                        const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 200); // Берем первые 200 символов для сравнения
                        if (!seenSentences.has(normalized)) {
                            seenSentences.add(normalized);
                            uniqueSentences.push(sentence.trim());
                        }
                    }
                    
                    // Если нашли дубликаты, пересобираем текст
                    if (uniqueSentences.length < sentences.length) {
                        text = uniqueSentences.join(' ');
                    }
                }
                
                // Метод 2: Удаляем повторяющиеся длинные фразы (более 100 символов)
                // Ищем фразы, которые повторяются подряд
                let cleanedText = text;
                const phrasePattern = /(.{100,}?)(?:\s+\1)+/g;
                cleanedText = cleanedText.replace(phrasePattern, '$1');
                
                // Если текст изменился, обновляем
                if (cleanedText !== text) {
                    text = cleanedText;
                }
                
                // Удаляем дубликаты параметров в конце текста (если они были добавлены ранее)
                // Ищем паттерн "параметр, параметр, параметр" в конце
                const paramListPattern = /((?:[a-zA-Zа-яА-Я0-9]+\s*=\s*\d+(?:\.\d+)?,\s*)+[a-zA-Zа-яА-Я0-9]+\s*=\s*\d+(?:\.\d+)?)\s*$/;
                const paramListMatch = text.match(paramListPattern);
                if (paramListMatch) {
                    // Извлекаем список параметров
                    const paramList = paramListMatch[1];
                    // Убираем дубликаты из списка
                    const paramsArray = paramList.split(',').map(p => p.trim());
                    const uniqueParams = Array.from(new Set(paramsArray));
                    // Заменяем список на уникальные параметры
                    text = text.replace(paramListPattern, uniqueParams.join(', '));
                }
                
                console.log('[ExtractQuestionText] Извлеченный текст:', text.substring(0, 200));
                
                return text;
            }
            return null;
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
                return this.extractAnswers(element, type);
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

            // Проверяем по стилям (зеленый цвет часто означает правильный ответ)
            const styles = window.getComputedStyle(label);
            const color = styles.color;
            if (color.includes('rgb(40, 167, 69)') || // Bootstrap success
                color.includes('rgb(76, 175, 80)') || // Material success
                color.includes('green')) {
                return true;
            }

            return false;
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
            solveBtn.innerHTML = '🔍 Найти ответ';
            solveBtn.style.cssText = this.getButtonStyle('#4CAF50');

            const handleSolveClick = () => {
                this.findAndApplyAnswer(question, solveBtn);
            };
            solveBtn.addEventListener('click', handleSolveClick);

            // Кнопка сохранения ответа
            const saveBtn = document.createElement('button');
            saveBtn.className = 'quiz-solver-btn save';
            saveBtn.innerHTML = '💾 Сохранить ответ';
            saveBtn.style.cssText = this.getButtonStyle('#9C27B0');

            const handleSaveClick = () => {
                this.saveCurrentAnswer(question, saveBtn);
            };
            saveBtn.addEventListener('click', handleSaveClick);

            // Кнопка авто-решения
            const autoBtn = document.createElement('button');
            autoBtn.className = 'quiz-solver-btn auto';
            autoBtn.innerHTML = '⚡ Авто-решение';
            autoBtn.style.cssText = this.getButtonStyle('#2196F3');

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
                savedDiv.innerHTML = `💾 Сохранен ответ: ${this.formatAnswer(question.savedAnswer.answer)}`;
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
                button.innerHTML = '💾 Сохранение...';

                // Определяем правильность ответа, если возможно
                const isCorrect = this.checkAnswerCorrectness(question, currentAnswer);

                await this.saveAnswer(question.hash, currentAnswer, isCorrect, question.text);
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
                button.innerHTML = '💾 Сохранить ответ';
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

        getButtonStyle(color) {
            return `
                padding: 10px 20px;
                background: ${color};
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                transition: all 0.3s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            `;
        }

        async findAndApplyAnswer(question, button) {
            if (this.solvingInProgress.has(question.id)) {
                return;
            }

            this.solvingInProgress.add(question.id);
            button.disabled = true;
            button.innerHTML = '⏳ Ищу ответ...';
            button.style.opacity = '0.7';

            const methods = [];
            try {
                // Метод 1: Сохраненные ответы
                console.log('[Method 1] Проверяю сохраненные ответы...');
                if (question.savedAnswer) {
                    const saved = question.savedAnswer.answer;
                    if (this.applySavedAnswer(question, saved)) {
                        methods.push('Сохраненные ответы');
                        this.showNotification('✅ Применен сохраненный ответ!', 'success');
                        button.innerHTML = '✅ Ответ применен';
                        button.style.background = '#4CAF50';
                        this.solvingInProgress.delete(question.id);
                        return;
                    }
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
                console.log('[Method 4] Применяю эвристический анализ...');
                const heuristicAnswer = this.findAnswerByHeuristics(question);
                
                if (heuristicAnswer) {
                    methods.push('Эвристический анализ');
                    this.applyAnswer(question, heuristicAnswer);
                    this.showNotification('💡 Ответ определен по анализу (проверьте правильность)', 'info');
                    button.innerHTML = '💡 Ответ применен';
                    button.style.background = '#FF9800';
                    this.solvingInProgress.delete(question.id);
                    return;
                }
                console.log('[Method 4] Эвристический анализ не дал результата');

                // Метод 5: Онлайн поиск
                console.log('[Method 5] Открываю поиск в Google...');
                methods.push('Онлайн поиск');
                this.searchAnswerOnline(question);
                this.showNotification('🔍 Открываю поиск ответа в Google. Проверьте результаты и заполните вручную.', 'info');
                button.innerHTML = '🔍 Искать онлайн';
                button.style.background = '#9C27B0';

            } catch (e) {
                console.error('Error finding answer:', e);
                this.showNotification('❌ Ошибка при поиске ответа', 'error');
            } finally {
                this.solvingInProgress.delete(question.id);
                setTimeout(function resetButtonState() {
                    button.disabled = false;
                    button.innerHTML = '🔍 Найти ответ';
                    button.style.opacity = '1';
                    button.style.background = '#4CAF50';
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
                // Всегда загружаем статистику с сервера (синхронизация всегда включена)
                const response = await chrome.runtime.sendMessage({
                    action: 'syncWithServer',
                    questionHash: question.hash,
                    syncAction: 'getStatistics'
                });

                if (response && response.success && response.data && response.data.statistics) {
                    const serverStats = response.data.statistics;
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
                }
            } catch (e) {
                console.warn('Failed to load statistics from server:', e);
            }
        }

        mergeAnswers(localAnswers, serverAnswers) {
            const merged = { ...localAnswers };
            for (const [key, count] of Object.entries(serverAnswers)) {
                merged[key] = (merged[key] || 0) + count;
            }
            return merged;
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
            if (question.type === 'multichoice' || question.type === 'truefalse') {
                if (answer.input) {
                    answer.input.checked = true;
                    answer.input.dispatchEvent(new Event('change', { bubbles: true }));
                    answer.input.dispatchEvent(new Event('click', { bubbles: true }));
                    
                    // Также кликаем на label для совместимости
                    if (answer.label) {
                        answer.label.click();
                    }
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

            const notification = document.createElement('div');
            notification.className = 'quiz-solver-notification';
            notification.textContent = message;
            
            const colors = {
                success: '#4CAF50',
                error: '#f44336',
                warning: '#ff9800',
                info: '#2196F3'
            };
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                background: ${colors[type] || colors.info};
                color: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 100000;
                font-size: 15px;
                font-weight: 500;
                max-width: 400px;
                animation: slideIn 0.3s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
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
                
                // Сохраняем ответ
                await this.saveAnswer(question.hash, answer, isCorrect, question.text);
                
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
            indicator.innerHTML = '💾 Автосохранено';
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