require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ФУНКЦИЯ ОТПРАВКИ СООБЩЕНИЯ ====================
async function sendVkMessage(userId, message) {
  const groupToken = process.env.VK_GROUP_TOKEN;
  if (!groupToken) return false;
  try {
    const response = await axios.post('https://api.vk.com/method/messages.send', null, {
      params: {
        user_id: userId,
        message: message,
        random_id: Math.floor(Math.random() * 1e9),
        access_token: groupToken,
        v: '5.131'
      }
    });
    return !response.data.error;
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.response?.data || error.message);
    return false;
  }
}

// ==================== MIDDLEWARE АВТОРИЗАЦИИ (упрощённый) ====================
async function authMiddleware(req, res, next) {
  const vk_id = req.headers['x-vk-id'];
  const access_token = req.headers['x-access-token'];

  console.log('authMiddleware:', { vk_id, access_token: access_token ? '***' : undefined });

  if (!vk_id || !access_token) {
    return res.status(401).json({ error: 'Missing credentials' });
  }

  // Пропускаем любые токены (для тестирования)
  req.vk_id = vk_id;
  req.access_token = access_token;
  next();
}

// ==================== ЭНДПОИНТЫ ====================

// Получить профиль
app.get('/api/profile', authMiddleware, (req, res) => {
  const { vk_id } = req;
  console.log('GET /api/profile for vk_id:', vk_id);
  db.get('SELECT * FROM pets WHERE vk_id = ?', [vk_id], (err, row) => {
    if (err) {
      console.error('Ошибка SELECT /api/profile:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(row || null);
  });
});

// Сохранить профиль (со статусом)
app.post('/api/profile', authMiddleware, (req, res) => {
  const { vk_id } = req;
  const { name, type, zodiac_sign, photo_url, status } = req.body;

  console.log('POST /api/profile:', { vk_id, name, type, zodiac_sign, status });

  if (!name || !type || !zodiac_sign) {
    console.log('Missing fields');
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Сначала создаём пользователя, если его нет
  db.run('INSERT OR IGNORE INTO users (vk_id, access_token) VALUES (?, ?)', [vk_id, req.access_token], (err) => {
    if (err) {
      console.error('Ошибка INSERT в users:', err);
      return res.status(500).json({ error: err.message });
    }

    // Затем вставляем или обновляем питомца
    db.run(`
      INSERT INTO pets (vk_id, name, type, zodiac_sign, photo_url, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(vk_id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        zodiac_sign = excluded.zodiac_sign,
        photo_url = excluded.photo_url,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `, [vk_id, name, type, zodiac_sign, photo_url, status], function(err) {
      if (err) {
        console.error('Ошибка INSERT/UPDATE в pets:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log('Профиль сохранён успешно, id:', this.lastID);
      res.json({ success: true });
    });
  });
});

// Получить список друзей
async function getFriendsList(vk_id, access_token) {
  try {
    const response = await axios.get('https://api.vk.com/method/friends.get', {
      params: {
        user_id: vk_id,
        access_token,
        v: '5.131',
        fields: 'id'
      }
    });
    if (response.data.error) return [];
    return response.data.response.items.map(f => f.id.toString());
  } catch (e) {
    return [];
  }
}

// Лента друзей
app.get('/api/feed/friends', authMiddleware, async (req, res) => {
  const { vk_id, access_token } = req;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const friendsIds = await getFriendsList(vk_id, access_token);
  if (friendsIds.length === 0) {
    return res.json({ pets: [], total: 0 });
  }

  const placeholders = friendsIds.map(() => '?').join(',');
  const sql = `
    SELECT p.*,
           (SELECT COUNT(*) FROM likes WHERE pet_id = p.id) as likes_count,
           (SELECT COUNT(*) FROM likes WHERE pet_id = p.id AND vk_id = ?) as user_liked
    FROM pets p
    WHERE p.vk_id IN (${placeholders})
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const params = [vk_id, ...friendsIds, limit, offset];

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Ошибка SELECT /api/feed/friends:', err);
      return res.status(500).json({ error: err.message });
    }
    db.get(`SELECT COUNT(*) as total FROM pets WHERE vk_id IN (${placeholders})`, friendsIds, (err2, row) => {
      if (err2) {
        console.error('Ошибка подсчёта total:', err2);
        return res.json({ pets: rows, total: rows.length });
      }
      res.json({ pets: rows, total: row.total });
    });
  });
});

// Лайк + уведомление
app.post('/api/like/:petId', authMiddleware, (req, res) => {
  const { vk_id: likerId } = req;
  const petId = req.params.petId;

  db.get('SELECT id, vk_id FROM pets WHERE id = ?', [petId], (err, pet) => {
    if (err || !pet) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    db.get('SELECT id FROM likes WHERE pet_id = ? AND vk_id = ?', [petId, likerId], (err, like) => {
      if (err) {
        console.error('Ошибка SELECT лайка:', err);
        return res.status(500).json({ error: err.message });
      }

      if (like) {
        db.run('DELETE FROM likes WHERE id = ?', [like.id], function(err) {
          if (err) {
            console.error('Ошибка DELETE лайка:', err);
            return res.status(500).json({ error: err.message });
          }
          res.json({ liked: false });
        });
      } else {
        db.run('INSERT INTO likes (pet_id, vk_id) VALUES (?, ?)', [petId, likerId], function(err) {
          if (err) {
            console.error('Ошибка INSERT лайка:', err);
            return res.status(500).json({ error: err.message });
          }

          if (pet.vk_id !== likerId) {
            db.get('SELECT name FROM pets WHERE vk_id = ?', [likerId], (err, likerPet) => {
              const likerName = likerPet ? likerPet.name : 'Кто-то';
              const message = `🐾 Вашему питомцу поставил(а) лайк ${likerName}!`;
              sendVkMessage(pet.vk_id, message);
            });
          }

          res.json({ liked: true });
        });
      }
    });
  });
});

// Общий рейтинг
app.get('/api/rating', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  db.all(`
    SELECT p.*, COUNT(l.id) as likes_count
    FROM pets p
    LEFT JOIN likes l ON p.id = l.pet_id
    GROUP BY p.id
    ORDER BY likes_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `, [limit, offset], (err, rows) => {
    if (err) {
      console.error('Ошибка SELECT /api/rating:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Топ-3 за 24 часа
app.get('/api/top24h', (req, res) => {
  db.all(`
    SELECT p.*, COUNT(l.id) as likes_count
    FROM pets p
    JOIN likes l ON p.id = l.pet_id
    WHERE l.created_at >= datetime('now', '-1 day')
    GROUP BY p.id
    ORDER BY likes_count DESC
    LIMIT 3
  `, [], (err, rows) => {
    if (err) {
      console.error('Ошибка SELECT /api/top24h:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Для всех остальных маршрутов отдаём index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});