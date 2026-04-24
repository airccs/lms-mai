// API Client для синхронизации между пользователями
// Использует chrome.runtime.sendMessage для связи с background service worker,
// который хранит реальный URL сервера в chrome.storage.local.
class QuizSolverAPI {
    constructor() {
        this.userId = this.getOrCreateUserId();
    }

    // Генерируем или получаем уникальный ID пользователя
    getOrCreateUserId() {
        try {
            let userId = localStorage.getItem('quiz_solver_user_id');
            if (!userId) {
                userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('quiz_solver_user_id', userId);
            }
            return userId;
        } catch (e) {
            return 'user_' + Date.now();
        }
    }

    // Отправить сообщение в background service worker
    async _sendMessage(payload) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(payload, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    // Получить статистику для вопроса
    async getQuestionStatistics(questionHash) {
        try {
            const response = await this._sendMessage({
                action: 'syncWithServer',
                syncAction: 'getStatistics',
                questionHash
            });
            if (response && response.success) {
                return response.data?.statistics || null;
            }
            return null;
        } catch (error) {
            console.error('Error fetching statistics:', error);
            return null;
        }
    }

    // Получить все статистики
    async getAllStatistics() {
        try {
            const response = await this._sendMessage({
                action: 'syncWithServer',
                syncAction: 'getAllStatistics'
            });
            if (response && response.success) {
                return response.data?.statistics || {};
            }
            return {};
        } catch (error) {
            console.error('Error fetching all statistics:', error);
            return {};
        }
    }

    // Отправить статистику ответа
    async submitAnswer(questionHash, answer, isCorrect) {
        try {
            const response = await this._sendMessage({
                action: 'syncWithServer',
                syncAction: 'submitAnswer',
                questionHash,
                answer,
                isCorrect
            });
            if (response && response.success) {
                return response.data?.statistics || null;
            }
            return null;
        } catch (error) {
            console.error('Error submitting answer:', error);
            return null;
        }
    }

    // Получить сохраненные ответы для вопроса
    async getSavedAnswers(questionHash) {
        try {
            const response = await this._sendMessage({
                action: 'syncWithServer',
                syncAction: 'getSavedAnswers',
                questionHash
            });
            if (response && response.success) {
                return response.answers || [];
            }
            return [];
        } catch (error) {
            console.error('Error fetching saved answers:', error);
            return [];
        }
    }

    // Сохранить ответ
    async saveAnswer(questionHash, answer, isCorrect = null, questionText = null, questionImage = null) {
        try {
            const response = await this._sendMessage({
                action: 'syncWithServer',
                syncAction: 'saveAnswer',
                questionHash,
                answer,
                isCorrect,
                questionText,
                questionImage
            });
            return response || null;
        } catch (error) {
            console.error('Error saving answer:', error);
            return null;
        }
    }

    // Проверить доступность API
    async checkConnection() {
        try {
            const settings = await this._sendMessage({ action: 'getApiSettings' });
            const apiUrl = settings?.settings?.apiUrl;
            if (!apiUrl) return false;

            const response = await fetch(`${apiUrl}/api/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Экспорт для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuizSolverAPI;
}
