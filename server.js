const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const database = require('./database');
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const folderRoutes = require('./routes/folder');
const exportRoutes = require('./routes/export');
const logRoutes = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/folder', folderRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/logs', logRoutes);

app.get('/card/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'card.html'));
});

function startServer() {
  if (database.db) {
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  } else {
    setTimeout(startServer, 500);
  }
}

startServer();
