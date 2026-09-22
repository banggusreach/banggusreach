'use strict';

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const Go = require('@xof/fetch');

const app = express();
// PORT diperbarui agar dinamis mendukung cloud hosting (Render/Railway/Vercel/dll)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'isifollowers-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ---------------- KONFIGURASI FIREBASE REALTIME DATABASE ----------------
// Database ini dipakai untuk menyimpan akun (users) secara permanen,
// supaya data tidak hilang saat server restart.
const FIREBASE_URL = 'https://banggus-e2ee3-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || ''; // opsional

function fbAuthQuery() {
  return FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : '';
}

// Key di Firebase tidak boleh mengandung . # $ [ ] / , jadi username di-encode dulu
function fbKey(username) {
  return Buffer.from(String(username).toLowerCase()).toString('hex');
}

async function fbGet(path) {
  try {
    const res = await fetch(`${FIREBASE_URL}/${path}.json${fbAuthQuery()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[Firebase GET Error]', err.message);
    return null;
  }
}

async function fbSet(path, data) {
  try {
    await fetch(`${FIREBASE_URL}/${path}.json${fbAuthQuery()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error('[Firebase SET Error]', err.message);
  }
}

// Simpan / update satu user ke Firebase (dipanggil tiap ada perubahan data user)
async function syncUserToFirebase(user) {
  const safeUser = { ...user, coins: user.coins === Infinity ? 'INFINITY' : user.coins };
  await fbSet(`users/${fbKey(user.username)}`, safeUser);
}

// ---------------- PASSWORD HASHING ----------------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return password === stored; // fallback data lama
  const [salt, hash] = stored.split(':');
  const hashVerify = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === hashVerify;
}

// Database Simpanan dalam Memori (di-cache dari Firebase saat server start)
const usersDB = [];

const DEFAULT_ADMIN = {
  username: 'adminbaguss',
  password: hashPassword('baguss'),
  role: 'admin',
  coins: Infinity,
  lastUsed: null,
  token: null
};

// Muat semua user dari Firebase ke memori. Kalau kosong, buat akun admin default.
async function loadUsersFromFirebase() {
  // Hindari memuat ulang jika sudah ada data ter-load di memori serverless
  if (usersDB.length > 0) return;

  const data = await fbGet('users');

  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const u = data[key];
      if (!u || !u.username) continue;
      usersDB.push({
        username: u.username,
        password: u.password,
        role: u.role || 'user',
        coins: u.coins === 'INFINITY' ? Infinity : (u.coins ?? 1),
        lastUsed: u.lastUsed ?? null,
        token: u.token || null
      });
    }
  }

  if (!usersDB.find(u => u.role === 'admin')) {
    usersDB.push(DEFAULT_ADMIN);
    await syncUserToFirebase(DEFAULT_ADMIN);
  }

  console.log(`✅ ${usersDB.length} akun berhasil dimuat dari Firebase.`);
}

// Inisialisasi Client Fetch Bawaan
const go = Go.create({
  baseURL: 'https://isifollowers.com',
  browser: true,
  cookieJar: true,
  keepAlive: true
});

// Daftar Layanan
const freeServices = {
  instagram: [
    { id: "16", name: "Instagram Followers GRATIS!!!" },
    { id: "37", name: "Instagram Likes Gratis!" }
  ],
  tiktok: [
    { id: "17", name: "Tiktok Likes Gratis" }
  ]
};

// Helper Pembantu
function getService({ service, version }) {
  const services = freeServices[service?.toLowerCase()];
  if (!services?.length) throw new Error(`Service gratis tidak ditemukan untuk ${service}`);
  if (version !== undefined) {
    const selected = services[version - 1];
    if (!selected) throw new Error(`Versi ${version} tidak tersedia untuk ${service}`);
    return selected;
  }
  return services[Math.floor(Math.random() * services.length)];
}

