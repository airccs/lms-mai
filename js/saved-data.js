// В production режиме удаление отдельных записей отключено, но очистка всех данных разрешена
const IS_DEV_MODE = false; // Установите в true только для разработки

let allData = [];

function loadData() {
    const dataList = document.getElementById('data-list');
    dataList.innerHTML = '<div class="loading">Загрузка данных...</div>';

    try {
        console.log('[Saved Data] Запрос данных...');
        
        // Используем background script для получения данных
        chrome.runtime.sendMessage({ action: 'getAllSavedData' }, (response) => {
            console.log('[Saved Data] Получен ответ:', response);
            
            if (chrome.runtime.lastError) {
                console.error('[Saved Data] Ошибка runtime:', chrome.runtime.lastError);
                dataList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>Ошибка: ' + chrome.runtime.lastError.message + '</p></div>';
                return;
            }
            
            if (response && response.success && response.data) {
                console.log('[Saved Data] Данные получены:', response.data.length, 'записей');
                allData = response.data;
                displayData(allData);
                updateStats(allData);
            } else {
                console.warn('[Saved Data] Нет данных или неверный формат ответа:', response);
                allData = [];
                displayData(allData);
                updateStats(allData);
            }
        });
    } catch (error) {
        console.error('[Saved Data] Ошибка загрузки данных:', error);
        dataList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p>Ошибка загрузки данных. Проверьте консоль для деталей.</p><p style="font-size: 12px; color: #999;">' + error.message + '</p></div>';
    }
}

function displayData(data) {
    const dataList = document.getElementById('data-list');

    if (data.length === 0) {
        dataList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <h3>Нет сохраненных данных</h3>
                <p>Начните использовать расширение на тестах Moodle, чтобы сохранять вопросы и ответы</p>
            </div>
        `;
        return;
    }

    dataList.innerHTML = data.map((item, index) => {
        const date = item.timestamp ? new Date(item.timestamp).toLocaleString('ru-RU') : 'Неизвестно';
        const isCorrect = item.isCorrect;
        const correctClass = isCorrect === true ? 'correct' : (isCorrect === false ? 'incorrect' : 'unknown');
        const correctBadge = isCorrect === true ? '<span class="badge badge-correct">Правильно</span>' : 
                            (isCorrect === false ? '<span class="badge badge-incorrect">Неправильно</span>' : 
                            '<span class="badge badge-unknown">Неизвестно</span>');

        const answerText = formatAnswer(item.answer);
        const stats = item.statistics || {};
        const accuracy = stats.totalAttempts > 0 ? 
            Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : null;

        // Добавляем изображение если есть
        console.log(`[displayData] Вопрос #${index + 1}, questionImage:`, item.questionImage ? 'есть (' + item.questionImage.length + ' байт)' : 'нет');
        const imageHtml = item.questionImage ? 
            `<div class="image-container">
                <img src="${item.questionImage}" alt="Изображение вопроса" class="question-image" style="max-width: 100% !important; max-height: 200px !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important; margin: 10px auto !important;">
            </div>` : '';

        return `
            <div class="data-item" data-hash="${escapeHtml(item.hash)}">
                <div class="data-item-header">
                    <div>
                        <div class="data-item-title">Вопрос #${index + 1}</div>
                        <div class="data-item-meta">
                            <span>📅 ${date}</span>
                            <span>🔑 Hash: ${item.hash}</span>
                            ${accuracy !== null ? `<span>📊 Точность: ${accuracy}%</span>` : ''}
                            ${stats.totalAttempts ? `<span>👥 Попыток: ${stats.totalAttempts}</span>` : ''}
                        </div>
                    </div>
                    ${correctBadge}
                </div>
                ${imageHtml}
                <div class="data-item-question">
                    <strong>Вопрос:</strong><br>
                    ${escapeHtml(item.questionText)}
                </div>
                <div class="data-item-answer ${correctClass}">
                    <strong>Ответ:</strong><br>
                    ${escapeHtml(answerText)}
                </div>
                ${IS_DEV_MODE ? `<button class="delete-btn" data-action="delete" data-hash="${escapeHtml(item.hash)}">Удалить</button>` : ''}
            </div>
        `;
    }).join('');
    
    // Добавляем обработчики событий после вставки HTML
    dataList.querySelectorAll('.delete-btn[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hash = e.target.getAttribute('data-hash');
            if (hash) {
                deleteItem(hash);
            }
        });
    });
}

