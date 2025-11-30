let isScanning = false;
let scannedCount = 0;
let foundCount = 0;
let savedCount = 0;
let openTabsCount = 0; // Счетчик открытых вкладок
const MAX_CONCURRENT_TABS = 2; // Максимум одновременно открытых вкладок (уменьшено с 3 до 2)
const MAX_RETRY_ATTEMPTS = 3; // Максимум попыток повтора при ошибке

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', startScanning);
    document.getElementById('stop-btn').addEventListener('click', stopScanning);
    
    addLog('Готов к запуску', 'info');
});

function addLog(message, type = 'info') {
    const logEl = document.getElementById('log');
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    const timestamp = new Date().toLocaleTimeString('ru-RU');
    item.textContent = `[${timestamp}] ${message}`;
    logEl.appendChild(item);
    logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(text, icon = '⏳') {
    const statusTextEl = document.getElementById('status-text');
    if (statusTextEl) {
        statusTextEl.textContent = text;
    }
    const iconEl = document.querySelector('.status-icon');
    if (iconEl) {
        iconEl.textContent = icon;
    }
}

function updateProgress(percent) {
    document.getElementById('progress-fill').style.width = `${percent}%`;
}

function updateStats() {
    document.getElementById('scanned-count').textContent = scannedCount;
    document.getElementById('found-count').textContent = foundCount;
    document.getElementById('saved-count').textContent = savedCount;
}

async function startScanning() {
    if (isScanning) return;
    
    isScanning = true;
    scannedCount = 0;
    foundCount = 0;
    savedCount = 0;
    
    document.getElementById('start-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    
    addLog('🚀 Начинаю автосканирование...', 'info');
    updateStatus('Ищу тесты...', '🔍');
    
    try {
        const tabs = await chrome.tabs.query({ url: '*://lms.mai.ru/*' });
        
        if (tabs.length === 0) {
            addLog('❌ Не найдено открытых вкладок lms.mai.ru', 'error');
            addLog('💡 Откройте https://lms.mai.ru/ или страницу с вашими курсами', 'warning');
            stopScanning();
            return;
        }
        
        addLog(`✅ Найдено ${tabs.length} вкладок Moodle`, 'success');
        addLog('🔍 Ищу курсы и тесты...', 'info');
        addLog('⏳ Это может занять несколько минут...', 'info');
        updateStatus('Поиск курсов и тестов...', '🔍');
        
        const reviewLinks = await findAllReviewLinks(tabs);
        
        if (reviewLinks.length === 0) {
            addLog('❌ Не найдено результатов тестов', 'error');
            addLog('💡 Убедитесь что вы прошли хотя бы один тест', 'warning');
            stopScanning();
            return;
        }
        
        addLog(`✅ Найдено ${reviewLinks.length} результатов тестов`, 'success');
        
        for (let i = 0; i < reviewLinks.length; i++) {
            if (!isScanning) {
                addLog('⏹️ Сканирование остановлено пользователем', 'warning');
                break;
            }
            
            const link = reviewLinks[i];
            scannedCount++;
            updateProgress((i + 1) / reviewLinks.length * 100);
            updateStats();
            
            addLog(`📄 Сканирование ${i + 1}/${reviewLinks.length}: ${link.substring(0, 50)}...`, 'info');
            updateStatus(`Сканирование ${i + 1} из ${reviewLinks.length}...`, '⏳');
            
            try {
                const result = await scanReviewPage(link);
                foundCount += result.questions;
                savedCount += result.saved;
                updateStats();
                
                if (result.saved > 0) {
                    addLog(`✅ На странице: ${result.questions} вопросов, сохранено: ${result.saved}. Всего найдено: ${foundCount}, сохранено: ${savedCount}`, 'success');
                } else {
                    addLog(`✅ На странице: ${result.questions} вопросов (уже сохранены ранее). Всего найдено: ${foundCount}`, 'info');
                }
            } catch (error) {
                addLog(`⚠️ Пропущено: ${error.message}`, 'warning');
            }
            
            await sleep(1500); // Увеличена задержка между сканированиями
        }
        
        if (isScanning) {
            addLog('🎉 Автосканирование завершено!', 'success');
            
            // Получаем реальное количество сохраненных вопросов из хранилища
            const finalData = await chrome.storage.local.get(null);
            const finalCount = Object.keys(finalData).filter(key => key.startsWith('answer_')).length;
            
            // Обновляем счетчики реальными данными
            savedCount = finalCount;
            updateStats();
            
            addLog(`📊 Итого: просканировано ${scannedCount} тестов, найдено ${foundCount} вопросов на страницах`, 'success');
            addLog(`💾 В хранилище: ${finalCount} уникальных сохраненных вопросов`, 'success');
            updateStatus('Сканирование завершено', '✅');
        }
        
    } catch (error) {
        addLog(`❌ Критическая ошибка: ${error.message}`, 'error');
        console.error('Auto scan error:', error);
    } finally {
        stopScanning();
    }
}

async function findAllReviewLinks(tabs) {
    const allLinks = new Set();
    
    for (const tab of tabs) {
        try {
            const [urlResult] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.location.href
            });
            
            const currentUrl = urlResult?.result || '';
            addLog(`🔍 Проверяю: ${currentUrl}`, 'info');
            
            // Если это главная страница или список курсов, ищем курсы
            if (currentUrl.includes('lms.mai.ru') && 
                (currentUrl === 'https://lms.mai.ru/' || 
                 currentUrl.includes('lms.mai.ru/my') ||
                 currentUrl.includes('lms.mai.ru/?redirect=0'))) {
                
                addLog('🎓 Обнаружена главная страница, ищу курсы...', 'info');
                const courseLinks = await findCourses(tab.id);
                
                if (courseLinks.length > 0) {
                    addLog(`✅ Найдено ${courseLinks.length} курсов`, 'success');
                    
                    for (let i = 0; i < courseLinks.length; i++) {
                        if (!isScanning) break;
                        const courseUrl = courseLinks[i];
                        const courseName = await getCourseName(courseUrl);
                        addLog(`📚 [${i + 1}/${courseLinks.length}] Открываю курс: ${courseName}`, 'info');
                        const testsFromCourse = await findTestsInCourse(courseUrl);
                        testsFromCourse.forEach(link => allLinks.add(link));
                    }
                }
            }
            
            // Ищем прямые ссылки на результаты
            const directLinks = await findDirectReviewLinks(tab.id);
            directLinks.forEach(link => allLinks.add(link));
            
            // Ищем ссылки на тесты
            const quizLinks = await findQuizLinks(tab.id);
            for (let i = 0; i < quizLinks.length; i++) {
                if (!isScanning) break;
                const quizUrl = quizLinks[i];
                const quizName = await getQuizName(quizUrl);
                addLog(`📝 [${i + 1}/${quizLinks.length}] Проверяю тест: ${quizName}`, 'info');
                const reviewLinks = await findReviewLinksFromQuiz(quizUrl, false); // Передаем флаг для отключения дублирования логов
                reviewLinks.forEach(link => allLinks.add(link));
            }
            
        } catch (error) {
            console.error('Error in tab:', error);
        }
    }
    
    return Array.from(allLinks);
}

