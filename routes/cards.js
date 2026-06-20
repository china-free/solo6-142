const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const database = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function generateSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const random = Math.random().toString(36).substring(2, 8);
  return base + '-' + random;
}

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const cards = await db.all('SELECT * FROM cards WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id]);
    res.json({ cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取名片列表失败' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE slug = ? AND is_public = 1', [req.params.slug]);
    
    if (!card) {
      return res.status(404).json({ error: '名片不存在' });
    }

    const viewerIp = req.ip || req.connection.remoteAddress;
    await db.run('INSERT INTO view_logs (card_id, viewer_id, viewer_ip) VALUES (?, NULL, ?)', [card.id, viewerIp]);
    
    if (database.saveDatabase) database.saveDatabase();

    res.json({ card });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取名片失败' });
  }
});

router.get('/id/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [req.params.id]);
    
    if (!card) {
      return res.status(404).json({ error: '名片不存在' });
    }

    if (card.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限访问' });
    }

    res.json({ card });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取名片失败' });
  }
});

router.post('/', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'logo', maxCount: 1 }]), async (req, res) => {
  const { name, position, company, phone, email, wechat, address, bio, template, is_public } = req.body;

  if (!name) {
    return res.status(400).json({ error: '姓名不能为空' });
  }

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const slug = generateSlug(name);
    const avatar = req.files?.avatar?.[0]?.filename || null;
    const logo = req.files?.logo?.[0]?.filename || null;

    const result = await db.run(
      `INSERT INTO cards (user_id, slug, template, name, position, company, phone, email, wechat, address, bio, avatar, logo, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, slug, template || 'classic', name, position || '', company || '',
       phone || '', email || '', wechat || '', address || '', bio || '',
       avatar, logo, is_public ? 1 : 1]
    );

    if (database.saveDatabase) database.saveDatabase();

    res.json({ id: result.lastID, slug, message: '名片创建成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建名片失败' });
  }
});

router.put('/:id', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'logo', maxCount: 1 }]), async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [req.params.id]);
    
    if (!card || card.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改' });
    }

    const { name, position, company, phone, email, wechat, address, bio, template, is_public } = req.body;

    let avatar = card.avatar;
    let logo = card.logo;

    if (req.files?.avatar?.[0]) {
      if (avatar) {
        const oldPath = path.join(__dirname, '..', 'uploads', avatar);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      avatar = req.files.avatar[0].filename;
    }

    if (req.files?.logo?.[0]) {
      if (logo) {
        const oldPath = path.join(__dirname, '..', 'uploads', logo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      logo = req.files.logo[0].filename;
    }

    await db.run(
      `UPDATE cards SET 
        name = ?, position = ?, company = ?, phone = ?, email = ?, wechat = ?,
        address = ?, bio = ?, template = ?, is_public = ?, avatar = ?, logo = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || card.name, position ?? card.position, company ?? card.company,
       phone ?? card.phone, email ?? card.email, wechat ?? card.wechat,
       address ?? card.address, bio ?? card.bio, template || card.template,
       is_public !== undefined ? (is_public ? 1 : 0) : card.is_public,
       avatar, logo, req.params.id]
    );

    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '名片更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新名片失败' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [req.params.id]);
    
    if (!card || card.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除' });
    }

    if (card.avatar) {
      const avatarPath = path.join(__dirname, '..', 'uploads', card.avatar);
      if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    }
    if (card.logo) {
      const logoPath = path.join(__dirname, '..', 'uploads', card.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }

    await db.run('DELETE FROM cards WHERE id = ?', [req.params.id]);
    
    if (database.saveDatabase) database.saveDatabase();

    res.json({ message: '名片删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

router.get('/:slug/qrcode', async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE slug = ?', [req.params.slug]);
    if (!card) {
      return res.status(404).json({ error: '名片不存在' });
    }

    const cardUrl = `${req.protocol}://${req.get('host')}/card/${card.slug}`;
    const qrDataUrl = await QRCode.toDataURL(cardUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#1f2937', light: '#ffffff' }
    });

    res.json({ qrcode: qrDataUrl, url: cardUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '二维码生成失败' });
  }
});

router.post('/search', authMiddleware, async (req, res) => {
  const { keyword } = req.body;
  
  if (!keyword) {
    return res.json({ cards: [] });
  }

  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const searchTerm = `%${keyword}%`;
    const cards = await db.all(
      `SELECT c.*, u.username as owner_name 
       FROM cards c 
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.is_public = 1 
       AND (c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)
       LIMIT 20`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );

    res.json({ cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '搜索失败' });
  }
});

module.exports = router;