function formatAnswer(answer) {
    if (typeof answer === 'string') return answer;
    if (Array.isArray(answer)) return answer.join(', ');
    if (typeof answer === 'object') {
        if (answer.text) return answer.text;
        if (answer.value) return answer.value;
        return JSON.stringify(answer);
    }
    return String(answer);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateStats(data) {
    document.getElementById('total-questions').textContent = data.length;
    document.getElementById('total-answers').textContent = data.length;
    
    const correctCount = data.filter(item => item.isCorrect === true).length;
    document.getElementById('correct-answers').textContent = correctCount;

    // Вычисляем примерный размер данных
    const dataSize = JSON.stringify(data).length;
    const sizeKB = (dataSize / 1024).toFixed(2);
    document.getElementById('storage-size').textContent = `${sizeKB} KB`;
}

function deleteItem(hash) {
    if (!confirm('Удалить этот вопрос и ответ?')) {
        return;
    }

    chrome.runtime.sendMessage({ 
        action: 'deleteSavedAnswer', 
        hash: hash 
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error deleting item:', chrome.runtime.lastError);
            alert('Ошибка при удалении: ' + chrome.runtime.lastError.message);
            return;
        }
        
        if (response && response.success) {
            loadData();
        } else {
            alert('Ошибка при удалении');
        }
    });
}

function clearAllData() {
    if (!confirm('⚠️ ВНИМАНИЕ! Это удалит ВСЕ сохраненные вопросы и ответы. Продолжить?')) {
        return;
    }

    if (!confirm('Вы уверены? Это действие нельзя отменить!')) {
        return;
    }

    chrome.runtime.sendMessage({ action: 'clearAllSavedAnswers' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error clearing data:', chrome.runtime.lastError);
            alert('Ошибка при удалении данных: ' + chrome.runtime.lastError.message);
            return;
        }
        
        if (response && response.success) {
            console.log(`[Saved Data] Очищено ${response.cleared || 0} записей`);
            // Небольшая задержка перед перезагрузкой данных, чтобы убедиться, что удаление завершено
            setTimeout(() => {
                loadData();
            }, 100);
            alert(`Все данные удалены (${response.cleared || 0} записей)`);
        } else {
            alert('Ошибка при удалении данных: ' + (response?.error || 'Unknown error'));
        }
    });
}

function exportData() {
    const dataStr = JSON.stringify(allData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lms-mai-saved-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function startAutoScan() {
    const btn = document.getElementById('auto-scan-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Запуск...';

    try {
        // Открываем новую вкладку для автосканирования
        const scanUrl = chrome.runtime.getURL('html/auto-scan-react.html');
        window.open(scanUrl, '_blank');
        
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = '🤖 Автосканирование тестов';
        }, 1000);
    } catch (error) {
        console.error('Error starting auto scan:', error);
        alert('Ошибка запуска автосканирования: ' + error.message);
        btn.disabled = false;
        btn.textContent = '🤖 Автосканирование тестов';
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Поиск
    const searchBox = document.getElementById('search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query === '') {
                displayData(allData);
                return;
            }

            const filtered = allData.filter(item => {
                const questionText = (item.questionText || '').toLowerCase();
                const answerText = formatAnswer(item.answer).toLowerCase();
                return questionText.includes(query) || answerText.includes(query);
            });

            displayData(filtered);
        });
    }

    // Кнопка обновления
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadData();
        });
    }

    // Кнопка экспорта
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportData();
        });
    }

    // Кнопка очистки всех данных
    // Кнопка очистки данных (только в dev режиме)
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) {
        // Кнопка очистки доступна всегда (очищает только локальные данные)
        clearAllBtn.addEventListener('click', () => {
            clearAllData();
        });
    }

    // Кнопка автосканирования
    const autoScanBtn = document.getElementById('auto-scan-btn');
    if (autoScanBtn) {
        autoScanBtn.addEventListener('click', () => {
            startAutoScan();
        });
    }

    // Загружаем данные при загрузке страницы
    loadData();
});