async function findCourses(tabId) {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const courses = [];
                const links = document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/"]');
                links.forEach(a => {
                    if (a.href && a.href.includes('/course/') && !courses.includes(a.href)) {
                        courses.push(a.href);
                    }
                });
                return courses;
            }
        });
        return result?.result || [];
    } catch (error) {
        return [];
    }
}

async function getCourseName(url) {
    try {
        // Пытаемся извлечь название из URL
        const urlObj = new URL(url);
        const courseId = urlObj.searchParams.get('id');
        
        // Возвращаем краткую информацию
        return courseId ? `ID ${courseId}` : url.split('/').pop().substring(0, 30);
    } catch (error) {
        return url.substring(0, 40) + '...';
    }
}

async function getQuizName(url) {
    try {
        const urlObj = new URL(url);
        const quizId = urlObj.searchParams.get('id');
        
        return quizId ? `Тест ID ${quizId}` : url.substring(url.lastIndexOf('/') + 1, url.length).substring(0, 30);
    } catch (error) {
        return url.substring(0, 40) + '...';
    }
}

async function findTestsInCourse(courseUrl) {
    // Ждем, пока освободится слот для новой вкладки
    while (openTabsCount >= MAX_CONCURRENT_TABS) {
        await sleep(1000);
    }
    
    return new Promise((resolve) => {
        // Добавляем параметр lang=ru к URL для сохранения языка
        const urlWithLang = courseUrl.includes('?') ? `${courseUrl}&lang=ru` : `${courseUrl}?lang=ru`;
        
        openTabsCount++;
        chrome.tabs.create({ url: urlWithLang, active: false }, async (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.error('Error creating tab:', chrome.runtime.lastError);
                addLog('⚠️ Ошибка открытия курса, пропускаю...', 'warning');
                openTabsCount--;
                resolve([]);
                return;
            }
            
            try {
                await waitForTabLoad(tab.id);
                await sleep(3000); // Увеличена задержка
                
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const tests = [];
                        const links = document.querySelectorAll('a[href*="/mod/quiz/view.php"]');
                        links.forEach(a => {
                            if (a.href && !tests.includes(a.href)) {
                                tests.push(a.href);
                            }
                        });
                        return tests;
                    }
                });
                
                await sleep(500); // Пауза перед закрытием
                
                chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error closing tab:', chrome.runtime.lastError);
                    }
                    openTabsCount--;
                });
                
                const quizLinks = result?.result || [];
                if (quizLinks.length > 0) {
                    addLog(`  📝 Найдено ${quizLinks.length} тестов в курсе`, 'success');
                }
                
                const reviewLinks = [];
                for (const quizUrl of quizLinks) {
                    if (!isScanning) break;
                    await sleep(1000); // Пауза между запросами к тестам
                    const reviews = await findReviewLinksFromQuiz(quizUrl);
                    reviewLinks.push(...reviews);
                }
                
                resolve(reviewLinks);
            } catch (error) {
                console.error('Error finding tests in course:', error);
                try {
                    chrome.tabs.remove(tab.id);
                } catch (e) {
                    // Ignore
                }
                openTabsCount--;
                resolve([]);
            }
        });
    });
}

