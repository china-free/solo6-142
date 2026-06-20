const express = require('express');
const database = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/my-cards', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const cards = await db.all('SELECT id, name, slug FROM cards WHERE user_id = ?', [req.user.id]);
    
    const result = [];
    for (const card of cards) {
      const logs = await db.all(
        `SELECT vl.*, u.username as viewer_name
         FROM view_logs vl
         LEFT JOIN users u ON vl.viewer_id = u.id
         WHERE vl.card_id = ?
         ORDER BY vl.viewed_at DESC
         LIMIT 50`,
        [card.id]
      );

      const viewCountRow = await db.get('SELECT COUNT(*) as count FROM view_logs WHERE card_id = ?', [card.id]);

      result.push({
        ...card,
        view_count: viewCountRow.count,
        logs
      });
    }

    res.json({ cards: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

router.get('/card/:cardId', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [req.params.cardId]);
    
    if (!card || card.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限查看' });
    }

    const logs = await db.all(
      `SELECT vl.*, u.username as viewer_name
       FROM view_logs vl
       LEFT JOIN users u ON vl.viewer_id = u.id
       WHERE vl.card_id = ?
       ORDER BY vl.viewed_at DESC
       LIMIT 100`,
      [req.params.cardId]
    );

    const viewCountRow = await db.get('SELECT COUNT(*) as count FROM view_logs WHERE card_id = ?', [req.params.cardId]);
    const uniqueViewsRow = await db.get('SELECT COUNT(DISTINCT viewer_ip) as count FROM view_logs WHERE card_id = ?', [req.params.cardId]);

    res.json({
      card: { id: card.id, name: card.name, slug: card.slug },
      view_count: viewCountRow.count,
      unique_views: uniqueViewsRow.count,
      logs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取日志失败' });
  }
});

module.exports = router;
