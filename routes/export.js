const express = require('express');
const database = require('../database');
const VCard = require('vcard-creator').default;

const router = express.Router();

const templateStyles = {
  classic: { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', iconBg: '#667eea' },
  modern: { bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', iconBg: '#11998e' },
  elegant: { bg: 'linear-gradient(135deg, #2c3e50 0%, #4a5568 100%)', iconBg: '#2c3e50' },
  warm: { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', iconBg: '#f5576c' },
  ocean: { bg: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)', iconBg: '#0093E9' },
  sunset: { bg: 'linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 50%, #2BFF88 100%)', iconBg: '#FA8BFF' }
};

function rfc5987Encode(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, '%2A');
}

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

    const vcard = new VCard();

    vcard.addName({ givenName: card.name });

    if (card.company) {
      vcard.addCompany({ name: card.company, department: '' });
    }

    if (card.position) {
      vcard.addJobtitle(card.position);
    }

    if (card.phone) {
      vcard.addPhoneNumber({ number: card.phone, type: ['work', 'voice', 'cell'] });
    }

    if (card.email) {
      vcard.addEmail({ address: card.email, type: ['work', 'internet'] });
    }

    if (card.address) {
      vcard.addAddress({
        street: card.address,
        locality: '',
        region: '',
        postalCode: '',
        country: '',
        type: ['work']
      });
    }

    if (card.wechat) {
      vcard.addCustomProperty({
        name: 'X-WECHAT',
        value: card.wechat
      });
    }

    if (card.bio) {
      vcard.addNote(card.bio);
    }

    const cardUrl = `${req.protocol}://${req.get('host')}/card/${card.slug}`;
    vcard.addUrl({ url: cardUrl, type: ['work'] });

    const vcardString = vcard.toString();
    const hasNonAscii = /[^\x00-\x7F]/.test(card.name);
    const asciiFilename = hasNonAscii ? 'contact.vcf' : (card.name + '.vcf');
    const encodedFilename = rfc5987Encode(card.name + '.vcf');

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('Content-Transfer-Encoding', '8bit');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');

    res.send(vcardString);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '生成vCard失败' });
  }
});

module.exports = router;
