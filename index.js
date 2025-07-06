require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'storage.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    size INTEGER,
    type TEXT,
    url TEXT NOT NULL,
    folder_id INTEGER,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
});

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// List all files
app.get('/files', (req, res) => {
  db.all('SELECT * FROM files', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// List all folders
app.get('/folders', (req, res) => {
  db.all('SELECT * FROM folders', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create a new folder
app.post('/folders', (req, res) => {
  const { name, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });
  db.run('INSERT INTO folders (name, parent_id) VALUES (?, ?)', [name, parent_id || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, parent_id: parent_id || null });
  });
});

// Upload file and store metadata
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const folder_id = req.body.folder_id || null;
  if (!file) {
    console.log('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: Date.now() + '-' + file.originalname,
    Body: file.buffer,
    ContentType: file.mimetype
  };
  try {
    const data = await s3.upload(params).promise();
    // Store metadata in SQLite
    db.run(
      'INSERT INTO files (name, size, type, url, folder_id) VALUES (?, ?, ?, ?, ?)',
      [file.originalname, file.size, file.mimetype, data.Location, folder_id],
      function(err) {
        if (err) {
          console.error('DB insert error:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ url: data.Location, id: this.lastID });
      }
    );
  } catch (err) {
    console.error('S3 upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a file (from DB and S3)
app.delete('/files/:id', (req, res) => {
  const fileId = req.params.id;
  db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
    if (err || !file) return res.status(404).json({ error: 'File not found' });
    // Extract S3 key from URL
    const urlParts = file.url.split('/');
    const key = decodeURIComponent(urlParts.slice(3).join('/'));
    s3.deleteObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    }, (s3Err) => {
      if (s3Err) console.error('S3 delete error:', s3Err);
      db.run('DELETE FROM files WHERE id = ?', [fileId], (dbErr) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        res.json({ success: true });
      });
    });
  });
});

// Delete a folder (and all files in it)
app.delete('/folders/:id', (req, res) => {
  const folderId = req.params.id;
  db.all('SELECT * FROM files WHERE folder_id = ?', [folderId], (err, filesInFolder) => {
    if (err) return res.status(500).json({ error: err.message });
    // Delete all files in S3 and DB
    let deleteCount = 0;
    if (filesInFolder.length === 0) {
      db.run('DELETE FROM folders WHERE id = ?', [folderId], (dbErr) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        res.json({ success: true });
      });
      return;
    }
    filesInFolder.forEach((file) => {
      const urlParts = file.url.split('/');
      const key = decodeURIComponent(urlParts.slice(3).join('/'));
      s3.deleteObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key
      }, (s3Err) => {
        if (s3Err) console.error('S3 delete error:', s3Err);
        db.run('DELETE FROM files WHERE id = ?', [file.id], (dbErr) => {
          deleteCount++;
          if (deleteCount === filesInFolder.length) {
            db.run('DELETE FROM folders WHERE id = ?', [folderId], (dbErr2) => {
              if (dbErr2) return res.status(500).json({ error: dbErr2.message });
              res.json({ success: true });
            });
          }
        });
      });
    });
  });
});

app.listen(3001, () => console.log('Server running on port 3001'));