const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
console.log('Путь к БД:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
    return;
  }
  console.log('Подключено к SQLite');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (vk_id TEXT PRIMARY KEY, access_token TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`, (err) => {
    if (err) console.error('Ошибка создания users:', err);
  });
  db.run(`CREATE TABLE IF NOT EXISTS pets (id INTEGER PRIMARY KEY AUTOINCREMENT, vk_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, zodiac_sign TEXT NOT NULL, photo_url TEXT, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (vk_id) REFERENCES users(vk_id))`, (err) => {
    if (err) console.error('Ошибка создания pets:', err);
  });
  db.run(`CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, vk_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(pet_id, vk_id), FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE, FOREIGN KEY (vk_id) REFERENCES users(vk_id))`, (err) => {
    if (err) console.error('Ошибка создания likes:', err);
  });

  // Миграция: добавляем колонку status, если её нет
  db.all("PRAGMA table_info(pets)", (err, rows) => {
    if (err) {
      console.error('Ошибка получения структуры pets:', err);
      return;
    }
    console.log('Структура pets:', rows);
    const hasStatus = rows.some(col => col.name === 'status');
    if (!hasStatus) {
      db.run("ALTER TABLE pets ADD COLUMN status TEXT", (err) => {
        if (err) console.error('Не удалось добавить колонку status:', err);
        else console.log('Колонка status добавлена');
      });
    }
  });
});

module.exports = db;