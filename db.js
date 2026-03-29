const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Ошибка подключения к БД:', err);
  else console.log('Подключено к SQLite');
});

db.serialize(() => {
  // Таблица пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      vk_id TEXT PRIMARY KEY,
      access_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Таблица питомцев (добавлено поле avatar_url)
  db.run(`
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vk_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      zodiac_sign TEXT NOT NULL,
      photo_url TEXT,
      avatar_url TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vk_id) REFERENCES users(vk_id)
    )
  `);

  // Таблица лайков
  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER NOT NULL,
      vk_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pet_id, vk_id),
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
      FOREIGN KEY (vk_id) REFERENCES users(vk_id)
    )
  `);

  // Новая таблица: посты для ленты всех пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vk_id TEXT NOT NULL,
      photo_url TEXT NOT NULL,
      caption TEXT,
      wall_post_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vk_id) REFERENCES users(vk_id)
    )
  `);

  // Добавляем колонку avatar_url в pets, если её нет
  db.all("PRAGMA table_info(pets)", (err, rows) => {
    if (err) return;
    const hasAvatar = rows.some(col => col.name === 'avatar_url');
    if (!hasAvatar) {
      db.run("ALTER TABLE pets ADD COLUMN avatar_url TEXT", (err) => {
        if (err) console.error("Не удалось добавить avatar_url:", err);
        else console.log("Колонка avatar_url добавлена");
      });
    }
  });
});

module.exports = db;