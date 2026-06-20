const express = require('express');
const database = require('../database');

const router = express.Router();

const templateStyles = {
  classic: { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', iconBg: '#667eea' },
  modern: { bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', iconBg: '#11998e' },
  elegant: { bg: 'linear-gradient(135deg, #2c3e50 0%, #4a5568 100%)', iconBg: '#2c3e50' },
  warm: { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', iconBg: '#f5576c' },
  ocean: { bg: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)', iconBg: '#0093E9' },
  sunset: { bg: 'linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 50%, #2BFF88 100%)', iconBg: '#FA8BFF' }
};

router.get('/data/:slug', async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE slug = ?', [req.params.slug]);
    if (!card) {
      return res.status(404).json({ error: '名片不存在' });
    }

    const style = templateStyles[card.template] || templateStyles.classic;
    
    res.json({
      card,
      style,
      baseUrl: `${req.protocol}://${req.get('host')}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取名片数据失败' });
  }
});

router.get('/vcard/:slug', async (req, res) => {
  try {
    const db = database.db;
    if (!db) throw new Error('数据库未初始化');

    const card = await db.get('SELECT * FROM cards WHERE slug = ?', [req.params.slug]);
    if (!card) {
      return res.status(404).json({ error: '名片不存在' });
    }

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${card.name}`,
      `FN:${card.name}`,
      card.position ? `TITLE:${card.position}` : '',
      card.company ? `ORG:${card.company}` : '',
      card.phone ? `TEL:${card.phone}` : '',
      card.email ? `EMAIL:${card.email}` : '',
      card.address ? `ADR:;;${card.address};;;` : '',
      card.bio ? `NOTE:${card.bio}` : '',
      'END:VCARD'
    ].filter(Boolean).join('\n');

    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', `attachment; filename="${card.name}.vcf"`);
    res.send(vcard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '生成vCard失败' });
  }
});

module.exports = router;
