const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = parseInt(process.env.PORT || '4000');
const UPLOAD_DIR          = process.env.UPLOAD_DIR || '/uploads';
const ACCESS_PIN          = process.env.ACCESS_PIN || '';
const SESSION_TIMEOUT_MS  = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '60') * 60 * 1000;
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_GB || '10') * 1024 * 1024 * 1024;
const MAX_FILES_PER_BATCH = parseInt(process.env.MAX_FILES_PER_BATCH || '50');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(cors({ origin: '*' }));
app.use(express.json());

const sessions = new Map();
function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TIMEOUT_MS);
  return token;
}
function isValidSession(token) {
  if (!ACCESS_PIN) return true;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TIMEOUT_MS);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (now > exp) sessions.delete(t);
}, 600000);
function requireAuth(req, res, next) {
  if (!ACCESS_PIN) return next();
  const token = req.headers['x-session-token'] || req.query.token;
  if (!isValidSession(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10);
    const dest  = path.join(UPLOAD_DIR, today);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, base + '_' + crypto.randomBytes(4).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE_BYTES } });
function walkDir(dir, rel) {
  rel = rel || '';
  const result = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return result; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rp   = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { for (const s of walkDir(full, rp)) result.push(s); }
    else { const st = fs.statSync(full); result.push({ name: e.name, relPath: rp, folder: rel || '/', size: st.size, modified: st.mtime.toISOString() }); }
  }
  return result;
}
function log(tag, msg) { console.log('[' + new Date().toISOString() + '] [' + tag + '] ' + msg); }
function safePath(rel) {
  if (!rel) return null;
  const full = path.resolve(UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  return full;
}
app.get('/api/health', (req, res) => res.json({ status: 'ok', authEnabled: !!ACCESS_PIN, time: new Date().toISOString() }));
app.get('/api/auth/check', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  res.json({ authenticated: isValidSession(token), authRequired: !!ACCESS_PIN });
});
app.post('/api/auth/login', (req, res) => {
  if (!ACCESS_PIN) return res.json({ token: 'no-auth' });
  const pin = req.body && req.body.pin;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  if (String(pin) !== String(ACCESS_PIN)) { log('AUTH','Failed PIN from '+req.ip); return res.status(401).json({ error: 'Incorrect PIN' }); }
  const token = createSession();
  log('AUTH','Login OK from '+req.ip);
  res.json({ token: token, expiresIn: SESSION_TIMEOUT_MS / 1000 });
});
app.post('/api/auth/logout', (req, res) => { const t = req.headers['x-session-token']; if (t) sessions.delete(t); res.json({ ok: true }); });
app.post('/api/upload', requireAuth, upload.array('files', MAX_FILES_PER_BATCH), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files received' });
  const results = req.files.map(function(f) {
    const folder = path.dirname(f.path).replace(UPLOAD_DIR, '').replace(new RegExp('^' + path.sep), '');
    return { originalName: f.originalname, savedAs: f.filename, size: f.size, mimetype: f.mimetype, folder: folder };
  });
  log('UPLOAD', results.length + ' file(s) from ' + req.ip);
  res.json({ success: true, uploaded: results.length, files: results });
});
app.get('/api/files', requireAuth, (req, res) => {
  try { const f = walkDir(UPLOAD_DIR).sort((a,b) => b.modified.localeCompare(a.modified)); res.json({ files: f, total: f.length }); }
  catch(err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/files/download', requireAuth, (req, res) => {
  const full = safePath(req.query.path || '');
  if (!full) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  res.download(full);
});
app.delete('/api/files', requireAuth, (req, res) => {
  const full = safePath(req.query.path || '');
  if (!full) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(full);
  const parent = path.dirname(full);
  try { if (fs.readdirSync(parent).length === 0) fs.rmdirSync(parent); } catch(e) {}
  res.json({ success: true, deleted: req.query.path });
});
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const files = walkDir(UPLOAD_DIR);
    const totalSize = files.reduce((a,f) => a+f.size, 0);
    const byDate = {};
    for (const f of files) { const d = f.folder === '/' ? 'unknown' : f.folder; if (!byDate[d]) byDate[d]={count:0,size:0}; byDate[d].count++; byDate[d].size+=f.size; }
    res.json({ totalFiles: files.length, totalSize: totalSize, totalSizeMB: (totalSize/1048576).toFixed(2), totalSizeGB: (totalSize/1073741824).toFixed(3), byDate: byDate });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
app.listen(PORT, '0.0.0.0', () => { log('START','Backend on port '+PORT); log('START','Auth: '+(ACCESS_PIN?'PIN enabled':'disabled')); });