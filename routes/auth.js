const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const existingUser = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
    const userId = result.lastID;

    const defaultGroups = [
      { name: '同事', color: '#3b82f6' },
      { name: '客户', color: '#10b981' },
      { name: '朋友', color: '#f59e0b' }
    ];
    for (const g of defaultGroups) {
      await db.run('INSERT INTO card_groups (user_id, name, color) VALUES (?, ?, ?)', [userId, g.name, g.color]);
    }

    if (database.saveDatabase) database.saveDatabase();

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, username, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请填写用户名和密码' });
  }

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
