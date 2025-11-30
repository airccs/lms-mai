// Скрипт для инициализации базы данных
// Запускается автоматически при первом запуске сервера, но можно запустить вручную

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'quiz_data.db');
const db = new Database(dbPath);

console.log('Инициализация базы данных...');

try {
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

  console.log('✅ База данных успешно инициализирована!');
  console.log(`📊 Путь к базе: ${dbPath}`);
  
  // Показываем статистику
  const statsCount = db.prepare('SELECT COUNT(*) as count FROM statistics').get();
  const answersCount = db.prepare('SELECT COUNT(*) as count FROM saved_answers').get();
  
  console.log(`📈 Статистика: ${statsCount.count} записей`);
  console.log(`💾 Ответы: ${answersCount.count} записей`);
  
} catch (error) {
  console.error('❌ Ошибка при инициализации базы данных:', error);
  process.exit(1);
} finally {
  db.close();
}

