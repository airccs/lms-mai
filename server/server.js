// API Server for LMS MAI Quiz Solver
// Compatible with Oracle Free Tier deployment

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Увеличиваем лимит для изображений

// Логирование всех запросов для диагностики
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Initialize database
const dbPath = join(__dirname, 'quiz_data.db');
const db = new Database(dbPath);

// Initialize database schema
function initDatabase() {
  // Statistics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS statistics (
      question_hash TEXT PRIMARY KEY,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      answers_json TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Saved answers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_hash TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      is_correct INTEGER,
      question_text TEXT,
      question_image TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_answers_hash ON saved_answers(question_hash);
    CREATE INDEX IF NOT EXISTS idx_saved_answers_timestamp ON saved_answers(timestamp DESC);
  `);

  console.log('Database initialized successfully');
}

// Initialize database on startup
initDatabase();

// Helper function to parse JSON safely
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get statistics for a question
app.get('/api/stats/:questionHash', (req, res) => {
  try {
    const { questionHash } = req.params;
    
    if (!questionHash) {
      return res.status(400).json({ error: 'Question hash required' });
    }

    const row = db.prepare('SELECT * FROM statistics WHERE question_hash = ?').get(questionHash);
    
    if (!row) {
      return res.json({ statistics: null });
    }

    const statistics = {
      totalAttempts: row.total_attempts || 0,
      correctAttempts: row.correct_attempts || 0,
      answers: safeJsonParse(row.answers_json, {}),
    };

    res.json({ statistics });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all statistics
app.get('/api/stats', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM statistics').all();
    
    const statistics = {};
    for (const row of rows) {
      statistics[row.question_hash] = {
        totalAttempts: row.total_attempts || 0,
        correctAttempts: row.correct_attempts || 0,
        answers: safeJsonParse(row.answers_json, {}),
      };
    }
    
    res.json({ statistics });
  } catch (error) {
    console.error('Error getting all statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit answer statistics
app.post('/api/submit', (req, res) => {
  try {
    const { questionHash, answer, isCorrect } = req.body;

    if (!questionHash) {
      return res.status(400).json({ error: 'Question hash required' });
    }

    // Get existing stats
    let row = db.prepare('SELECT * FROM statistics WHERE question_hash = ?').get(questionHash);
    
    let stats = row ? {
      totalAttempts: row.total_attempts || 0,
      correctAttempts: row.correct_attempts || 0,
      answers: safeJsonParse(row.answers_json, {}),
    } : {
      totalAttempts: 0,
      correctAttempts: 0,
      answers: {},
    };

    // Update stats
    stats.totalAttempts = (stats.totalAttempts || 0) + 1;
    if (isCorrect) {
      stats.correctAttempts = (stats.correctAttempts || 0) + 1;
    }

    const answerKey = JSON.stringify(answer);
    stats.answers = stats.answers || {};
    stats.answers[answerKey] = (stats.answers[answerKey] || 0) + 1;

    // Save to database
    const stmt = db.prepare(`
      INSERT INTO statistics (question_hash, total_attempts, correct_attempts, answers_json, updated_at)
      VALUES (?, ?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(question_hash) DO UPDATE SET
        total_attempts = excluded.total_attempts,
        correct_attempts = excluded.correct_attempts,
        answers_json = excluded.answers_json,
        updated_at = excluded.updated_at
    `);
    
    stmt.run(questionHash, stats.totalAttempts, stats.correctAttempts, JSON.stringify(stats.answers));

    res.json({ statistics: stats });
  } catch (error) {
    console.error('Error submitting statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save answer
app.post('/api/save', (req, res) => {
  try {
    const { questionHash, answer, isCorrect, questionText, questionImage, timestamp } = req.body;

    if (!questionHash) {
      return res.status(400).json({ error: 'Question hash required' });
    }

    // Логируем размер данных для диагностики
    const imageSize = questionImage ? questionImage.length : 0;
    const textSize = questionText ? questionText.length : 0;
    console.log(`[POST /api/save] questionHash: ${questionHash}, imageSize: ${imageSize}, textSize: ${textSize}`);

    // Валидация и нормализация данных
    let processedImage = questionImage;
    if (processedImage && typeof processedImage === 'string') {
      // Ограничиваем размер изображения (максимум 500KB в base64 для SQLite)
      if (processedImage.length > 512 * 1024) {
        console.warn(`[POST /api/save] Изображение слишком большое (${processedImage.length} байт), обрезаю до 500KB`);
        processedImage = processedImage.substring(0, 512 * 1024);
      }
    } else {
      processedImage = null;
    }

    // Нормализуем timestamp (конвертируем из миллисекунд в секунды, если нужно)
    let normalizedTimestamp = timestamp;
    if (normalizedTimestamp) {
      // Если timestamp больше 2147483647 (максимальное значение для 32-bit integer), значит это миллисекунды
      if (normalizedTimestamp > 2147483647) {
        normalizedTimestamp = Math.floor(normalizedTimestamp / 1000);
      }
    } else {
      normalizedTimestamp = Math.floor(Date.now() / 1000);
    }

    // Нормализуем isCorrect - SQLite ожидает INTEGER (0, 1) или NULL
    let normalizedIsCorrect = null;
    if (isCorrect !== null && isCorrect !== undefined) {
      // Конвертируем в число: true -> 1, false -> 0
      normalizedIsCorrect = isCorrect === true || isCorrect === 1 || isCorrect === '1' ? 1 : 0;
    }

    // Сериализуем answer в JSON
    let answerJson;
    try {
      answerJson = JSON.stringify(answer);
    } catch (e) {
      console.error('[POST /api/save] Ошибка сериализации answer:', e);
      return res.status(400).json({ error: 'Invalid answer format' });
    }

    // Ограничиваем размер текста вопроса (максимум 100KB)
    let processedText = questionText;
    if (processedText && typeof processedText === 'string' && processedText.length > 100 * 1024) {
      console.warn(`[POST /api/save] Текст вопроса слишком большой (${processedText.length} байт), обрезаю`);
      processedText = processedText.substring(0, 100 * 1024);
    } else if (processedText && typeof processedText !== 'string') {
      // Если это не строка, конвертируем в строку
      processedText = String(processedText);
    }

    // Check if answer already exists
    let existingAnswer;
    try {
      existingAnswer = db.prepare(`
        SELECT * FROM saved_answers 
        WHERE question_hash = ? AND answer_json = ?
      `).get(questionHash, answerJson);
    } catch (e) {
      console.error('[POST /api/save] Ошибка при поиске существующего ответа:', e);
      throw e;
    }

    if (existingAnswer) {
      // Update existing answer if new one is more complete
      try {
        const stmt = db.prepare(`
          UPDATE saved_answers SET
            is_correct = COALESCE(?, is_correct),
            question_text = COALESCE(?, question_text),
            question_image = COALESCE(?, question_image),
            timestamp = COALESCE(?, timestamp)
          WHERE id = ?
        `);
        
        stmt.run(
          normalizedIsCorrect !== null ? normalizedIsCorrect : (existingAnswer.is_correct !== null ? existingAnswer.is_correct : null),
          processedText || existingAnswer.question_text || null,
          processedImage || existingAnswer.question_image || null,
          normalizedTimestamp || existingAnswer.timestamp || null,
          existingAnswer.id
        );
      } catch (e) {
        console.error('[POST /api/save] Ошибка при обновлении ответа:', e);
        throw e;
      }
    } else {
      // Insert new answer
      try {
        const stmt = db.prepare(`
          INSERT INTO saved_answers 
          (question_hash, answer_json, is_correct, question_text, question_image, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          questionHash,
          answerJson,
          normalizedIsCorrect, // Используем нормализованное значение
          processedText || null,
          processedImage || null,
          normalizedTimestamp
        );
      } catch (e) {
        console.error('[POST /api/save] Ошибка при вставке ответа:', e);
        throw e;
      }
    }

    // Get all answers for this question
    let allAnswers;
    try {
      allAnswers = db.prepare(`
        SELECT * FROM saved_answers 
        WHERE question_hash = ?
        ORDER BY is_correct DESC, timestamp DESC
      `).all(questionHash);
    } catch (e) {
      console.error('[POST /api/save] Ошибка при получении ответов:', e);
      throw e;
    }

    const answers = allAnswers.map(row => ({
      answer: safeJsonParse(row.answer_json),
      isCorrect: row.is_correct,
      questionText: row.question_text,
      questionImage: row.question_image,
      timestamp: row.timestamp * 1000, // Convert to milliseconds
    }));

    res.json({ success: true, answers });
  } catch (error) {
    console.error('[POST /api/save] Error saving answer:', error);
    console.error('[POST /api/save] Error stack:', error.stack);
    console.error('[POST /api/save] Request body:', JSON.stringify(req.body).substring(0, 500));
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get saved answers for a question
app.get('/api/answers/:questionHash', (req, res) => {
  try {
    const { questionHash } = req.params;
    
    if (!questionHash) {
      return res.status(400).json({ error: 'Question hash required' });
    }

    const rows = db.prepare(`
      SELECT * FROM saved_answers 
      WHERE question_hash = ?
      ORDER BY is_correct DESC, timestamp DESC
    `).all(questionHash);

    const answers = rows.map(row => ({
      answer: safeJsonParse(row.answer_json),
      isCorrect: row.is_correct,
      questionText: row.question_text,
      questionImage: row.question_image,
      timestamp: row.timestamp * 1000, // Convert to milliseconds
    }));

    res.json({ answers });
  } catch (error) {
    console.error('Error getting answers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear database endpoint (⚠️ USE WITH CAUTION)
app.post('/api/clear', (req, res) => {
  try {
    console.log('[POST /api/clear] Очистка базы данных...');
    
    // Очищаем таблицы
    db.exec('DELETE FROM saved_answers');
    db.exec('DELETE FROM statistics');
    
    // Оптимизируем базу данных
    db.exec('VACUUM');
    
    console.log('[POST /api/clear] База данных очищена');
    res.json({ 
      success: true, 
      message: 'Database cleared successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[POST /api/clear] Ошибка при очистке базы данных:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get database stats
app.get('/api/db/stats', (req, res) => {
  try {
    const savedAnswersCount = db.prepare('SELECT COUNT(*) as count FROM saved_answers').get().count;
    const statisticsCount = db.prepare('SELECT COUNT(*) as count FROM statistics').get().count;
    
    res.json({
      savedAnswers: savedAnswersCount,
      statistics: statisticsCount,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[GET /api/db/stats] Ошибка:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LMS MAI Quiz Solver API Server running on port ${PORT}`);
  console.log(`📊 Database: ${dbPath}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  process.exit(0);
});

