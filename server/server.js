// Пример сервера для синхронизации между пользователями
// Требуется: npm install express cors body-parser

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
// PORT может быть установлен через переменную окружения (для Railway, Render и т.д.)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Хранилище данных (в продакшене используйте базу данных)
let statistics = {}; // { questionHash: { totalAttempts, correctAttempts, answers, errors } }
let savedAnswers = {}; // { questionHash: [answers] }

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Quiz Solver API is running' });
});

// Получить статистику для конкретного вопроса
app.get('/api/stats/:questionHash', (req, res) => {
    const { questionHash } = req.params;
    const stats = statistics[questionHash] || {
        totalAttempts: 0,
        correctAttempts: 0,
        answers: {},
        errors: []
    };
    res.json({ statistics: stats });
});

// Получить всю статистику
app.get('/api/stats', (req, res) => {
    res.json({ statistics: statistics });
});

// Отправить ответ (обновить статистику)
app.post('/api/submit', (req, res) => {
    const { questionHash, answer, isCorrect } = req.body;

    if (!questionHash || answer === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Инициализируем статистику, если её нет
    if (!statistics[questionHash]) {
        statistics[questionHash] = {
            totalAttempts: 0,
            correctAttempts: 0,
            answers: {},
            errors: []
        };
    }

    const stats = statistics[questionHash];
    stats.totalAttempts++;

    if (isCorrect === true) {
        stats.correctAttempts++;
    } else if (isCorrect === false) {
        stats.errors.push({
            answer: answer,
            timestamp: Date.now()
        });
    }

    // Обновляем популярность ответов
    const answerKey = JSON.stringify(answer);
    stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

    res.json({ 
        success: true, 
        statistics: stats 
    });
});

// Сохранить ответ
app.post('/api/save', (req, res) => {
    const { questionHash, answer, isCorrect } = req.body;

    if (!questionHash || !answer) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!savedAnswers[questionHash]) {
        savedAnswers[questionHash] = [];
    }

    savedAnswers[questionHash].push({
        answer: answer,
        isCorrect: isCorrect,
        timestamp: Date.now()
    });

    res.json({ success: true });
});

// Получить сохраненные ответы для вопроса
app.get('/api/answers/:questionHash', (req, res) => {
    const { questionHash } = req.params;
    const answers = savedAnswers[questionHash] || [];
    
    // Фильтруем только правильные ответы
    const correctAnswers = answers.filter(a => a.isCorrect === true);
    
    res.json({ answers: correctAnswers });
});

// Статистика сервера
app.get('/api/server/stats', (req, res) => {
    const totalQuestions = Object.keys(statistics).length;
    let totalAttempts = 0;
    let totalCorrect = 0;

    for (const stats of Object.values(statistics)) {
        totalAttempts += stats.totalAttempts || 0;
        totalCorrect += stats.correctAttempts || 0;
    }

    res.json({
        totalQuestions,
        totalAttempts,
        totalCorrect,
        accuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(2) : 0
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quiz Solver API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`External access: http://lms-solver.ddns.net:${PORT}/api/health`);
    console.log(`Listening on all interfaces (0.0.0.0:${PORT})`);
});