function parseResponseStatus(responseText) {
  let parsedJson = null;
  try { parsedJson = JSON.parse(responseText); } catch (e) {}

  const rawString = (parsedJson ? JSON.stringify(parsedJson) : responseText).toLowerCase();

  if (
    (parsedJson && (parsedJson.status === true || parsedJson.status === "success" || parsedJson.status === "sukses")) ||
    rawString.includes("berhasil") || rawString.includes("success") || rawString.includes("sukses")
  ) {
    return { status: "SUCCESS", classType: "success", icon: "✔", message: parsedJson?.message || responseText.trim() || "Orderan berhasil dikirim ke server!" };
  }

  if (rawString.includes("pending") || rawString.includes("antrian") || rawString.includes("proses") || rawString.includes("wait")) {
    return { status: "PENDING", classType: "pending", icon: "⏳", message: parsedJson?.message || responseText.trim() || "Orderan sedang masuk antrean / pending." };
  }

  return { status: "GAGAL", classType: "failed", icon: "✖", message: parsedJson?.message || responseText.trim() || "Gagal memproses orderan." };
}

// Middleware Proteksi Akses
function requireAuth(req, res, next) {
  // 1) Cek token dari header Authorization
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const userByToken = usersDB.find(u => u.token && u.token === token);
    if (userByToken) {
      req.user = userByToken;
      req.session.username = userByToken.username;
      return next();
    }
  }

  // 2) Fallback ke session cookie
  if (req.session && req.session.username) {
    const user = usersDB.find(u => u.username === req.session.username);
    if (user) {
      req.user = user;
      return next();
    }
  }

  return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu!' });
}

// Middleware khusus admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Fitur ini hanya untuk admin!' });
  }
  return next();
}

// Helper untuk Cek dan Reset Koin Otomatis setelah 24 Jam
function checkAndResetCoin(user) {
  if (user.role === 'admin') return;

  const COOLDOWN_TIME = 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (user.lastUsed) {
    const timePassed = now - user.lastUsed;
    if (timePassed >= COOLDOWN_TIME) {
      user.coins = 1;
      user.lastUsed = null;
    }
  }
}

// ---------------- API AUTHENTICATION ----------------

app.post('/api/register', async (req, res) => {
  await loadUsersFromFirebase();
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan Password wajib diisi!' });
  }

  const existingUser = usersDB.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Username sudah terdaftar!' });
  }

  const newUser = { 
    username, 
    password: hashPassword(password), 
    role: 'user', 
    coins: 1, 
    lastUsed: null,
    token: crypto.randomBytes(32).toString('hex')
  };
  
  usersDB.push(newUser);
  req.session.username = newUser.username;
  await syncUserToFirebase(newUser);

  return res.json({ 
    success: true, 
    message: 'Pendaftaran berhasil!', 
    token: newUser.token,
    user: {
      username: newUser.username,
      role: newUser.role,
      coins: newUser.coins,
      lastUsed: newUser.lastUsed
    } 
  });
});

app.post('/api/login', async (req, res) => {
  await loadUsersFromFirebase();
  const { username, password } = req.body;

  const user = usersDB.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ success: false, message: 'Username atau Password salah!' });
  }

  checkAndResetCoin(user);
  req.session.username = user.username;

  if (!user.token) {
    user.token = crypto.randomBytes(32).toString('hex');
  }
  await syncUserToFirebase(user);

  return res.json({ 
    success: true, 
    message: 'Login berhasil!', 
    token: user.token,
    user: {
      username: user.username,
      role: user.role,
      coins: user.coins,
      lastUsed: user.lastUsed
    } 
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  return res.json({ success: true, message: 'Logout berhasil!' });
});

app.get('/api/me', requireAuth, (req, res) => {
  checkAndResetCoin(req.user);
  return res.json({ 
    loggedIn: true, 
    token: req.user.token,
    user: {
      username: req.user.username,
      role: req.user.role,
      coins: req.user.coins,
      lastUsed: req.user.lastUsed
    } 
  });
});

// ---------------- API ORDER & SERVICES ----------------

app.get('/api/services', requireAuth, (req, res) => {
  res.json({ success: true, services: freeServices });
});