async function findDirectReviewLinks(tabId) {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const links = [];
                document.querySelectorAll('a[href*="/mod/quiz/review.php"]').forEach(a => {
                    if (a.href && !links.includes(a.href)) links.push(a.href);
                });
                return links;
            }
        });
        return result?.result || [];
    } catch (error) {
        return [];
    }
}

async function findQuizLinks(tabId) {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const links = [];
                document.querySelectorAll('a[href*="/mod/quiz/view.php"]').forEach(a => {
                    if (a.href && !links.includes(a.href)) links.push(a.href);
                });
                return links;
            }
        });
        return result?.result || [];
    } catch (error) {
        return [];
    }
}

async function findReviewLinksFromQuiz(quizUrl, shouldLog = true) {
    // Ждем, пока освободится слот для новой вкладки
    while (openTabsCount >= MAX_CONCURRENT_TABS) {
        await sleep(1000);
    }
    
    return new Promise((resolve) => {
        // Добавляем параметр lang=ru к URL для сохранения языка
        const urlWithLang = quizUrl.includes('?') ? `${quizUrl}&lang=ru` : `${quizUrl}?lang=ru`;
        
        openTabsCount++;
        chrome.tabs.create({ url: urlWithLang, active: false }, async (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.error('Error creating tab for quiz:', chrome.runtime.lastError);
                openTabsCount--;
                resolve([]);
                return;
            }
            
            try {
                await waitForTabLoad(tab.id);
                await sleep(2000); // Увеличена задержка
                
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const links = [];
                        
                        // Проверяем, есть ли таблица с результатами попыток
                        const attemptTable = document.querySelector(
                            'table.quizattemptsummary, ' +
                            'table.quizreviewsummary, ' +
                            '.quizattempt, ' +
                            '#attempts'
                        );
                        
                        // Проверяем, есть ли кнопка "Начать тестирование" (признак непройденного теста)
                        const startButton = document.querySelector(
                            'button[type="submit"]:not([name="cancel"]), ' +
                            'input[type="submit"]:not([name="cancel"]), ' +
                            'form[action*="/attempt.php"]'
                        );
                        
                        // Если есть только кнопка "Начать" и нет таблицы с попытками - тест не пройден
                        if (startButton && !attemptTable) {
                            return { links: [], isPassed: false };
                        }
                        
                        // Если есть таблица с попытками, ищем ссылки на результаты
                        if (attemptTable) {
                            const reviewAnchors = attemptTable.querySelectorAll('a[href*="/mod/quiz/review.php"]');
                            reviewAnchors.forEach(a => {
                                if (a.href && a.href.includes('attempt=') && !links.includes(a.href)) {
                                    links.push(a.href);
                                }
                            });
                        }
                        
                        // Также ищем ссылки на всей странице (для других вариантов интерфейса)
                        if (links.length === 0) {
                            const allReviewLinks = document.querySelectorAll('a[href*="/mod/quiz/review.php"]');
                            allReviewLinks.forEach(a => {
                                // Проверяем, что это ссылка "Просмотр" в таблице попыток
                                const linkText = a.textContent.trim().toLowerCase();
                                if (a.href && 
                                    a.href.includes('attempt=') && 
                                    (linkText.includes('просмотр') || linkText.includes('review')) &&
                                    !links.includes(a.href)) {
                                    links.push(a.href);
                                }
                            });
                        }
                        
                        return { 
                            links: links, 
                            isPassed: links.length > 0 
                        };
                    }
                });
                
                await sleep(500); // Пауза перед закрытием
                
                chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error closing quiz tab:', chrome.runtime.lastError);
                    }
                    openTabsCount--;
                });
                
                const resultData = result?.result || { links: [], isPassed: false };
                
                if (shouldLog) {
                    if (!resultData.isPassed) {
                        addLog('  ℹ️ Тест не пройден (есть кнопка "Начать тестирование")', 'info');
                    } else if (resultData.links.length === 0) {
                        addLog('  ℹ️ Нет доступных результатов', 'info');
                    } else {
                        addLog(`  ✅ Найдено ${resultData.links.length} попыток`, 'success');
                    }
                }
                
                resolve(resultData.links);
            } catch (error) {
                console.error('Error finding review links from quiz:', error);
                try {
                    chrome.tabs.remove(tab.id);
                } catch (e) {
                    // Ignore
                }
                openTabsCount--;
                resolve([]);
            }
        });
    });
}

