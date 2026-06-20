const jwt = require('jsonwebtoken');
const database = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'digital-card-secret-key-2024';

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: '未授权访问' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');
    
    const user = await db.get('SELECT id, username, email FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: '无效的token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