app.post('/api/order', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    checkAndResetCoin(user);

    if (user.role !== 'admin' && user.coins <= 0) {
      const COOLDOWN_TIME = 24 * 60 * 60 * 1000;
      const nextReset = new Date(user.lastUsed + COOLDOWN_TIME);
      return res.status(403).json({ 
        success: false, 
        message: `Koin kamu sudah habis! Koin akan di-reset otomatis pada ${nextReset.toLocaleString()}` 
      });
    }

    const { service, version, url, jumlah = 20 } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, message: 'URL/Target tidak boleh kosong!' });
    }

    const selected = getService({ service, version: parseInt(version, 10) });

    const payload = new URLSearchParams({
      service: String(selected.id),
      target: String(url.trim()),
      jumlah: String(jumlah),
      whatsapp: ''
    });

    let client = go;
    if (user.role === 'admin') {
      client = Go.create({
        baseURL: 'https://isifollowers.com',
        browser: true,
        cookieJar: true,
        keepAlive: false
      });
    }

    await client.get('/');
    const response = await client.post('/ajax/order/orders.php', {
      body: payload.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const responseText = await response.text();
    const statusResult = parseResponseStatus(responseText);

    if (user.role !== 'admin') {
      user.coins -= 1;
      user.lastUsed = Date.now();
      await syncUserToFirebase(user);
    }

    return res.json({
      success: true,
      serviceName: selected.name,
      target: url,
      jumlah: jumlah,
      result: statusResult,
      remainingCoins: user.coins,
      lastUsed: user.lastUsed
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan sistem' });
  }
});

// ---------------- API ADMIN: GIVE COIN ----------------
app.post('/api/admin/give-coin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { targetUsername, amount } = req.body;

    if (!targetUsername || !targetUsername.trim()) {
      return res.status(400).json({ success: false, message: 'Username target wajib diisi!' });
    }

    const coinAmount = parseInt(amount, 10);
    if (!coinAmount || coinAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah koin harus angka positif!' });
    }

    const targetUser = usersDB.find(
      u => u.username.toLowerCase() === targetUsername.trim().toLowerCase()
    );

    if (!targetUser) {
      return res.status(404).json({ success: false, message: `User "${targetUsername}" tidak ditemukan!` });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Akun admin sudah memiliki koin unlimited.' });
    }

    targetUser.coins += coinAmount;
    await syncUserToFirebase(targetUser);

    return res.json({
      success: true,
      message: `Berhasil memberikan ${coinAmount} koin ke ${targetUser.username}!`,
      targetUser: {
        username: targetUser.username,
        coins: targetUser.coins
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan sistem' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  await loadUsersFromFirebase();
  return res.json({
    success: true,
    users: usersDB.map(u => ({
      username: u.username,
      role: u.role,
      coins: u.coins === Infinity ? '∞' : u.coins
    }))
  });
});

// ---------------- DASHBOARD WEBPAGE ----------------
app.get('/', async (req, res) => {
  await loadUsersFromFirebase();
  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suntik Sosmed Free Banggus</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    
    body {
      background: #090d16;
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.15) 0px, transparent 50%);
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      width: 100%;
      max-width: 480px;
      padding: 32px 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .brand-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .brand-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      border-radius: 14px;
      font-size: 26px;
      margin-bottom: 12px;
      box-shadow: 0 8px 20px rgba(6, 182, 212, 0.3);
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      background: linear-gradient(135deg, #38bdf8, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }

    p.subtitle {
      color: #94a3b8;
      font-size: 13px;
      margin-top: 4px;
      font-weight: 500;
    }
    
    .tabs {
      display: flex;
      background: rgba(15, 23, 42, 0.6);
      padding: 4px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      margin-bottom: 24px;
    }

    .tab-btn {
      flex: 1;
      padding: 10px;
      background: transparent;
      border: none;
      color: #94a3b8;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.3s ease;
    }

    .tab-btn.active {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }

    .form-group {
      margin-bottom: 18px;
    }

    label {
      display: block;
      font-size: 12px;
      color: #cbd5e1;
      margin-bottom: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    select, input {
      width: 100%;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(15, 23, 42, 0.8);
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: all 0.2s ease;
    }

    select:focus, input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
    }

    button.btn-primary {
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      color: white;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 10px;
      box-shadow: 0 10px 20px rgba(6, 182, 212, 0.25);
    }

    button.btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 25px rgba(6, 182, 212, 0.35);
    }

    button.btn-primary:active {
      transform: translateY(0);
    }

    button.btn-primary:disabled {
      background: #334155;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
      color: #64748b;
    }

    button.btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 6px 12px;
      font-size: 11px;
      border-radius: 8px;
      color: #fca5a5;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    button.btn-danger:hover {
      background: #ef4444;
      color: white;
    }
    
    .status-box {
      margin-top: 24px;
      padding: 16px;
      border-radius: 12px;
      display: none;
      text-align: center;
      animation: fadeIn 0.3s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .status-box.success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
    }

    .status-box.pending {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
      color: #fde047;
    }

    .status-box.failed {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    .status-title { font-size: 16px; font-weight: 800; margin-bottom: 6px; }
    .status-detail { font-size: 13px; line-height: 1.5; word-break: break-word; opacity: 0.9; }

    .user-card {
      background: rgba(15, 23, 42, 0.6);
      padding: 14px 16px;
      border-radius: 14px;
      margin-bottom: 20px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .user-details { display: flex; flex-direction: column; gap: 4px; }
    .user-name { font-size: 14px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px; }

    .coin-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #ffffff;
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 800;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
    }

    .badge-admin {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .timer-box {
      background: rgba(249, 115, 22, 0.1);
      border: 1px solid rgba(249, 115, 22, 0.3);
      color: #fb923c;
      padding: 12px;
      border-radius: 12px;
      text-align: center;
      font-size: 13px;
      margin-bottom: 20px;
      display: none;
      font-weight: 600;
    }

    .timer-clock {
      font-size: 18px;
      font-weight: 800;
      color: #f97316;
      margin-top: 4px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>

  <div class="card">
    <div class="brand-header">
      <div class="brand-logo">⚡</div>
      <h1>SUNTIK SOSMED FREE</h1>
      <p class="subtitle">SUNTIK SOSMED FREE DAN AMAN</p>
    </div>

    <!-- AUTH SECTION -->
    <div id="authSection">
      <div class="tabs">
        <button class="tab-btn active" id="tabLoginBtn" onclick="switchAuthMode('login')">LOGIN</button>
        <button class="tab-btn" id="tabRegisterBtn" onclick="switchAuthMode('register')">REGISTER</button>
      </div>

      <form id="authForm">
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="authUsername" placeholder="Masukkan username" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="authPassword" placeholder="••••••••" required>
        </div>
        <button type="submit" class="btn-primary" id="btnAuthSubmit">LOGIN</button>
      </form>
    </div>

    <!-- SERVICES PANEL SECTION -->
    <div id="serviceSection" style="display: none;">
      <div class="user-card">
        <div class="user-details">
          <div class="user-name">
            👤 <span id="loggedInUser"></span>
            <span id="adminBadge"></span>
          </div>
          <div>
            <span id="coinBalance" class="coin-badge">🪙 1 Koin</span>
          </div>
        </div>
        <button onclick="logout()" class="btn-danger">LOGOUT</button>
      </div>

      <div id="giveCoinBox" style="display:none; background: rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
        <label style="margin-bottom:10px;">🎁 Give Koin (Admin Only)</label>
        <form id="giveCoinForm">
          <div class="form-group">
            <input type="text" id="giveCoinUsername" placeholder="Username tujuan" required>
          </div>
          <div class="form-group">
            <input type="number" id="giveCoinAmount" placeholder="Jumlah koin" min="1" value="1" required>
          </div>
          <button type="submit" class="btn-primary" style="margin-top:0;">🎁 KIRIM KOIN</button>
        </form>
        <div id="giveCoinStatus" style="font-size:12px; margin-top:8px; opacity:0.85;"></div>
      </div>

      <div id="timerBox" class="timer-box">
        ⏳ COOLDOWN AKTIF! SISA WAKTU RESET:
        <div id="countdown" class="timer-clock">00:00:00</div>
      </div>

      <form id="orderForm">
        <div class="form-group">
          <label for="category">Platform / Kategori</label>
          <select id="category" onchange="updateServices()" required>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>

        <div class="form-group">
          <label for="serviceVersion">Pilih Layanan Gratis</label>
          <select id="serviceVersion" required></select>
        </div>

        <div class="form-group">
          <label for="targetUrl">URL Target / Username</label>
          <input type="text" id="targetUrl" placeholder="https://www.instagram.com/p/..." required>
        </div>

        <div class="form-group">
          <label for="jumlah">Jumlah Order</label>
          <input type="number" id="jumlah" value="20" min="1" required>
        </div>

        <button type="submit" class="btn-primary" id="btnSubmit">🚀 KIRIM ORDERAN SEKARANG</button>
      </form>

      <div id="statusBox" class="status-box">
        <div id="statusTitle" class="status-title"></div>
        <div id="statusDetail" class="status-detail"></div>
      </div>
    </div>

  </div>

  <script>
    let authMode = 'login';
    let servicesData = {};
    let countdownInterval = null;

    function switchAuthMode(mode) {
      authMode = mode;
      document.getElementById('tabLoginBtn').className = mode === 'login' ? 'tab-btn active' : 'tab-btn';
      document.getElementById('tabRegisterBtn').className = mode === 'register' ? 'tab-btn active' : 'tab-btn';
      document.getElementById('btnAuthSubmit').textContent = mode === 'login' ? 'MASUK KE PANEL' : 'DAFTAR AKUN BARU';
    }

    function authHeaders(extra = {}) {
      const token = localStorage.getItem('authToken');
      return token ? { ...extra, 'Authorization': 'Bearer ' + token } : extra;
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/me', { headers: authHeaders() });
        const data = await res.json();
        if (data.loggedIn) {
          if (data.token) localStorage.setItem('authToken', data.token);
          showServicePanel(data.user);
        } else {
          localStorage.removeItem('authToken');
          document.getElementById('authSection').style.display = 'block';
          document.getElementById('serviceSection').style.display = 'none';
        }
      } catch (err) {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('serviceSection').style.display = 'none';
      }
    }

    function showServicePanel(user) {
      document.getElementById('authSection').style.display = 'none';
      document.getElementById('serviceSection').style.display = 'block';
      document.getElementById('loggedInUser').textContent = user.username;
      
      const badge = document.getElementById('adminBadge');
      const coinBalance = document.getElementById('coinBalance');
      const btnSubmit = document.getElementById('btnSubmit');

      if (user.role === 'admin') {
        badge.className = 'badge-admin';
        badge.textContent = '👑 ADMIN';
        coinBalance.textContent = '🪙 ∞ Unlimited';
        document.getElementById('timerBox').style.display = 'none';
        document.getElementById('giveCoinBox').style.display = 'block';
        btnSubmit.disabled = false;
      } else {
        badge.textContent = '';
        document.getElementById('giveCoinBox').style.display = 'none';
        coinBalance.textContent = '🪙 ' + user.coins + ' Koin';

        if (user.coins <= 0 && user.lastUsed) {
          btnSubmit.disabled = true;
          startCountdown(user.lastUsed);
        } else {
          btnSubmit.disabled = false;
          document.getElementById('timerBox').style.display = 'none';
        }
      }

      loadServices();
    }

    function startCountdown(lastUsed) {
      const timerBox = document.getElementById('timerBox');
      const countdownElem = document.getElementById('countdown');
      timerBox.style.display = 'block';

      if (countdownInterval) clearInterval(countdownInterval);

      const targetTime = lastUsed + (24 * 60 * 60 * 1000);

      countdownInterval = setInterval(() => {
        const now = Date.now();
        const diff = targetTime - now;

        if (diff <= 0) {
          clearInterval(countdownInterval);
          timerBox.style.display = 'none';
          checkAuth();
          return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        countdownElem.textContent = 
          String(hours).padStart(2, '0') + ':' + 
          String(minutes).padStart(2, '0') + ':' + 
          String(seconds).padStart(2, '0');
      }, 1000);
    }

    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('authUsername').value;
      const password = document.getElementById('authPassword').value;

      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (data.success) {
        if (data.token) localStorage.setItem('authToken', data.token);
        showServicePanel(data.user);
      } else {
        alert(data.message);
      }
    });

    async function logout() {
      await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
      localStorage.removeItem('authToken');
      location.reload();
    }

    async function loadServices() {
      const res = await fetch('/api/services', { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        servicesData = data.services;
        updateServices();
      }
    }

    const giveCoinFormEl = document.getElementById('giveCoinForm');
    if (giveCoinFormEl) {
      giveCoinFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusEl = document.getElementById('giveCoinStatus');
        const targetUsername = document.getElementById('giveCoinUsername').value;
        const amount = document.getElementById('giveCoinAmount').value;

        statusEl.style.color = '#94a3b8';
        statusEl.textContent = 'Mengirim koin...';

        try {
          const res = await fetch('/api/admin/give-coin', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ targetUsername, amount })
          });
          const data = await res.json();

          statusEl.style.color = data.success ? '#4ade80' : '#f87171';
          statusEl.textContent = data.message;

          if (data.success) {
            document.getElementById('giveCoinForm').reset();
            document.getElementById('giveCoinAmount').value = 1;
          }
        } catch (err) {
          statusEl.style.color = '#f87171';
          statusEl.textContent = 'Gagal terhubung ke server.';
        }
      });
    }

    function updateServices() {
      const category = document.getElementById('category').value;
      const select = document.getElementById('serviceVersion');
      select.innerHTML = '';

      if (servicesData[category]) {
        servicesData[category].forEach((item, idx) => {
          const opt = document.createElement('option');
          opt.value = idx + 1;
          opt.textContent = item.name + ' (ID: ' + item.id + ')';
          select.appendChild(opt);
        });
      }
    }

    document.getElementById('orderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = document.getElementById('btnSubmit');
      const statusBox = document.getElementById('statusBox');
      const statusTitle = document.getElementById('statusTitle');
      const statusDetail = document.getElementById('statusDetail');

      btn.disabled = true;
      btn.textContent = '⏳ Memproses Orderan...';
      statusBox.style.display = 'none';

      const payload = {
        service: document.getElementById('category').value,
        version: document.getElementById('serviceVersion').value,
        url: document.getElementById('targetUrl').value,
        jumlah: document.getElementById('jumlah').value
      };

      try {
        const res = await fetch('/api/order', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success && data.result) {
          statusBox.className = 'status-box ' + data.result.classType;
          statusTitle.textContent = data.result.icon + ' STATUS: ' + data.result.status;
          statusDetail.textContent = data.result.message;

          checkAuth();
        } else {
          statusBox.className = 'status-box failed';
          statusTitle.textContent = '✖ STATUS: GAGAL';
          statusDetail.textContent = data.message || 'Terjadi kesalahan internal.';
          checkAuth();
        }
      } catch (err) {
        statusBox.className = 'status-box failed';
        statusTitle.textContent = '✖ STATUS: GAGAL';
        statusDetail.textContent = 'Gagal terhubung ke server.';
      } finally {
        statusBox.style.display = 'block';
        btn.textContent = '🚀 KIRIM ORDERAN SEKARANG';
      }
    });

    checkAuth();
  </script>
</body>
</html>
  `);
});

// PENTING UNTUK VERCEL: Ekspor app agar bisa dibaca serverless functions
module.exports = app;

// Jalankan server secara lokal jika tidak berjalan di lingkungan produksi Vercel
if (process.env.NODE_ENV !== 'production') {
  loadUsersFromFirebase().then(() => {
    app.listen(PORT, () => {
      console.log(`\n================================================--`);
      console.log(`🚀 Server Lokal Aktif pada Port: ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🔥 Firebase DB: ${FIREBASE_URL}`);
      console.log(`🔑 Akun Admin -> Username: adminbaguss | Password: baguss`);
      console.log(`================================================--\n`);
    });
  });
}