async function scanReviewPage(url) {
    // Ждем, пока освободится слот для новой вкладки
    while (openTabsCount >= MAX_CONCURRENT_TABS) {
        await sleep(1000);
    }
    
    // Добавляем параметр lang=ru к URL для сохранения языка
    const urlWithLang = url.includes('?') ? `${url}&lang=ru` : `${url}?lang=ru`;
    
    openTabsCount++;
    
    try {
        // Получаем количество сохраненных вопросов ДО сканирования
        const beforeData = await chrome.storage.local.get(null);
        const beforeCount = Object.keys(beforeData).filter(key => key.startsWith('answer_')).length;
        
        const tab = await createTabWithRetry(urlWithLang);
        
        try {
            await waitForTabLoad(tab.id);
            await sleep(5000); // Увеличена задержка для обработки content.js
            
            // Получаем количество вопросов напрямую со страницы
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Считаем вопросы на странице
                    const questions = document.querySelectorAll('.que');
                    
                    // Проверяем, это страница результатов или страница теста
                    const isReviewPage = document.querySelector('.reviewoptions, #page-mod-quiz-review');
                    
                    return {
                        count: questions.length,
                        isValid: isReviewPage !== null && questions.length > 0
                    };
                }
            });
            
            const pageData = result?.result || { count: 0, isValid: false };
            
            await sleep(2000); // Дополнительная пауза для сохранения данных content.js
            
            // Получаем количество сохраненных вопросов ПОСЛЕ сканирования
            const afterData = await chrome.storage.local.get(null);
            const afterCount = Object.keys(afterData).filter(key => key.startsWith('answer_')).length;
            const savedCount = afterCount - beforeCount;
            
            await sleep(500); // Пауза перед закрытием
            
            chrome.tabs.remove(tab.id, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error closing scan tab:', chrome.runtime.lastError);
                }
                openTabsCount--;
            });
            
            if (!pageData.isValid || pageData.count === 0) {
                throw new Error('Тест не пройден или страница недоступна');
            }
            
            // Возвращаем реальное количество сохраненных вопросов
            return { 
                questions: pageData.count, 
                saved: Math.max(savedCount, 0) // Не может быть отрицательным
            };
        } catch (error) {
            console.error('Error scanning review page:', error);
            try {
                chrome.tabs.remove(tab.id);
            } catch (e) {
                // Ignore
            }
            openTabsCount--;
            throw error;
        }
    } catch (error) {
        console.error('Error creating scan tab:', error);
        openTabsCount--;
        throw new Error('Failed to create tab after retries');
    }
}

function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

async function createTabWithRetry(url, maxAttempts = MAX_RETRY_ATTEMPTS) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const tab = await new Promise((resolve, reject) => {
                chrome.tabs.create({ url, active: false }, (tab) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (!tab) {
                        reject(new Error('Tab creation failed'));
                    } else {
                        resolve(tab);
                    }
                });
            });
            return tab;
        } catch (error) {
            if (attempt < maxAttempts) {
                console.log(`Попытка ${attempt} не удалась, повторяю через ${attempt * 1000}мс...`);
                await sleep(attempt * 1000); // Экспоненциальная задержка
            } else {
                throw error;
            }
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stopScanning() {
    isScanning = false;
    openTabsCount = 0; // Сбрасываем счетчик
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
}
