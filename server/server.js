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

// Get all statistics (simplified - returns empty for compatibility)
app.get('/api/stats', (req, res) => {
  res.json({ statistics: {} });
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

    // Check if answer already exists
    const existingAnswer = db.prepare(`
      SELECT * FROM saved_answers 
      WHERE question_hash = ? AND answer_json = ?
    `).get(questionHash, JSON.stringify(answer));

    if (existingAnswer) {
      // Update existing answer if new one is more complete
      const stmt = db.prepare(`
        UPDATE saved_answers SET
          is_correct = COALESCE(?, is_correct),
          question_text = COALESCE(?, question_text),
          question_image = COALESCE(?, question_image),
          timestamp = COALESCE(?, timestamp)
        WHERE id = ?
      `);
      
      stmt.run(
        isCorrect !== null ? isCorrect : existingAnswer.is_correct,
        questionText || existingAnswer.question_text,
        questionImage || existingAnswer.question_image,
        timestamp || existingAnswer.timestamp,
        existingAnswer.id
      );
    } else {
      // Insert new answer
      const stmt = db.prepare(`
        INSERT INTO saved_answers 
        (question_hash, answer_json, is_correct, question_text, question_image, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        questionHash,
        JSON.stringify(answer),
        isCorrect,
        questionText || null,
        questionImage || null,
        timestamp || Math.floor(Date.now() / 1000)
      );
    }

    // Get all answers for this question
    const allAnswers = db.prepare(`
      SELECT * FROM saved_answers 
      WHERE question_hash = ?
      ORDER BY is_correct DESC, timestamp DESC
    `).all(questionHash);

    const answers = allAnswers.map(row => ({
      answer: safeJsonParse(row.answer_json),
      isCorrect: row.is_correct,
      questionText: row.question_text,
      questionImage: row.question_image,
      timestamp: row.timestamp * 1000, // Convert to milliseconds
    }));

    res.json({ success: true, answers });
  } catch (error) {
    console.error('Error saving answer:', error);
    res.status(500).json({ error: 'Internal server error' });
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

