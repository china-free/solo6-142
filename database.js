const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data.db');

let dbInstance = null;

function promisifyDb(database) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        try {
          const stmt = database.prepare(sql);
          stmt.bind(params);
          stmt.step();
          stmt.free();
          const lastInsertRowid = database.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
          const changes = database.exec('SELECT changes() as cnt')[0]?.values[0]?.[0];
          resolve({ lastID: lastInsertRowid, changes });
        } catch (err) {
          reject(err);
        }
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        try {
          const stmt = database.prepare(sql);
          stmt.bind(params);
          let result = undefined;
          if (stmt.step()) {
            const row = stmt.getAsObject();
            result = row;
          }
          stmt.free();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        try {
          const stmt = database.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        try {
          database.exec(sql);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    },
    close() {
      database.close();
    },
    _db: database
  };
}

async function initDB() {
  const SQL = await initSqlJs();
  
  let database;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    database = new SQL.Database(fileBuffer);
  } else {
    database = new SQL.Database();
  }

  dbInstance = promisifyDb(database);

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      template TEXT DEFAULT 'classic',
      name TEXT NOT NULL,
      position TEXT,
      company TEXT,
      phone TEXT,
      email TEXT,
      wechat TEXT,
      address TEXT,
      bio TEXT,
      avatar TEXT,
      logo TEXT,
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS card_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS folder_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      group_id INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS view_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      viewer_id INTEGER,
      viewer_ip TEXT,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userRow = await dbInstance.get('SELECT COUNT(*) as count FROM users');
  if (userRow.count === 0) {
    const hash = bcrypt.hashSync('123456', 10);
    const result = await dbInstance.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', ['demo', 'demo@example.com', hash]);
    const userId = result.lastID;
    
    await dbInstance.run('INSERT INTO card_groups (user_id, name, color) VALUES (?, ?, ?)', [userId, '同事', '#3b82f6']);
    await dbInstance.run('INSERT INTO card_groups (user_id, name, color) VALUES (?, ?, ?)', [userId, '客户', '#10b981']);
    await dbInstance.run('INSERT INTO card_groups (user_id, name, color) VALUES (?, ?, ?)', [userId, '朋友', '#f59e0b']);
    
    console.log('默认用户已创建: demo / 123456');
    saveDatabase();
  }

  console.log('数据库初始化完成');
}

function saveDatabase() {
  if (dbInstance && dbInstance._db) {
    try {
      const data = dbInstance._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      console.error('保存数据库失败:', err.message);
    }
  }
}

const database = {
  db: null,
  saveDatabase
};

setInterval(saveDatabase, 10000);

process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit(0);
});

initDB().then(() => {
  database.db = dbInstance;
}).catch(err => console.error('数据库初始化失败:', err));

module.exports = database;
