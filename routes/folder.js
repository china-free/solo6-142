const express = require('express');
const database = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/groups', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const groups = await db.all('SELECT * FROM card_groups WHERE user_id = ? ORDER BY id', [req.user.id]);
    res.json({ groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取分组失败' });
  }
});

router.post('/groups', authMiddleware, async (req, res) => {
  const { name, color } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: '分组名称不能为空' });
  }

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const result = await db.run('INSERT INTO card_groups (user_id, name, color) VALUES (?, ?, ?)', [
      req.user.id, name, color || '#3b82f6'
    ]);

    if (database.saveDatabase) database.saveDatabase();

    res.json({ id: result.lastID, name, color: color || '#3b82f6' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建分组失败' });
  }
});

router.put('/groups/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const group = await db.get('SELECT * FROM card_groups WHERE id = ?', [req.params.id]);
    
    if (!group || group.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改' });
    }

    const { name, color } = req.body;
    await db.run('UPDATE card_groups SET name = ?, color = ? WHERE id = ?', [
      name || group.name, color || group.color, req.params.id
    ]);

    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '分组更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败' });
  }
});

router.delete('/groups/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const group = await db.get('SELECT * FROM card_groups WHERE id = ?', [req.params.id]);
    
    if (!group || group.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除' });
    }

    await db.run('DELETE FROM card_groups WHERE id = ?', [req.params.id]);
    
    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '分组删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

router.get('/cards', authMiddleware, async (req, res) => {
  const { group_id, keyword } = req.query;
  
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    let query = `
      SELECT fc.id as folder_card_id, fc.group_id, fc.added_at, c.*
      FROM folder_cards fc 
      JOIN cards c ON fc.card_id = c.id
      WHERE fc.user_id = ?
    `;
    const params = [req.user.id];

    if (group_id) {
      query += ' AND fc.group_id = ?';
      params.push(group_id);
    }

    if (keyword) {
      query += ' AND (c.name LIKE ? OR c.company LIKE ?)';
      const search = `%${keyword}%`;
      params.push(search, search);
    }

    query += ' ORDER BY fc.added_at DESC';

    const cards = await db.all(query, params);
    res.json({ cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取名片夹失败' });
  }
});

router.post('/cards', authMiddleware, async (req, res) => {
  const { card_id, group_id, slug } = req.body;
  
  let targetCardId = card_id;

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    if (!card_id && slug) {
      const card = await db.get('SELECT id FROM cards WHERE slug = ?', [slug]);
      if (!card) {
        return res.status(404).json({ error: '名片不存在' });
      }
      targetCardId = card.id;
    }

    if (!targetCardId) {
      return res.status(400).json({ error: '请提供名片ID或slug' });
    }

    const card = await db.get('SELECT * FROM cards WHERE id = ? AND is_public = 1', [targetCardId]);
    if (!card) {
      return res.status(404).json({ error: '名片不存在或未公开' });
    }

    if (card.user_id === req.user.id) {
      return res.status(400).json({ error: '不能添加自己的名片' });
    }

    const existing = await db.get('SELECT id FROM folder_cards WHERE user_id = ? AND card_id = ?', [req.user.id, targetCardId]);
    if (existing) {
      return res.status(400).json({ error: '该名片已在名片夹中' });
    }

    const result = await db.run('INSERT INTO folder_cards (user_id, card_id, group_id) VALUES (?, ?, ?)', [
      req.user.id, targetCardId, group_id || null
    ]);

    if (database.saveDatabase) database.saveDatabase();

    res.json({ id: result.lastID, message: '名片已添加到名片夹' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '添加失败' });
  }
});

router.put('/cards/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const folderCard = await db.get('SELECT * FROM folder_cards WHERE id = ?', [req.params.id]);
    
    if (!folderCard || folderCard.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改' });
    }

    const { group_id } = req.body;
    await db.run('UPDATE folder_cards SET group_id = ? WHERE id = ?', [
      group_id || null, req.params.id
    ]);

    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '名片分组已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败' });
  }
});

router.delete('/cards/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const folderCard = await db.get('SELECT * FROM folder_cards WHERE id = ?', [req.params.id]);
    
    if (!folderCard || folderCard.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除' });
    }

    await db.run('DELETE FROM folder_cards WHERE id = ?', [req.params.id]);
    
    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '名片已从名片夹移除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
