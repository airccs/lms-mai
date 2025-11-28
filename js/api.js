// API Client для синхронизации между пользователями
class QuizSolverAPI {
    constructor() {
        // URL API сервера (можно настроить)
        this.apiUrl = 'https://api.example.com/quiz-solver'; // Замените на ваш API
        // Или используйте бесплатный сервис типа JSONBin.io
        // this.apiUrl = 'https://api.jsonbin.io/v3/b';
        this.apiKey = null; // Опциональный API ключ
        this.userId = this.getOrCreateUserId();
    }

    // Генерируем или получаем уникальный ID пользователя
    getOrCreateUserId() {
        let userId = localStorage.getItem('quiz_solver_user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('quiz_solver_user_id', userId);
        }
        return userId;
    }

    // Получить статистику для вопроса
    async getQuestionStatistics(questionHash) {
        try {
            const response = await fetch(`${this.apiUrl}/stats/${questionHash}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.statistics || null;
        } catch (error) {
            console.error('Error fetching statistics:', error);
            return null;
        }
    }

    // Получить все статистики
    async getAllStatistics() {
        try {
            const response = await fetch(`${this.apiUrl}/stats`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.statistics || {};
        } catch (error) {
            console.error('Error fetching all statistics:', error);
            return {};
        }
    }

    // Отправить статистику ответа
    async submitAnswer(questionHash, answer, isCorrect) {
        try {
            const payload = {
                questionHash: questionHash,
                answer: answer,
                isCorrect: isCorrect,
                userId: this.userId,
                timestamp: Date.now()
            };

            const response = await fetch(`${this.apiUrl}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.statistics || null;
        } catch (error) {
            console.error('Error submitting answer:', error);
            return null;
        }
    }

    // Получить сохраненные ответы для вопроса
    async getSavedAnswers(questionHash) {
        try {
            const response = await fetch(`${this.apiUrl}/answers/${questionHash}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.answers || [];
        } catch (error) {
            console.error('Error fetching saved answers:', error);
            return [];
        }
    }

    // Сохранить ответ
    async saveAnswer(questionHash, answer, isCorrect = null) {
        try {
            const payload = {
                questionHash: questionHash,
                answer: answer,
                isCorrect: isCorrect,
                userId: this.userId,
                timestamp: Date.now()
            };

            const response = await fetch(`${this.apiUrl}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error saving answer:', error);
            return null;
        }
    }

    // Проверить доступность API
    async checkConnection() {
        try {
            const response = await fetch(`${this.apiUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
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

