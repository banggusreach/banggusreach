'use strict';

const express = require('express');
const crypto = require('crypto');
const Go = require('@xof/fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- FIREBASE ----------------
const FIREBASE_URL = 'https://banggus-e2ee3-default-rtdb.firebaseio.com';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';
const fbAuthQuery = () => FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : '';
const fbKey = (u) => Buffer.from(String(u).toLowerCase()).toString('hex');

async function fbGet(path) {
  try {
    const res = await fetch(`${FIREBASE_URL}/${path}.json${fbAuthQuery()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) { console.error('[FB GET]', err.message); return null; }
}
async function fbSet(path, data) {
  try {
    await fetch(`${FIREBASE_URL}/${path}.json${fbAuthQuery()}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
  } catch (err) { console.error('[FB SET]', err.message); }
}
async function fbDelete(path) {
  try { await fetch(`${FIREBASE_URL}/${path}.json${fbAuthQuery()}`, { method: 'DELETE' }); }
  catch (err) { console.error('[FB DEL]', err.message); }
}

async function syncUserToFirebase(user) {
  const safeUser = { ...user, coins: user.coins === Infinity ? 'INFINITY' : user.coins };
  await fbSet(`users/${fbKey(user.username)}`, safeUser);
}

// ---------------- HASH ----------------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return password === stored;
  const [salt, hash] = stored.split(':');
  return crypto.scryptSync(password, salt, 64).toString('hex') === hash;
}

// ---------------- DB MEMORY ----------------
const usersDB = [];
const redeemDB = {};
const ordersDB = {};

const serverStatus = {
  online: true,
  message: 'Server sedang online',
  updatedAt: Date.now(),
  updatedBy: 'system'
};

const DEFAULT_ADMIN = {
  username: 'adminbaguss',
  password: hashPassword('baguss'),
  role: 'admin',
  coins: Infinity,
  token: null
};

async function loadUsersFromFirebase() {
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
        token: u.token || null
      });
    }
  }
  if (!usersDB.find(u => u.role === 'admin')) {
    usersDB.push(DEFAULT_ADMIN);
    await syncUserToFirebase(DEFAULT_ADMIN);
  }
  console.log(`[OK] ${usersDB.length} akun dimuat.`);
}

async function loadRedeemsFromFirebase() {
  if (Object.keys(redeemDB).length > 0) return;
  const data = await fbGet('redeems');
  if (data && typeof data === 'object') {
    for (const code of Object.keys(data)) redeemDB[code] = data[code];
  }
  console.log(`[OK] ${Object.keys(redeemDB).length} kode redeem dimuat.`);
}

async function loadOrdersFromFirebase() {
  if (Object.keys(ordersDB).length > 0) return;
  const data = await fbGet('orders');
  if (data && typeof data === 'object') {
    for (const id of Object.keys(data)) ordersDB[id] = data[id];
  }
  console.log(`[OK] ${Object.keys(ordersDB).length} orderan dimuat.`);
}

async function loadServerStatusFromFirebase() {
  const data = await fbGet('serverStatus');
  if (data && typeof data === 'object') {
    serverStatus.online = data.online !== false;
    serverStatus.message = data.message || (data.online ? 'Server sedang online' : 'Server sedang offline');
    serverStatus.updatedAt = data.updatedAt || Date.now();
    serverStatus.updatedBy = data.updatedBy || 'system';
    console.log(`[OK] Server status: ${serverStatus.online ? 'ONLINE' : 'OFFLINE'}`);
  } else {
    await fbSet('serverStatus', serverStatus);
    console.log('[OK] Server status default: ONLINE');
  }
}

async function syncServerStatusToFirebase() {
  await fbSet('serverStatus', serverStatus);
}

const syncRedeemToFirebase = (code) => fbSet(`redeems/${code}`, redeemDB[code]);
const syncOrderToFirebase = (order) => fbSet(`orders/${order.orderId}`, order);

// ---------------- CLIENT ----------------
const goStatusChecker = Go.create({
  baseURL: 'https://isifollowers.com',
  browser: true,
  cookieJar: true,
  keepAlive: true
});

// Client FRESH per order (cookie bersih, hindari "sudah pernah order gratis")
function createFreshClient() {
  return Go.create({
    baseURL: 'https://isifollowers.com',
    browser: true,
    cookieJar: true,
    keepAlive: false
  });
}

const freeServices = {
  instagram: [
    { id: "16", name: "Instagram Followers GRATIS!!!" },
    { id: "37", name: "Instagram Likes Gratis!" }
  ],
  tiktok: [
    { id: "17", name: "Tiktok Likes Gratis" }
  ]
};

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

  // Cek GAGAL dulu (prioritas tertinggi, karena pesan gagal biasanya juga mengandung kata "gratis" dll)
  if (
    rawString.includes('sudah melakukan pemesanan') ||
    rawString.includes('sudah pernah') ||
    rawString.includes('silahkan pesan layanan berbayar') ||
    rawString.includes('silakan pesan layanan berbayar') ||
    rawString.includes('pesan layanan berbayar') ||
    (parsedJson && (parsedJson.status === false || parsedJson.status === 'error' || parsedJson.status === 'failed')) ||
    rawString.includes('gagal') ||
    rawString.includes('failed') ||
    rawString.includes('error')
  ) {
    return { status: "GAGAL", classType: "failed", icon: "", message: parsedJson?.message || responseText.trim() || "Gagal memproses orderan." };
  }

  if (
    (parsedJson && (parsedJson.status === true || parsedJson.status === "success" || parsedJson.status === "sukses")) ||
    rawString.includes("berhasil") || rawString.includes("success") || rawString.includes("sukses")
  ) {
    return { status: "SUCCESS", classType: "success", icon: "", message: parsedJson?.message || responseText.trim() || "Orderan berhasil dikirim!" };
  }

  if (rawString.includes("pending") || rawString.includes("antrian") || rawString.includes("proses") || rawString.includes("wait")) {
    return { status: "PENDING", classType: "pending", icon: "", message: parsedJson?.message || responseText.trim() || "Orderan masuk antrean." };
  }

  return { status: "GAGAL", classType: "failed", icon: "", message: parsedJson?.message || responseText.trim() || "Gagal memproses orderan." };
}

// ---------------- MIDDLEWARE ----------------
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const userByToken = usersDB.find(u => u.token && u.token === token);
    if (userByToken) { req.user = userByToken; return next(); }
  }
  return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu!' });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Fitur ini hanya untuk admin!' });
  }
  return next();
}

function requireServerOnline(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (!serverStatus.online) {
    return res.status(503).json({
      success: false,
      serverOffline: true,
      message: serverStatus.message || 'Server sedang offline. Silakan coba lagi nanti.'
    });
  }
  return next();
}

// ---------------- AUTO SYNC STATUS ORDER ----------------
async function refreshOrderStatus(order) {
  if (!order || !order.serverOrderId) return order;
  if (order.status === 'selesai' || order.status === 'gagal') return order;

  try {
    const endpoints = [
      `/ajax/order/status.php?order=${order.serverOrderId}`,
      `/ajax/order/status.php?id=${order.serverOrderId}`,
      `/ajax/status.php?order=${order.serverOrderId}`
    ];
    let rawText = '';
    for (const ep of endpoints) {
      try {
        const r = await goStatusChecker.get(ep, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const t = await r.text();
        if (t && t.length > 3) { rawText = t; break; }
      } catch (e) { }
    }
    if (!rawText) return order;

    const lower = rawText.toLowerCase();
    let newStatus = order.status;

    if (lower.includes('selesai') || lower.includes('success') || lower.includes('completed') || lower.includes('done')) {
      newStatus = 'selesai';
    }
    else if (lower.includes('gagal') || lower.includes('error') || lower.includes('cancel') || lower.includes('refund') || lower.includes('failed')) {
      newStatus = 'gagal';
    }
    else if (lower.includes('pending') || lower.includes('proses') || lower.includes('process') || lower.includes('antrian') || lower.includes('wait') || lower.includes('progress')) {
      newStatus = 'sedang menunggu antrian';
    }

    const progressMatch = rawText.match(/(\d+)\s*[\/]\s*(\d+)/);
    if (progressMatch) {
      const done = parseInt(progressMatch[1], 10);
      const total = parseInt(progressMatch[2], 10);
      order.progress = `${done}/${total}`;
      if (done >= total) newStatus = 'selesai';
    }

    try {
      const j = JSON.parse(rawText);
      if (j) {
        if (j.status === 'Completed' || j.status === 'completed' || j.status === 'Success' || j.status === 'success') newStatus = 'selesai';
        else if (j.status === 'Canceled' || j.status === 'canceled' || j.status === 'Error' || j.status === 'error') newStatus = 'gagal';
        else if (j.status === 'In progress' || j.status === 'in progress' || j.status === 'Pending' || j.status === 'pending' || j.status === 'Processing') newStatus = 'sedang menunggu antrian';
        if (j.remains !== undefined && j.start_count !== undefined && j.quantity !== undefined) {
          const done = j.start_count + j.quantity - j.remains;
          order.progress = `${done}/${j.quantity}`;
          if (j.remains <= 0) newStatus = 'selesai';
        }
      }
    } catch (e) { }

    if (newStatus !== order.status || order.progress) {
      order.status = newStatus;
      order.updatedAt = Date.now();
      order.lastChecked = Date.now();
      await syncOrderToFirebase(order);
    }
  } catch (err) {
    console.error('[refreshOrderStatus]', err.message);
  }
  return order;
}

async function refreshAllPendingOrders() {
  const pending = Object.values(ordersDB).filter(o =>
    o.serverOrderId && o.status !== 'selesai' && o.status !== 'gagal'
  );
  await Promise.allSettled(pending.map(o => refreshOrderStatus(o)));
}

// ---------------- SERVER STATUS API (PUBLIC) ----------------
app.get('/api/server/status', async (req, res) => {
  return res.json({
    success: true,
    online: serverStatus.online,
    message: serverStatus.message,
    updatedAt: serverStatus.updatedAt
  });
});

// ---------------- AUTH API ----------------
app.post('/api/register', async (req, res) => {
  await loadUsersFromFirebase();
  if (!serverStatus.online) {
    return res.status(503).json({
      success: false,
      serverOffline: true,
      message: serverStatus.message || 'Server sedang offline. Pendaftaran ditutup sementara.'
    });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Username dan Password wajib diisi!' });

  if (usersDB.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Username sudah terdaftar!' });
  }

  const newUser = {
    username, password: hashPassword(password), role: 'user', coins: 1,
    token: crypto.randomBytes(32).toString('hex')
  };
  usersDB.push(newUser);
  await syncUserToFirebase(newUser);

  return res.json({
    success: true, message: 'Pendaftaran berhasil!', token: newUser.token,
    user: { username: newUser.username, role: newUser.role, coins: newUser.coins }
  });
});

app.post('/api/login', async (req, res) => {
  await loadUsersFromFirebase();
  const { username, password } = req.body;
  const user = usersDB.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ success: false, message: 'Username atau Password salah!' });
  }

  if (user.role !== 'admin' && !serverStatus.online) {
    return res.status(503).json({
      success: false,
      serverOffline: true,
      message: serverStatus.message || 'Server sedang offline. Login user ditutup sementara.'
    });
  }

  if (!user.token) user.token = crypto.randomBytes(32).toString('hex');
  await syncUserToFirebase(user);

  return res.json({
    success: true, message: 'Login berhasil!', token: user.token,
    user: { username: user.username, role: user.role, coins: user.coins }
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  if (req.user.role !== 'admin' && !serverStatus.online) {
    return res.status(503).json({
      loggedIn: false,
      serverOffline: true,
      message: serverStatus.message || 'Server sedang offline.'
    });
  }
  return res.json({
    loggedIn: true, token: req.user.token,
    serverOnline: serverStatus.online,
    user: { username: req.user.username, role: req.user.role, coins: req.user.coins }
  });
});

// ---------------- PUBLIC ORDER TRACKING ----------------
app.get('/api/public/orders/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    if (!orderId) return res.status(400).json({ success: false, message: 'ID Order wajib diisi!' });

    let order = ordersDB[orderId];
    if (!order) {
      order = await fbGet(`orders/${orderId}`);
      if (order) ordersDB[orderId] = order;
    }
    if (!order) return res.status(404).json({ success: false, message: 'Orderan tidak ditemukan!' });

    await refreshOrderStatus(order);

    return res.json({ success: true, order, serverOnline: serverStatus.online });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Terjadi kesalahan' });
  }
});

// ---------------- SERVICES & ORDER ----------------
app.get('/api/services', requireAuth, requireServerOnline, (req, res) => {
  res.json({ success: true, services: freeServices });
});

app.post('/api/order', requireAuth, requireServerOnline, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'admin' && user.coins <= 0) {
      return res.status(403).json({
        success: false,
        message: 'Koin habis! Silakan klaim kode redeem atau minta admin.'
      });
    }

    const { service, version, url, jumlah = 20 } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ success: false, message: 'URL/Target tidak boleh kosong!' });

    const selected = getService({ service, version: parseInt(version, 10) });

    const payload = new URLSearchParams({
      service: String(selected.id), target: String(url.trim()),
      jumlah: String(jumlah), whatsapp: ''
    });

    // ================================================================
    // FRESH CLIENT — cookie baru supaya tidak kena "sudah pernah order"
    // ================================================================
    const client = createFreshClient();

    try {
      if (client.cookieJar && typeof client.cookieJar.clear === 'function') {
        client.cookieJar.clear();
      }
    } catch (e) { /* ignore */ }

    const extraHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://isifollowers.com',
      'Referer': 'https://isifollowers.com/',
      'X-Requested-With': 'XMLHttpRequest'
    };

    try {
      await client.get('/', { headers: extraHeaders });
    } catch (e) { /* lanjut */ }

    const response = await client.post('/ajax/order/orders.php', {
      body: payload.toString(),
      headers: {
        ...extraHeaders,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    });

    const responseText = await response.text();
    const statusResult = parseResponseStatus(responseText);

    let serverOrderId = null;
    try {
      const j = JSON.parse(responseText);
      serverOrderId = j.order || j.order_id || j.id || j.orderId || null;
    } catch (e) {
      const m = responseText.match(/["']?(?:order|order_id|id)["']?\s*[:=]\s*["']?(\d{5,})/i);
      if (m) serverOrderId = m[1];
    }

    const orderId = 'ORD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    // ================================================================
    // FITUR BARU: Jika gagal → langsung set status order = 'gagal'
    // jadi di tab Status user langsung muncul GAGAL, tidak stuck
    // di "menunggu antrian".
    // ================================================================
    const isFailed = statusResult.status === 'GAGAL';
    const initialStatus = isFailed ? 'gagal' : 'sedang menunggu antrian';

    const order = {
      orderId, serverOrderId, username: user.username,
      service: service, serviceName: selected.name, serviceId: selected.id,
      target: url.trim(), jumlah: parseInt(jumlah, 10),
      status: initialStatus,
      rawStatus: statusResult.status,
      message: statusResult.message,
      createdAt: Date.now(), updatedAt: Date.now(), lastChecked: Date.now()
    };
    ordersDB[orderId] = order;
    await syncOrderToFirebase(order);

    // Koin hanya dikurangi jika orderan TIDAK gagal
    // (biar user nggak rugi kalau orderan langsung ditolak server)
    if (user.role !== 'admin' && !isFailed) {
      user.coins -= 1;
      await syncUserToFirebase(user);
    }

    return res.json({
      success: true, orderId: order.orderId, serverOrderId,
      serviceName: selected.name, target: url, jumlah: jumlah,
      result: statusResult, remainingCoins: user.coins
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan sistem' });
  }
});

// ---------------- CEK STATUS ORDER ----------------
app.get('/api/orders/my', requireAuth, async (req, res) => {
  await loadOrdersFromFirebase();
  await refreshAllPendingOrders();
  const myOrders = Object.values(ordersDB)
    .filter(o => o.username === req.user.username)
    .sort((a, b) => b.createdAt - a.createdAt);
  return res.json({ success: true, orders: myOrders });
});

app.get('/api/orders/search/:orderId', requireAuth, async (req, res) => {
  await loadOrdersFromFirebase();
  const order = ordersDB[req.params.orderId];
  if (!order) return res.status(404).json({ success: false, message: 'Orderan tidak ditemukan!' });
  if (req.user.role !== 'admin' && order.username !== req.user.username) {
    return res.status(403).json({ success: false, message: 'Akses ditolak!' });
  }
  await refreshOrderStatus(order);
  return res.json({ success: true, order });
});

app.get('/api/orders/:orderId', requireAuth, async (req, res) => {
  await loadOrdersFromFirebase();
  const order = ordersDB[req.params.orderId];
  if (!order) return res.status(404).json({ success: false, message: 'Orderan tidak ditemukan!' });
  if (req.user.role !== 'admin' && order.username !== req.user.username) {
    return res.status(403).json({ success: false, message: 'Akses ditolak!' });
  }
  await refreshOrderStatus(order);
  return res.json({ success: true, order });
});

app.get('/api/admin/orders', requireAuth, requireAdmin, async (req, res) => {
  await loadOrdersFromFirebase();
  await refreshAllPendingOrders();
  const allOrders = Object.values(ordersDB).sort((a, b) => b.createdAt - a.createdAt);
  return res.json({ success: true, orders: allOrders });
});

// ---------------- REDEEM ----------------
app.get('/api/redeem/active', requireAuth, requireServerOnline, async (req, res) => {
  await loadRedeemsFromFirebase();
  const now = Date.now();
  const active = Object.values(redeemDB).filter(r => {
    if (r.expiresAt && r.expiresAt < now) return false;
    if (r.maxUses && r.usedBy && r.usedBy.length >= r.maxUses) return false;
    return true;
  }).map(r => ({
    code: r.code, coins: r.coins,
    remaining: r.maxUses ? Math.max(0, r.maxUses - (r.usedBy?.length || 0)) : '∞',
    expiresAt: r.expiresAt || null, createdAt: r.createdAt
  }));
  return res.json({ success: true, redeems: active });
});

app.post('/api/redeem/claim', requireAuth, requireServerOnline, async (req, res) => {
  await loadRedeemsFromFirebase();
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ success: false, message: 'Kode redeem wajib diisi!' });

  const normalized = code.trim().toUpperCase();
  const redeem = redeemDB[normalized];

  if (!redeem) return res.status(404).json({ success: false, message: 'Kode redeem tidak ditemukan!' });
  if (redeem.expiresAt && redeem.expiresAt < Date.now()) return res.status(400).json({ success: false, message: 'Kode redeem sudah expired!' });
  if (redeem.maxUses && redeem.usedBy && redeem.usedBy.length >= redeem.maxUses) return res.status(400).json({ success: false, message: 'Kode redeem sudah habis!' });
  if (redeem.usedBy && redeem.usedBy.includes(req.user.username)) return res.status(400).json({ success: false, message: 'Kamu sudah pernah klaim kode ini!' });

  if (!redeem.usedBy) redeem.usedBy = [];
  redeem.usedBy.push(req.user.username);
  req.user.coins += redeem.coins;

  await syncRedeemToFirebase(normalized);
  await syncUserToFirebase(req.user);

  return res.json({ success: true, message: `Berhasil klaim ${redeem.coins} koin!`, coins: req.user.coins });
});

app.post('/api/admin/redeem/create', requireAuth, requireAdmin, async (req, res) => {
  await loadRedeemsFromFirebase();
  const { code, coins, maxUses, expiresInHours } = req.body;

  let finalCode = (code || '').trim().toUpperCase();
  if (!finalCode) finalCode = 'FREE-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(finalCode)) return res.status(400).json({ success: false, message: 'Kode hanya boleh huruf, angka, dan minus!' });
  if (redeemDB[finalCode]) return res.status(400).json({ success: false, message: 'Kode sudah dipakai!' });

  const coinAmount = parseInt(coins, 10);
  if (!coinAmount || coinAmount <= 0) return res.status(400).json({ success: false, message: 'Jumlah koin harus positif!' });

  const maxUsesNum = maxUses ? parseInt(maxUses, 10) : 0;
  const expiresAt = expiresInHours ? Date.now() + (parseInt(expiresInHours, 10) * 60 * 60 * 1000) : null;

  redeemDB[finalCode] = {
    code: finalCode, coins: coinAmount, maxUses: maxUsesNum, usedBy: [],
    createdBy: req.user.username, createdAt: Date.now(), expiresAt
  };

  await syncRedeemToFirebase(finalCode);
  return res.json({ success: true, message: 'Kode redeem berhasil dibuat!', redeem: redeemDB[finalCode] });
});

app.get('/api/admin/redeem', requireAuth, requireAdmin, async (req, res) => {
  await loadRedeemsFromFirebase();
  return res.json({ success: true, redeems: Object.values(redeemDB).sort((a, b) => b.createdAt - a.createdAt) });
});

app.delete('/api/admin/redeem/:code', requireAuth, requireAdmin, async (req, res) => {
  await loadRedeemsFromFirebase();
  const code = req.params.code.toUpperCase();
  if (!redeemDB[code]) return res.status(404).json({ success: false, message: 'Kode redeem tidak ditemukan!' });
  delete redeemDB[code];
  await fbDelete(`redeems/${code}`);
  return res.json({ success: true, message: 'Kode redeem dihapus!' });
});

// ---------------- ADMIN: GIVE COIN & USERS ----------------
app.post('/api/admin/give-coin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { targetUsername, amount } = req.body;
    if (!targetUsername || !targetUsername.trim()) return res.status(400).json({ success: false, message: 'Username target wajib diisi!' });

    const coinAmount = parseInt(amount, 10);
    if (!coinAmount || coinAmount <= 0) return res.status(400).json({ success: false, message: 'Jumlah koin harus positif!' });

    const targetUser = usersDB.find(u => u.username.toLowerCase() === targetUsername.trim().toLowerCase());
    if (!targetUser) return res.status(404).json({ success: false, message: `User "${targetUsername}" tidak ditemukan!` });
    if (targetUser.role === 'admin') return res.status(400).json({ success: false, message: 'Admin sudah unlimited.' });

    targetUser.coins += coinAmount;
    await syncUserToFirebase(targetUser);
    return res.json({
      success: true,
      message: `Berhasil memberikan ${coinAmount} koin ke ${targetUser.username}!`,
      targetUser: { username: targetUser.username, coins: targetUser.coins }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Error sistem' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  await loadUsersFromFirebase();
  return res.json({
    success: true,
    users: usersDB.map(u => ({
      username: u.username, role: u.role,
      coins: u.coins === Infinity ? '∞' : u.coins
    }))
  });
});

// ---------------- ADMIN: TOGGLE SERVER ONLINE/OFFLINE ----------------
app.post('/api/admin/server/toggle', requireAuth, requireAdmin, async (req, res) => {
  const { online, message } = req.body;

  serverStatus.online = !!online;
  serverStatus.message = (message || '').trim() || (serverStatus.online ? 'Server sedang online' : 'Server sedang offline');
  serverStatus.updatedAt = Date.now();
  serverStatus.updatedBy = req.user.username;

  await syncServerStatusToFirebase();

  return res.json({
    success: true,
    message: serverStatus.online ? 'Server berhasil di-ONLINE-kan!' : 'Server berhasil di-OFFLINE-kan!',
    status: serverStatus
  });
});

app.get('/api/admin/server/status', requireAuth, requireAdmin, (req, res) => {
  return res.json({ success: true, status: serverStatus });
});

// ============================================================
// ============== PUBLIC STATUS PAGE ===========================
// ============================================================
app.get('/status', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cek Status Orderan - Suntik Sosmed</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,sans-serif;-webkit-tap-highlight-color:transparent}
  :root{
    --bg:#0a0e1a; --card:rgba(20,27,45,.75); --card-2:rgba(30,41,64,.6);
    --border:rgba(148,163,184,.12); --border-2:rgba(148,163,184,.2);
    --text:#f1f5f9; --text-2:#94a3b8; --text-3:#64748b;
    --cyan:#22d3ee; --green:#22c55e; --yellow:#eab308; --red:#ef4444;
    --grad-1:linear-gradient(135deg,#22d3ee 0%,#3b82f6 100%);
    --grad-2:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);
  }
  html,body{min-height:100vh}
  body{
    background:var(--bg); color:var(--text); font-size:14px; line-height:1.5;
    display:flex; justify-content:center; align-items:flex-start; padding:16px;
    position:relative; overflow-x:hidden;
  }
  body::before{
    content:''; position:fixed; inset:0; z-index:-1;
    background:
      radial-gradient(ellipse 60% 50% at 10% -10%, rgba(34,211,238,.18), transparent 60%),
      radial-gradient(ellipse 50% 50% at 100% 20%, rgba(168,85,247,.15), transparent 60%);
    pointer-events:none;
  }
  .shell{width:100%;max-width:560px;display:flex;flex-direction:column;gap:14px}
  .topbar{
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:14px 18px; background:var(--card); backdrop-filter:blur(20px);
    border:1px solid var(--border); border-radius:18px;
    box-shadow:0 8px 32px rgba(0,0,0,.4);
  }
  .brand{display:flex;align-items:center;gap:10px}
  .brand-logo{
    width:40px;height:40px;display:grid;place-items:center;border-radius:12px;
    background:var(--grad-1); font-size:20px;font-weight:900;color:#fff;
    box-shadow:0 6px 20px rgba(34,211,238,.4);
  }
  .brand-text h1{
    font-size:15px;font-weight:800;letter-spacing:-.3px;
    background:var(--grad-1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  }
  .brand-text p{font-size:10px;color:var(--text-3);font-weight:600;letter-spacing:.5px;text-transform:uppercase}
  .status-badge{
    display:inline-flex;align-items:center;gap:6px;
    padding:5px 10px;border-radius:20px;font-size:10px;font-weight:800;
    text-transform:uppercase;letter-spacing:.5px;
  }
  .status-badge.online{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
  .status-badge.offline{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35)}
  .status-badge::before{
    content:'';width:6px;height:6px;border-radius:50%;background:currentColor;
  }
  .card{
    background:var(--card); backdrop-filter:blur(20px);
    border:1px solid var(--border); border-radius:20px;
    padding:22px; box-shadow:0 8px 32px rgba(0,0,0,.4);
  }
  .offline-banner{
    background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3);
    color:#fca5a5; padding:14px 16px; border-radius:14px;
    margin-bottom:16px; display:none;
  }
  .offline-banner.show{display:block}
  .offline-banner-title{font-size:13px;font-weight:900;margin-bottom:4px;display:flex;align-items:center;gap:8px}
  .offline-banner-msg{font-size:11px;opacity:.9}
  .hero{text-align:center;margin-bottom:20px}
  .hero h2{font-size:20px;font-weight:900;letter-spacing:-.5px;margin-bottom:6px}
  .hero p{font-size:12px;color:var(--text-2);font-weight:500}
  .field{margin-bottom:14px}
  .field label{
    display:block;font-size:11px;color:var(--text-2);margin-bottom:7px;
    font-weight:700;letter-spacing:.6px;text-transform:uppercase;
  }
  .field input{
    width:100%;padding:13px 14px;border-radius:12px;
    border:1px solid var(--border-2);background:rgba(10,14,26,.6);
    color:var(--text);font-size:13.5px;font-weight:500;outline:none;
    transition:.2s;
  }
  .field input::placeholder{color:var(--text-3)}
  .field input:focus{
    border-color:var(--cyan);background:rgba(10,14,26,.9);
    box-shadow:0 0 0 4px rgba(34,211,238,.15);
  }
  .btn{
    width:100%;padding:14px;border-radius:13px;border:none;
    font-weight:800;font-size:13.5px;cursor:pointer;letter-spacing:.4px;
    display:inline-flex;align-items:center;justify-content:center;gap:8px;
    transition:.25s;text-transform:uppercase;
  }
  .btn-primary{background:var(--grad-1);color:#fff;box-shadow:0 10px 24px rgba(34,211,238,.35)}
  .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px rgba(34,211,238,.45)}
  .btn-primary:disabled{background:#334155;color:#64748b;cursor:not-allowed;box-shadow:none;transform:none}
  .result-card{
    margin-top:18px;padding:18px;border-radius:16px;display:none;
    animation:fadeUp .3s;border:1px solid;
  }
  .result-card.show{display:block}
  .result-card.waiting{background:rgba(234,179,8,.08);border-color:rgba(234,179,8,.3)}
  .result-card.success{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.3)}
  .result-card.failed{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3)}
  .result-card.error{background:rgba(148,163,184,.08);border-color:var(--border-2)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .status-icon{
    width:60px;height:60px;margin:0 auto 12px;display:grid;place-items:center;
    border-radius:16px;font-size:26px;font-weight:900;
  }
  .status-icon.waiting{background:rgba(234,179,8,.15);color:#fde047}
  .status-icon.success{background:rgba(34,197,94,.15);color:#4ade80}
  .status-icon.failed{background:rgba(239,68,68,.15);color:#f87171}
  .status-title{font-size:16px;font-weight:900;text-align:center;margin-bottom:6px}
  .status-sub{font-size:12px;text-align:center;color:var(--text-2);margin-bottom:14px}
  .li-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;font-size:12px}
  .li-row:last-child{margin-bottom:0}
  .li-label{color:var(--text-3);font-weight:600;flex-shrink:0}
  .li-value{color:var(--text);font-weight:600;text-align:right;word-break:break-word;min-width:0}
  .li-value.mono{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--cyan);font-size:11px}
  .pill{
    display:inline-flex;align-items:center;gap:4px;
    padding:4px 10px;border-radius:20px;font-size:10px;font-weight:800;
    text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;
  }
  .pill.waiting{background:rgba(234,179,8,.15);color:#fde047;border:1px solid rgba(234,179,8,.35)}
  .pill.success{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
  .pill.failed{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35)}
  .pill.progress{background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.35)}
  .toast-container{position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px}
  .toast{
    padding:13px 16px;border-radius:12px;background:rgba(20,27,45,.95);
    backdrop-filter:blur(20px);border:1px solid var(--border-2);
    color:var(--text);font-size:12.5px;font-weight:600;
    box-shadow:0 10px 30px rgba(0,0,0,.5); animation:slideIn .3s;
  }
  .toast.success{border-color:rgba(34,197,94,.4);color:#86efac}
  .toast.error{border-color:rgba(239,68,68,.4);color:#fca5a5}
  .toast.info{border-color:rgba(59,130,246,.4);color:#93c5fd}
  @keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
  .spinner{
    display:inline-block;width:14px;height:14px;
    border:2px solid rgba(255,255,255,.3);border-top-color:#fff;
    border-radius:50%;animation:spin .7s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  .back-link{text-align:center;margin-top:16px;font-size:12px}
  .back-link a{color:var(--cyan);text-decoration:none;font-weight:700}
  .back-link a:hover{text-decoration:underline}
  .auto-refresh{
    display:flex;align-items:center;justify-content:center;gap:6px;
    font-size:10px;color:var(--text-3);margin-top:12px;font-weight:600;
  }
  .auto-refresh .dot{
    width:6px;height:6px;border-radius:50%;background:var(--green);
    animation:pulse 2s infinite;
  }
  @keyframes pulse{
    0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}
    70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}
    100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}
  }
</style>
</head>
<body>

<div class="toast-container" id="toastContainer"></div>

<div class="shell">
  <div class="topbar">
    <div class="brand">
      <div class="brand-logo">S</div>
      <div class="brand-text">
        <h1>SUNTIK SOSMED</h1>
        <p>Cek Status Orderan</p>
      </div>
    </div>
    <div id="serverBadge" class="status-badge online">Online</div>
  </div>

  <div class="card">
    <div id="offlineBanner" class="offline-banner">
      <div class="offline-banner-title">⚠ Server Sedang Offline</div>
      <div class="offline-banner-msg" id="offlineBannerMsg">Layanan order sedang tidak tersedia. Lacak order tetap bisa digunakan.</div>
    </div>

    <div class="hero">
      <h2>Cek Status Orderan</h2>
      <p>Masukkan ID Order untuk melihat status terkini</p>
    </div>

    <div class="field">
      <label>ID Orderan</label>
      <input type="text" id="orderIdInput" placeholder="Contoh: ORD-1234567890-ABC" style="font-family:'JetBrains Mono',monospace">
    </div>
    <button class="btn btn-primary" id="btnCheck" onclick="checkStatus()">Cek Status</button>

    <div id="resultCard" class="result-card">
      <div id="resultIcon" class="status-icon"></div>
      <div id="resultTitle" class="status-title"></div>
      <div id="resultSub" class="status-sub"></div>
      <div id="resultDetails"></div>
      <div class="auto-refresh" id="autoRefreshInfo" style="display:none;">
        <div class="dot"></div>
        <span>Auto refresh setiap 15 detik</span>
      </div>
    </div>

    <div class="back-link">
      <a href="/">← Kembali ke Panel</a>
    </div>
  </div>
</div>

<script>
let currentOrderId=null;
let autoRefreshTimer=null;
let serverOnline=true;

function toast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  const el=document.createElement('div');
  el.className='toast '+type;
  el.innerHTML='<span>'+msg+'</span>';
  c.appendChild(el);
  setTimeout(()=>{el.style.transition='.3s';el.style.opacity='0';el.style.transform='translateX(120%)';setTimeout(()=>el.remove(),300)},3200);
}

async function checkServerStatus(){
  try{
    const res=await fetch('/api/server/status');
    const data=await res.json();
    serverOnline=data.online;
    const badge=document.getElementById('serverBadge');
    const banner=document.getElementById('offlineBanner');
    const bannerMsg=document.getElementById('offlineBannerMsg');
    if(serverOnline){
      badge.className='status-badge online';
      badge.textContent='Online';
      banner.classList.remove('show');
    }else{
      badge.className='status-badge offline';
      badge.textContent='Offline';
      banner.classList.add('show');
      bannerMsg.textContent=data.message||'Server sedang offline.';
    }
  }catch(e){}
}

function statusPill(status,progress){
  if(progress)return '<span class="pill progress">'+progress+'</span>';
  if(status==='selesai')return '<span class="pill success">Selesai</span>';
  if(status==='gagal')return '<span class="pill failed">Gagal</span>';
  return '<span class="pill waiting">Menunggu Antrian</span>';
}

function statusClass(status){
  if(status==='selesai')return 'success';
  if(status==='gagal')return 'failed';
  return 'waiting';
}

function statusIconText(status){
  if(status==='selesai')return '✓';
  if(status==='gagal')return '✕';
  return '⏳';
}

async function checkStatus(){
  const input=document.getElementById('orderIdInput');
  const orderId=input.value.trim();
  if(!orderId){toast('Masukkan ID Orderan','error');return;}

  const btn=document.getElementById('btnCheck');
  const original=btn.textContent;
  btn.disabled=true;
  btn.innerHTML='<span class="spinner"></span> Mencari...';

  try{
    const res=await fetch('/api/public/orders/'+encodeURIComponent(orderId));
    const data=await res.json();
    if(data.success&&data.order){
      currentOrderId=orderId;
      renderResult(data.order);
      window.location.hash='order='+encodeURIComponent(orderId);
      startAutoRefresh();
    }else{
      showError(data.message||'Orderan tidak ditemukan');
    }
  }catch(err){
    showError('Gagal terhubung ke server');
  }finally{
    btn.disabled=false;
    btn.textContent=original;
  }
}

function showError(msg){
  const card=document.getElementById('resultCard');
  card.className='result-card show error';
  document.getElementById('resultIcon').className='status-icon failed';
  document.getElementById('resultIcon').textContent='!';
  document.getElementById('resultTitle').textContent='Tidak Ditemukan';
  document.getElementById('resultSub').textContent=msg;
  document.getElementById('resultDetails').innerHTML='';
  document.getElementById('autoRefreshInfo').style.display='none';
  stopAutoRefresh();
}

function renderResult(o){
  const card=document.getElementById('resultCard');
  const cls=statusClass(o.status);
  card.className='result-card show '+cls;

  document.getElementById('resultIcon').className='status-icon '+cls;
  document.getElementById('resultIcon').textContent=statusIconText(o.status);

  let title='', sub='';
  if(o.status==='selesai'){title='Orderan Selesai';sub='Orderan telah berhasil diproses';}
  else if(o.status==='gagal'){title='Orderan Gagal';sub='Orderan tidak dapat diproses';}
  else{title='Sedang Menunggu Antrian';sub='Orderan sedang dalam proses';}

  document.getElementById('resultTitle').textContent=title;
  document.getElementById('resultSub').textContent=sub;

  const date=new Date(o.createdAt).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const updated=o.updatedAt?new Date(o.updatedAt).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';

  let html='';
  html+='<div class="li-row"><span class="li-label">ID Order</span><span class="li-value mono">'+o.orderId+'</span></div>';
  if(o.username)html+='<div class="li-row"><span class="li-label">Pemesan</span><span class="li-value">'+o.username+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Layanan</span><span class="li-value">'+(o.serviceName||o.service)+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Target</span><span class="li-value" style="font-size:11px">'+o.target+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Jumlah</span><span class="li-value">'+o.jumlah+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Status</span><span class="li-value">'+statusPill(o.status,o.progress)+'</span></div>';
  if(o.message)html+='<div class="li-row"><span class="li-label">Pesan</span><span class="li-value" style="font-size:11px">'+o.message+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Dibuat</span><span class="li-value" style="font-size:11px;color:var(--text-3)">'+date+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Update Terakhir</span><span class="li-value" style="font-size:11px;color:var(--text-3)">'+updated+'</span></div>';

  document.getElementById('resultDetails').innerHTML=html;
  if(o.status!=='selesai'&&o.status!=='gagal'){
    document.getElementById('autoRefreshInfo').style.display='flex';
  }else{
    document.getElementById('autoRefreshInfo').style.display='none';
  }
}

function startAutoRefresh(){
  stopAutoRefresh();
  autoRefreshTimer=setInterval(()=>{
    if(currentOrderId){
      fetch('/api/public/orders/'+encodeURIComponent(currentOrderId))
        .then(r=>r.json())
        .then(data=>{
          if(data.success&&data.order){
            renderResult(data.order);
            if(data.order.status==='selesai'||data.order.status==='gagal'){
              stopAutoRefresh();
              toast('Status orderan diperbarui: '+data.order.status,'info');
            }
          }
        })
        .catch(()=>{});
    }
  },15000);
}
function stopAutoRefresh(){
  if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
}

window.addEventListener('load',()=>{
  checkServerStatus();
  setInterval(checkServerStatus,20000);
  const hash=window.location.hash;
  if(hash&&hash.startsWith('#order=')){
    const orderId=decodeURIComponent(hash.slice(7));
    document.getElementById('orderIdInput').value=orderId;
    checkStatus();
  }
});

document.getElementById('orderIdInput').addEventListener('keydown',e=>{
  if(e.key==='Enter')checkStatus();
});
</script>
</body>
</html>`);
});

// ============================================================
// ============== DASHBOARD WEBPAGE ===========================
// ============================================================
app.get('/', async (req, res) => {
  await loadUsersFromFirebase();
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Suntik Sosmed Free - Panel Premium</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,sans-serif;-webkit-tap-highlight-color:transparent}
  :root{
    --bg:#0a0e1a; --card:rgba(20,27,45,.75); --card-2:rgba(30,41,64,.6);
    --border:rgba(148,163,184,.12); --border-2:rgba(148,163,184,.2);
    --text:#f1f5f9; --text-2:#94a3b8; --text-3:#64748b;
    --cyan:#22d3ee; --blue:#3b82f6; --purple:#a855f7;
    --green:#22c55e; --yellow:#eab308; --red:#ef4444; --orange:#f97316;
    --grad-1:linear-gradient(135deg,#22d3ee 0%,#3b82f6 100%);
    --grad-2:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);
    --grad-3:linear-gradient(135deg,#f59e0b 0%,#f97316 100%);
  }
  html,body{min-height:100vh}
  body{
    background:var(--bg); color:var(--text); font-size:14px; line-height:1.5;
    display:flex; justify-content:center; align-items:flex-start; padding:16px;
    position:relative; overflow-x:hidden;
  }
  body::before{
    content:''; position:fixed; inset:0; z-index:-1;
    background:
      radial-gradient(ellipse 60% 50% at 10% -10%, rgba(34,211,238,.18), transparent 60%),
      radial-gradient(ellipse 50% 50% at 100% 20%, rgba(168,85,247,.15), transparent 60%),
      radial-gradient(ellipse 50% 50% at 50% 110%, rgba(59,130,246,.12), transparent 60%);
    pointer-events:none;
  }
  body::after{
    content:''; position:fixed; inset:0; z-index:-1;
    background-image:
      linear-gradient(rgba(148,163,184,.03) 1px,transparent 1px),
      linear-gradient(90deg,rgba(148,163,184,.03) 1px,transparent 1px);
    background-size:40px 40px; pointer-events:none;
    mask-image:radial-gradient(ellipse at center,black,transparent 80%);
  }
  .shell{width:100%;max-width:560px;display:flex;flex-direction:column;gap:14px}
  .topbar{
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:14px 18px; background:var(--card); backdrop-filter:blur(20px);
    border:1px solid var(--border); border-radius:18px;
    box-shadow:0 8px 32px rgba(0,0,0,.4);
  }
  .brand{display:flex;align-items:center;gap:10px}
  .brand-logo{
    width:40px;height:40px;display:grid;place-items:center;border-radius:12px;
    background:var(--grad-1); font-size:20px;font-weight:900;color:#fff;
    box-shadow:0 6px 20px rgba(34,211,238,.4);
    position:relative;overflow:hidden;
  }
  .brand-logo::after{
    content:'';position:absolute;inset:0;
    background:linear-gradient(135deg,rgba(255,255,255,.3),transparent 50%);
  }
  .brand-text h1{
    font-size:15px;font-weight:800;letter-spacing:-.3px;
    background:var(--grad-1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  }
  .brand-text p{font-size:10px;color:var(--text-3);font-weight:600;letter-spacing:.5px;text-transform:uppercase}

  .server-status-badge{
    display:inline-flex;align-items:center;gap:5px;
    padding:5px 10px;border-radius:20px;font-size:9px;font-weight:800;
    text-transform:uppercase;letter-spacing:.5px;
  }
  .server-status-badge.online{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
  .server-status-badge.offline{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35)}
  .server-status-badge::before{
    content:'';width:6px;height:6px;border-radius:50%;background:currentColor;
    animation:pulse 2s infinite;
  }
  @keyframes pulse{
    0%{box-shadow:0 0 0 0 currentColor;opacity:1}
    70%{box-shadow:0 0 0 6px transparent;opacity:.5}
    100%{box-shadow:0 0 0 0 transparent;opacity:1}
  }

  .global-offline-banner{
    background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.35);
    color:#fca5a5; padding:14px 16px; border-radius:14px;
    display:none; align-items:center;gap:10px;
  }
  .global-offline-banner.show{display:flex}
  .global-offline-banner .icon{
    width:36px;height:36px;border-radius:10px;
    background:rgba(239,68,68,.2);display:grid;place-items:center;
    font-size:18px;flex-shrink:0;
  }
  .global-offline-banner .text{flex:1;min-width:0}
  .global-offline-banner .title{font-size:12px;font-weight:900;margin-bottom:2px}
  .global-offline-banner .msg{font-size:10px;opacity:.9;word-break:break-word}
  .global-offline-banner.admin-view{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35);color:#fcd34d}
  .global-offline-banner.admin-view .icon{background:rgba(245,158,11,.2)}

  .card{
    background:var(--card); backdrop-filter:blur(20px);
    border:1px solid var(--border); border-radius:20px;
    padding:22px; box-shadow:0 8px 32px rgba(0,0,0,.4);
  }
  .auth-hero{text-align:center;margin-bottom:24px}
  .auth-hero h2{font-size:22px;font-weight:900;letter-spacing:-.5px;margin-bottom:6px}
  .auth-hero p{font-size:12px;color:var(--text-2);font-weight:500}

  .login-offline-banner{
    background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.35);
    color:#fca5a5; padding:14px; border-radius:12px;
    margin-bottom:18px; display:none;
  }
  .login-offline-banner.show{display:block}
  .login-offline-banner .title{font-size:12px;font-weight:900;margin-bottom:4px}
  .login-offline-banner .msg{font-size:11px;opacity:.9}

  .seg{
    display:flex;background:rgba(10,14,26,.7);padding:5px;border-radius:14px;
    border:1px solid var(--border);margin-bottom:20px;
  }
  .seg button{
    flex:1;padding:11px;border:none;background:transparent;color:var(--text-2);
    font-weight:700;font-size:12px;cursor:pointer;border-radius:10px;
    transition:.25s;letter-spacing:.5px;text-transform:uppercase;
  }
  .seg button.active{
    background:var(--grad-1);color:#fff;
    box-shadow:0 6px 18px rgba(34,211,238,.35);
  }
  .field{margin-bottom:14px}
  .field label{
    display:block;font-size:11px;color:var(--text-2);margin-bottom:7px;
    font-weight:700;letter-spacing:.6px;text-transform:uppercase;
  }
  .field .input-wrap{position:relative}
  .field input,.field select{
    width:100%;padding:13px 14px;border-radius:12px;
    border:1px solid var(--border-2);background:rgba(10,14,26,.6);
    color:var(--text);font-size:13.5px;font-weight:500;outline:none;
    transition:.2s;
  }
  .field input::placeholder{color:var(--text-3)}
  .field input:focus,.field select:focus{
    border-color:var(--cyan);background:rgba(10,14,26,.9);
    box-shadow:0 0 0 4px rgba(34,211,238,.15);
  }
  .field select{cursor:pointer;appearance:none}
  .btn{
    width:100%;padding:14px;border-radius:13px;border:none;
    font-weight:800;font-size:13.5px;cursor:pointer;letter-spacing:.4px;
    display:inline-flex;align-items:center;justify-content:center;gap:8px;
    transition:.25s;text-transform:uppercase;
  }
  .btn-primary{background:var(--grad-1);color:#fff;box-shadow:0 10px 24px rgba(34,211,238,.35)}
  .btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px rgba(34,211,238,.45)}
  .btn-primary:disabled{background:#334155;color:#64748b;cursor:not-allowed;box-shadow:none;transform:none}
  .btn-purple{background:var(--grad-2);color:#fff;box-shadow:0 10px 24px rgba(168,85,247,.35)}
  .btn-purple:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(168,85,247,.45)}
  .btn-green{background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);color:#fff;box-shadow:0 10px 24px rgba(34,197,94,.35)}
  .btn-green:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px rgba(34,197,94,.45)}
  .btn-red{background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:#fff;box-shadow:0 10px 24px rgba(239,68,68,.35)}
  .btn-red:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px rgba(239,68,68,.45)}
  .btn-ghost{
    background:rgba(148,163,184,.08);color:var(--text-2);
    border:1px solid var(--border-2);font-weight:700;font-size:12px;
    padding:9px 14px;border-radius:10px;cursor:pointer;transition:.2s;
    width:auto;text-transform:none;letter-spacing:0;
  }
  .btn-ghost:hover{background:rgba(148,163,184,.15);color:var(--text)}
  .btn-danger-sm{
    background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);
    color:#fca5a5;padding:7px 12px;font-size:11px;border-radius:9px;
    font-weight:700;cursor:pointer;transition:.2s;text-transform:none;letter-spacing:0;
  }
  .btn-danger-sm:hover{background:var(--red);color:#fff}
  .btn-green-sm{
    background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);
    color:#86efac;padding:7px 12px;font-size:11px;border-radius:9px;
    font-weight:700;cursor:pointer;transition:.2s;text-transform:none;letter-spacing:0;
  }
  .btn-green-sm:hover{background:var(--green);color:#fff}
  .user-bar{
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:16px 18px;background:var(--card-2);border-radius:16px;
    border:1px solid var(--border);
  }
  .user-info{display:flex;align-items:center;gap:12px;min-width:0}
  .avatar{
    width:44px;height:44px;border-radius:13px;display:grid;place-items:center;
    font-size:18px;font-weight:900;color:#fff;flex-shrink:0;
    background:var(--grad-2);box-shadow:0 6px 18px rgba(168,85,247,.35);
  }
  .avatar.admin{background:var(--grad-3);box-shadow:0 6px 18px rgba(245,158,11,.35)}
  .user-meta{min-width:0}
  .user-name{
    font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  }
  .tag-admin{
    background:var(--grad-3);color:#fff;padding:2px 7px;border-radius:6px;
    font-size:9px;font-weight:900;letter-spacing:.6px;
  }
  .coin-chip{
    display:inline-flex;align-items:center;gap:5px;
    background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;
    padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;
    margin-top:4px;box-shadow:0 3px 10px rgba(245,158,11,.35);
  }
  .nav-tabs{
    display:grid;grid-template-columns:repeat(4,1fr);gap:6px;
    background:var(--card-2);padding:6px;border-radius:16px;
    border:1px solid var(--border);
  }
  .nav-tabs button{
    padding:11px 6px;border:none;background:transparent;color:var(--text-3);
    font-weight:700;font-size:11px;cursor:pointer;border-radius:11px;
    transition:.25s;display:flex;flex-direction:column;align-items:center;gap:3px;
    letter-spacing:.3px;
  }
  .nav-tabs button.active{
    background:var(--grad-1);color:#fff;
    box-shadow:0 6px 18px rgba(34,211,238,.35);
  }
  .panel{display:none;animation:fadeUp .3s}
  .panel.active{display:block}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .section-title{
    display:flex;align-items:center;gap:8px;
    font-size:12px;font-weight:800;color:var(--text-2);
    text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;
  }
  .section-title::before{
    content:'';width:4px;height:14px;border-radius:2px;background:var(--grad-1);
  }
  .result-box{
    margin-top:16px;padding:16px;border-radius:14px;display:none;
    animation:fadeUp .3s;border:1px solid;
  }
  .result-box.show{display:block}
  .result-box.success{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.3);color:#86efac}
  .result-box.pending{background:rgba(234,179,8,.08);border-color:rgba(234,179,8,.3);color:#fde047}
  .result-box.failed{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#fca5a5}
  .result-title{font-size:14px;font-weight:900;margin-bottom:6px}
  .result-msg{font-size:12px;line-height:1.5;word-break:break-word;opacity:.9}
  .order-id-display{
    margin-top:12px;padding:14px;border-radius:12px;
    background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.3);
    text-align:center;
  }
  .order-id-label{font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .order-id-value{
    font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:900;
    color:var(--cyan);letter-spacing:1px;word-break:break-all;user-select:all;
    cursor:pointer;
  }
  .order-id-hint{font-size:10px;color:var(--text-3);margin-top:6px}
  .quick-search{
    display:flex;gap:8px;margin-top:14px;
    padding-top:14px;border-top:1px dashed var(--border-2);
  }
  .quick-search input{flex:1}
  .list-item{
    background:var(--card-2);border:1px solid var(--border);
    border-radius:14px;padding:14px;margin-bottom:10px;
    transition:.2s;
  }
  .list-item:hover{border-color:var(--border-2);background:rgba(30,41,64,.8)}
  .list-item.highlight{
    border-color:var(--cyan);
    box-shadow:0 0 0 2px rgba(34,211,238,.25);
    animation:highlightPulse 1.5s ease-out;
  }
  @keyframes highlightPulse{
    0%{background:rgba(34,211,238,.2)}
    100%{background:var(--card-2)}
  }
  .li-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:5px;font-size:12px}
  .li-row:last-child{margin-bottom:0}
  .li-label{color:var(--text-3);font-weight:600;flex-shrink:0}
  .li-value{color:var(--text);font-weight:600;text-align:right;word-break:break-word;min-width:0}
  .li-value.mono{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--cyan);font-size:11px}
  .li-value.target{font-size:11px;color:var(--text-2);font-weight:500}
  .pill{
    display:inline-flex;align-items:center;gap:4px;
    padding:4px 10px;border-radius:20px;font-size:10px;font-weight:800;
    text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;
  }
  .pill.waiting{background:rgba(234,179,8,.15);color:#fde047;border:1px solid rgba(234,179,8,.35)}
  .pill.success{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.35)}
  .pill.failed{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35)}
  .pill.progress{background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.35)}
  .empty{
    text-align:center;padding:36px 20px;color:var(--text-3);
    font-size:12px;background:rgba(15,21,36,.5);border-radius:14px;
    border:1px dashed var(--border-2);
  }
  .code-chip{
    display:inline-flex;align-items:center;gap:6px;
    background:var(--grad-2);color:#fff;padding:7px 12px;border-radius:9px;
    font-weight:800;font-size:12.5px;letter-spacing:1px;cursor:pointer;
    font-family:'JetBrains Mono',monospace;user-select:all;
    box-shadow:0 5px 15px rgba(168,85,247,.3);
    transition:.2s;
  }
  .code-chip:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(168,85,247,.45)}
  .toast-container{position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px}
  .toast{
    padding:13px 16px;border-radius:12px;background:rgba(20,27,45,.95);
    backdrop-filter:blur(20px);border:1px solid var(--border-2);
    color:var(--text);font-size:12.5px;font-weight:600;
    box-shadow:0 10px 30px rgba(0,0,0,.5);
    animation:slideIn .3s;
    display:flex;align-items:center;gap:10px;
  }
  .toast.success{border-color:rgba(34,197,94,.4);color:#86efac}
  .toast.error{border-color:rgba(239,68,68,.4);color:#fca5a5}
  .toast.info{border-color:rgba(59,130,246,.4);color:#93c5fd}
  @keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
  .admin-section{
    background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.2);
    border-radius:14px;padding:16px;margin-bottom:18px;
  }
  .admin-section .section-title{color:#fcd34d}
  .admin-section .section-title::before{background:var(--grad-3)}
  .server-control{
    background:linear-gradient(135deg,rgba(34,211,238,.06),rgba(168,85,247,.06));
    border:1px solid rgba(34,211,238,.3);
  }
  .server-control .section-title{color:var(--cyan)}
  .server-control .section-title::before{background:var(--grad-1)}
  .server-big-status{
    text-align:center;padding:16px;border-radius:14px;
    margin-bottom:16px;border:1px solid;
  }
  .server-big-status.online{
    background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.4);
  }
  .server-big-status.offline{
    background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.4);
  }
  .server-big-icon{font-size:36px;margin-bottom:6px}
  .server-big-title{font-size:18px;font-weight:900;letter-spacing:1px;text-transform:uppercase}
  .server-big-title.online{color:#4ade80}
  .server-big-title.offline{color:#f87171}
  .server-big-sub{font-size:11px;color:var(--text-2);margin-top:4px}
  .server-big-meta{font-size:10px;color:var(--text-3);margin-top:8px}
  .filter-bar{display:flex;gap:8px;margin-bottom:12px}
  .filter-bar input{flex:1}
  .spinner{
    display:inline-block;width:14px;height:14px;
    border:2px solid rgba(255,255,255,.3);border-top-color:#fff;
    border-radius:50%;animation:spin .7s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  .track-link{
    display:inline-flex;align-items:center;gap:6px;
    background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);
    color:#86efac;padding:7px 12px;border-radius:9px;
    font-weight:700;font-size:11px;text-decoration:none;transition:.2s;
  }
  .track-link:hover{background:var(--green);color:#fff}
  @media (max-width:480px){
    body{padding:10px}
    .card{padding:18px}
    .nav-tabs button{font-size:10px;padding:9px 4px}
    .order-id-value{font-size:13px}
  }
</style>
</head>
<body>

<div class="toast-container" id="toastContainer"></div>

<div class="shell">

  <div class="topbar">
    <div class="brand">
      <div class="brand-logo">S</div>
      <div class="brand-text">
        <h1>SUNTIK SOSMED</h1>
        <p>Free &amp; Aman</p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <div id="serverBadge" class="server-status-badge online">Online</div>
      <a href="/status" class="track-link" style="padding:5px 9px;font-size:10px;">🔍</a>
    </div>
  </div>

  <!-- GLOBAL OFFLINE BANNER -->
  <div id="globalOfflineBanner" class="global-offline-banner">
    <div class="icon">⚠</div>
    <div class="text">
      <div class="title" id="globalOfflineTitle">Server Sedang Offline</div>
      <div class="msg" id="globalOfflineMsg">Layanan order sedang tidak tersedia.</div>
    </div>
  </div>

  <!-- AUTH -->
  <div class="card" id="authSection">
    <div id="loginOfflineBanner" class="login-offline-banner">
      <div class="title">⚠ Server Sedang Offline</div>
      <div class="msg" id="loginOfflineMsg">Login user ditutup sementara. Silakan coba lagi nanti.</div>
    </div>
    <div class="auth-hero">
      <h2>Selamat Datang</h2>
      <p>Login atau daftar untuk mulai order</p>
    </div>
    <div class="seg">
      <button class="active" id="tabLoginBtn" onclick="switchAuthMode('login')">Login</button>
      <button id="tabRegisterBtn" onclick="switchAuthMode('register')">Register</button>
    </div>
    <form id="authForm">
      <div class="field">
        <label>Username</label>
        <div class="input-wrap">
          <input type="text" id="authUsername" placeholder="Masukkan username" required>
        </div>
      </div>
      <div class="field">
        <label>Password</label>
        <div class="input-wrap">
          <input type="password" id="authPassword" placeholder="••••••••" required>
        </div>
      </div>
      <button type="submit" class="btn btn-primary" id="btnAuthSubmit">Masuk Ke Panel</button>
    </form>
    <div style="text-align:center;margin-top:14px;font-size:11px;color:var(--text-3);">
      <a href="/status" style="color:var(--cyan);text-decoration:none;font-weight:700;">Lacak orderan tanpa login →</a>
    </div>
  </div>

  <!-- APP -->
  <div id="appSection" style="display:none;display:flex;flex-direction:column;gap:14px;">

    <div class="card" style="padding:16px 18px;">
      <div class="user-bar" style="background:transparent;border:none;padding:0;">
        <div class="user-info">
          <div class="avatar" id="userAvatar">U</div>
          <div class="user-meta">
            <div class="user-name">
              <span id="loggedInUser"></span>
              <span id="adminBadge" style="display:none" class="tag-admin">ADMIN</span>
            </div>
            <div class="coin-chip" id="coinBalance">1 Koin</div>
          </div>
        </div>
        <button onclick="logout()" class="btn-danger-sm">Logout</button>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="active" data-tab="order" onclick="switchTab('order')">Order</button>
      <button data-tab="orders" onclick="switchTab('orders')">Status</button>
      <button data-tab="redeem" onclick="switchTab('redeem')">Redeem</button>
      <button data-tab="admin" id="tabAdminBtn" style="display:none" onclick="switchTab('admin')">Admin</button>
    </div>

    <!-- TAB ORDER -->
    <div class="card panel active" id="tab-order">
      <form id="orderForm">
        <div class="field">
          <label>Platform</label>
          <div class="input-wrap">
            <select id="category" onchange="updateServices()" required>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Layanan Gratis</label>
          <div class="input-wrap">
            <select id="serviceVersion" required></select>
          </div>
        </div>
        <div class="field">
          <label>URL / Username Target</label>
          <div class="input-wrap">
            <input type="text" id="targetUrl" placeholder="https://instagram.com/..." required>
          </div>
        </div>
        <div class="field">
          <label>Jumlah</label>
          <div class="input-wrap">
            <input type="number" id="jumlah" value="20" min="1" required>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" id="btnSubmit">Kirim Orderan</button>
      </form>

      <div id="statusBox" class="result-box">
        <div id="statusTitle" class="result-title"></div>
        <div id="statusDetail" class="result-msg"></div>
      </div>

      <div id="orderIdDisplay" class="order-id-display" style="display:none;">
        <div class="order-id-label">ID Orderan Kamu</div>
        <div class="order-id-value" id="orderIdValue" onclick="copyOrderId()" title="Klik untuk copy"></div>
        <div class="order-id-hint">Klik ID untuk copy • Tersimpan di URL sebagai bookmark</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn-green-sm" style="flex:1;" onclick="goToOrderStatus()">Cek Status Order</button>
          <button class="btn-ghost" style="flex:1;" onclick="copyOrderId()">Copy ID</button>
        </div>
      </div>

      <div class="quick-search">
        <div class="input-wrap" style="flex:1">
          <input type="text" id="quickSearchId" placeholder="Cari ID order... (contoh: ORD-...)" onkeydown="if(event.key==='Enter')quickSearch()">
        </div>
        <button type="button" class="btn-ghost" onclick="quickSearch()">Cari</button>
      </div>
    </div>

    <!-- TAB ORDERS -->
    <div class="card panel" id="tab-orders">
      <div class="section-title">Status Orderan Saya</div>
      <div class="filter-bar">
        <div class="input-wrap" style="flex:1">
          <input type="text" id="searchOrderId" placeholder="Cari ID order..." oninput="renderMyOrders()">
        </div>
        <button class="btn-ghost" onclick="loadMyOrders()">Refresh</button>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-bottom:12px;text-align:center;">
        Status diperbarui otomatis dari server
      </div>
      <div id="myOrdersList"><div class="empty">Memuat...</div></div>
    </div>

    <!-- TAB REDEEM -->
    <div class="card panel" id="tab-redeem">
      <div class="section-title">Klaim Kode Redeem</div>
      <div class="field">
        <label>Kode Redeem</label>
        <div class="input-wrap">
          <input type="text" id="redeemInput" placeholder="CONTOH: FREE-ABCD1234" style="text-transform:uppercase">
        </div>
      </div>
      <button class="btn btn-purple" onclick="claimRedeem()">Klaim Sekarang</button>

      <div class="section-title" style="margin-top:24px;">Kode Aktif</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <button class="btn-ghost" onclick="loadActiveRedeems()">Refresh</button>
      </div>
      <div id="activeRedeemList"><div class="empty">Memuat...</div></div>
    </div>

    <!-- TAB ADMIN -->
    <div class="card panel" id="tab-admin">

      <!-- SERVER CONTROL -->
      <div class="admin-section server-control">
        <div class="section-title">Server Control</div>

        <div class="server-big-status online" id="serverBigStatus">
          <div class="server-big-icon" id="serverBigIcon">🟢</div>
          <div class="server-big-title online" id="serverBigTitle">ONLINE</div>
          <div class="server-big-sub" id="serverBigSub">Server sedang online</div>
          <div class="server-big-meta" id="serverBigMeta">-</div>
        </div>

        <div class="field">
          <label>Pesan Offline (opsional)</label>
          <div class="input-wrap">
            <input type="text" id="offlineMessageInput" placeholder="Contoh: Maintenance hingga 20:00 WIB">
          </div>
        </div>

        <div style="display:flex;gap:8px;">
          <button class="btn btn-green" id="btnServerOn" style="flex:1;padding:12px;font-size:12px;" onclick="toggleServer(true)">Onlinekan</button>
          <button class="btn btn-red" id="btnServerOff" style="flex:1;padding:12px;font-size:12px;" onclick="toggleServer(false)">Offlinekan</button>
        </div>

        <div style="font-size:10px;color:var(--text-3);margin-top:10px;text-align:center;">
          Status tersimpan permanen. Refresh web tidak akan mengubah status.
        </div>
      </div>

      <div class="admin-section">
        <div class="section-title">Beri Koin ke User</div>
        <div class="field">
          <div class="input-wrap">
            <input type="text" id="giveCoinUsername" placeholder="Username tujuan">
          </div>
        </div>
        <div class="field">
          <div class="input-wrap">
            <input type="number" id="giveCoinAmount" placeholder="Jumlah koin" min="1" value="1">
          </div>
        </div>
        <button class="btn btn-primary" onclick="adminGiveCoin()">Kirim Koin</button>
      </div>

      <div class="admin-section">
        <div class="section-title">Buat Kode Redeem</div>
        <div class="field">
          <div class="input-wrap">
            <input type="text" id="newRedeemCode" placeholder="Kode (kosong = auto)">
          </div>
        </div>
        <div class="field">
          <div class="input-wrap">
            <input type="number" id="newRedeemCoins" placeholder="Jumlah koin" min="1" value="1">
          </div>
        </div>
        <div class="field">
          <div class="input-wrap">
            <input type="number" id="newRedeemMaxUses" placeholder="Max pemakaian (0 = unlimited)" min="0" value="0">
          </div>
        </div>
        <div class="field">
          <div class="input-wrap">
            <input type="number" id="newRedeemExpires" placeholder="Expired dalam jam (kosong = tidak expired)" min="0">
          </div>
        </div>
        <button class="btn btn-primary" onclick="adminCreateRedeem()">Buat Kode</button>
      </div>

      <div class="section-title">Daftar Kode Redeem</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <button class="btn-ghost" onclick="loadAdminRedeems()">Refresh</button>
      </div>
      <div id="adminRedeemList"><div class="empty">Memuat...</div></div>

      <div class="section-title" style="margin-top:24px;">Semua Orderan User</div>
      <div class="filter-bar">
        <div class="input-wrap" style="flex:1">
          <input type="text" id="adminOrderFilter" placeholder="Filter username / ID..." oninput="renderAdminOrders()">
        </div>
        <button class="btn-ghost" onclick="loadAdminOrders()">Refresh</button>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-bottom:12px;text-align:center;">
        Status order otomatis dari server
      </div>
      <div id="adminOrdersList"><div class="empty">Memuat...</div></div>
    </div>
  </div>
</div>

<script>
let authMode='login';
let servicesData={};
let currentUser=null;
let myOrdersCache=[];
let adminOrdersCache=[];
let autoRefreshInterval=null;
let lastOrderId=null;
let serverOnline=true;
let serverMessage='';
let serverStatusTimer=null;

function toast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  const el=document.createElement('div');
  el.className='toast '+type;
  el.innerHTML='<span>'+msg+'</span>';
  c.appendChild(el);
  setTimeout(()=>{el.style.transition='.3s';el.style.opacity='0';el.style.transform='translateX(120%)';setTimeout(()=>el.remove(),300)},3200);
}

function switchAuthMode(mode){
  authMode=mode;
  document.getElementById('tabLoginBtn').className=mode==='login'?'active':'';
  document.getElementById('tabRegisterBtn').className=mode==='register'?'active':'';
  document.getElementById('btnAuthSubmit').textContent=mode==='login'?'Masuk Ke Panel':'Daftar Akun Baru';
}

function switchTab(name){
  document.querySelectorAll('.panel').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelectorAll('.nav-tabs button').forEach(el=>{
    if(el.dataset.tab===name)el.classList.add('active');else el.classList.remove('active');
  });
  if(name==='orders'){loadMyOrders();startAutoRefresh();}else{stopAutoRefresh();}
  if(name==='redeem'){loadActiveRedeems();}
  if(name==='admin'){loadAdminRedeems();loadAdminOrders();loadServerStatus();}
  if(name==='order')stopAutoRefresh();
}

function startAutoRefresh(){
  stopAutoRefresh();
  autoRefreshInterval=setInterval(()=>{
    const active=document.querySelector('.panel.active');
    if(!active)return;
    if(active.id==='tab-orders')loadMyOrders(true);
  },15000);
}
function stopAutoRefresh(){
  if(autoRefreshInterval){clearInterval(autoRefreshInterval);autoRefreshInterval=null;}
}

function authHeaders(extra={}){
  const token=localStorage.getItem('authToken');
  return token?{...extra,'Authorization':'Bearer '+token}:extra;
}

// ============ SERVER STATUS ============
async function fetchServerStatus(){
  try{
    const res=await fetch('/api/server/status');
    const data=await res.json();
    const wasOnline=serverOnline;
    serverOnline=data.online;
    serverMessage=data.message||'';
    updateServerUI();
    if(wasOnline && !serverOnline && currentUser && currentUser.role!=='admin'){
      toast('Server telah di-OFFLINE-kan oleh admin. Anda otomatis logout.','error');
      setTimeout(()=>{clearToken();location.reload();},2000);
    }
  }catch(e){}
}

function updateServerUI(){
  const badge=document.getElementById('serverBadge');
  const banner=document.getElementById('globalOfflineBanner');
  const bannerTitle=document.getElementById('globalOfflineTitle');
  const bannerMsg=document.getElementById('globalOfflineMsg');
  const isAdmin=currentUser&&currentUser.role==='admin';

  if(serverOnline){
    badge.className='server-status-badge online';
    badge.textContent='Online';
    banner.classList.remove('show');
  }else{
    badge.className='server-status-badge offline';
    badge.textContent='Offline';
    banner.classList.add('show');
    if(isAdmin){
      banner.classList.add('admin-view');
      bannerTitle.textContent='Server Sedang Offline (Mode Admin)';
      bannerMsg.textContent=(serverMessage||'Server sedang offline.')+' Anda tetap bisa menggunakan semua fitur sebagai admin.';
    }else{
      banner.classList.remove('admin-view');
      bannerTitle.textContent='Server Sedang Offline';
      bannerMsg.textContent=serverMessage||'Layanan order sedang tidak tersedia.';
    }
  }

  const loginBanner=document.getElementById('loginOfflineBanner');
  const loginMsg=document.getElementById('loginOfflineMsg');
  if(!serverOnline){
    loginBanner.classList.add('show');
    loginMsg.textContent=serverMessage||'Login user ditutup sementara. Silakan coba lagi nanti.';
  }else{
    loginBanner.classList.remove('show');
  }

  const btnSubmit=document.getElementById('btnSubmit');
  if(btnSubmit){
    if(!serverOnline&&!isAdmin){
      btnSubmit.disabled=true;
      btnSubmit.textContent='Server Offline';
    }else if(currentUser){
      if(currentUser.role!=='admin'&&currentUser.coins<=0){
        btnSubmit.disabled=true;
        btnSubmit.textContent='Kirim Orderan';
      }else{
        btnSubmit.disabled=false;
        btnSubmit.textContent='Kirim Orderan';
      }
    }
  }
}

// ============ AUTH (AUTO LOGIN 30 HARI) ============
function saveTokenWithExpiry(token) {
  localStorage.setItem('authToken', token);
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  localStorage.setItem('authTokenExpiry', expiry.toString());
}
function isTokenValid() {
  const token = localStorage.getItem('authToken');
  const expiry = localStorage.getItem('authTokenExpiry');
  if (!token || !expiry) return false;
  return Date.now() < parseInt(expiry, 10);
}
function clearToken() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authTokenExpiry');
}

async function checkAuth(){
  if (!isTokenValid()) {
    clearToken();
    document.getElementById('authSection').style.display='block';
    document.getElementById('appSection').style.display='none';
    return;
  }

  try{
    const res=await fetch('/api/me',{headers:authHeaders()});
    const data=await res.json();
    if(data.loggedIn){
      if(data.token) saveTokenWithExpiry(data.token);
      showApp(data.user);
    }else{
      clearToken();
      document.getElementById('authSection').style.display='block';
      document.getElementById('appSection').style.display='none';
      if(data.serverOffline){
        toast(data.message||'Server offline','error');
      }
    }
  }catch(err){
    document.getElementById('authSection').style.display='block';
    document.getElementById('appSection').style.display='none';
  }
}

function showApp(user){
  currentUser=user;
  document.getElementById('authSection').style.display='none';
  document.getElementById('appSection').style.display='flex';
  document.getElementById('loggedInUser').textContent=user.username;
  const avatar=document.getElementById('userAvatar');
  avatar.textContent=user.username.charAt(0).toUpperCase();

  const badge=document.getElementById('adminBadge');
  const coinBalance=document.getElementById('coinBalance');
  const tabAdmin=document.getElementById('tabAdminBtn');

  if(user.role==='admin'){
    badge.style.display='inline-block';
    avatar.className='avatar admin';
    coinBalance.textContent='Koin Unlimited';
    tabAdmin.style.display='flex';
  }else{
    badge.style.display='none';
    avatar.className='avatar';
    coinBalance.textContent=user.coins+' Koin';
    tabAdmin.style.display='none';
  }
  updateServerUI();
  loadServices();

  const hash=window.location.hash;
  if(hash&&hash.startsWith('#order=')){
    const orderId=decodeURIComponent(hash.slice(7));
    lastOrderId=orderId;
    document.getElementById('searchOrderId').value=orderId;
    document.getElementById('quickSearchId').value=orderId;
    switchTab('orders');
    setTimeout(()=>highlightOrder(orderId),800);
  }
}

document.getElementById('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=document.getElementById('btnAuthSubmit');
  const original=btn.textContent;
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Memproses...';
  const username=document.getElementById('authUsername').value;
  const password=document.getElementById('authPassword').value;
  const endpoint=authMode==='login'?'/api/login':'/api/register';
  try{
    const res=await fetch(endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,password})
    });
    const data=await res.json();
    if(data.success){
      if(data.token) saveTokenWithExpiry(data.token);
      toast(data.message||'Berhasil!','success');
      showApp(data.user);
    }else{
      toast(data.message||'Gagal!','error');
    }
  }catch(e){toast('Gagal terhubung ke server','error');}
  finally{btn.disabled=false;btn.textContent=original;}
});

async function logout(){
  clearToken();
  location.reload();
}

async function loadServices(){
  try{
    const res=await fetch('/api/services',{headers:authHeaders()});
    const data=await res.json();
    if(data.success){servicesData=data.services;updateServices();}
    else if(data.serverOffline){toast(data.message||'Server offline','error');}
  }catch(e){}
}

function updateServices(){
  const category=document.getElementById('category').value;
  const select=document.getElementById('serviceVersion');
  select.innerHTML='';
  if(servicesData[category]){
    servicesData[category].forEach((item,idx)=>{
      const opt=document.createElement('option');
      opt.value=idx+1;
      opt.textContent=item.name+' (ID: '+item.id+')';
      select.appendChild(opt);
    });
  }
}

document.getElementById('orderForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=document.getElementById('btnSubmit');
  const statusBox=document.getElementById('statusBox');
  const statusTitle=document.getElementById('statusTitle');
  const statusDetail=document.getElementById('statusDetail');
  const orderIdDisplay=document.getElementById('orderIdDisplay');
  const orderIdValue=document.getElementById('orderIdValue');

  if(!serverOnline&&currentUser&&currentUser.role!=='admin'){
    toast('Server sedang offline. Tidak bisa order.','error');
    return;
  }

  btn.disabled=true;
  btn.innerHTML='<span class="spinner"></span> Memproses...';
  statusBox.classList.remove('show');
  orderIdDisplay.style.display='none';

  const payload={
    service:document.getElementById('category').value,
    version:document.getElementById('serviceVersion').value,
    url:document.getElementById('targetUrl').value,
    jumlah:document.getElementById('jumlah').value
  };

  try{
    const res=await fetch('/api/order',{
      method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify(payload)
    });
    const data=await res.json();
    if(data.success&&data.result){
      statusBox.className='result-box show '+data.result.classType;
      statusTitle.textContent='STATUS: '+data.result.status;
      statusDetail.innerHTML=data.result.message;

      if(data.orderId){
        lastOrderId=data.orderId;
        orderIdValue.textContent=data.orderId;
        orderIdDisplay.style.display='block';
        document.getElementById('searchOrderId').value=data.orderId;
        document.getElementById('quickSearchId').value=data.orderId;
        document.getElementById('adminOrderFilter').value=data.orderId;
        window.location.hash='order='+encodeURIComponent(data.orderId);
        try{
          const history=JSON.parse(localStorage.getItem('orderHistory')||'[]');
          if(!history.includes(data.orderId)){
            history.unshift(data.orderId);
            localStorage.setItem('orderHistory',JSON.stringify(history.slice(0,50)));
          }
        }catch(e){}
        toast('Orderan terkirim! ID: '+data.orderId,'success');
      }else{
        toast('Orderan terkirim!','success');
      }
      checkAuth();
      // Refresh daftar order user supaya kalau gagal langsung kelihatan di tab Status
      loadMyOrders(true);
    }else{
      statusBox.className='result-box show failed';
      statusTitle.textContent='STATUS: GAGAL';
      statusDetail.textContent=data.message||'Terjadi kesalahan internal.';
      toast(data.message||'Order gagal','error');
      if(data.serverOffline){
        fetchServerStatus();
      }
      checkAuth();
      loadMyOrders(true);
    }
  }catch(err){
    statusBox.className='result-box show failed';
    statusTitle.textContent='STATUS: GAGAL';
    statusDetail.textContent='Gagal terhubung ke server.';
    toast('Gagal terhubung','error');
  }finally{
    updateServerUI();
  }
});

function copyOrderId(){
  const id=document.getElementById('orderIdValue').textContent;
  if(!id)return;
  navigator.clipboard.writeText(id).then(()=>{
    toast('ID Orderan dicopy: '+id,'success');
  }).catch(()=>{
    const ta=document.createElement('textarea');
    ta.value=id;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('ID Orderan dicopy: '+id,'success');}catch(e){toast('Gagal copy','error');}
    ta.remove();
  });
}

function goToOrderStatus(){
  if(!lastOrderId){toast('Belum ada orderan','error');return;}
  document.getElementById('searchOrderId').value=lastOrderId;
  switchTab('orders');
  setTimeout(()=>highlightOrder(lastOrderId),600);
}

function quickSearch(){
  const id=document.getElementById('quickSearchId').value.trim();
  if(!id){toast('Masukkan ID orderan','error');return;}
  document.getElementById('searchOrderId').value=id;
  switchTab('orders');
  setTimeout(()=>highlightOrder(id),600);
}

function highlightOrder(orderId){
  const items=document.querySelectorAll('#myOrdersList .list-item');
  let found=false;
  items.forEach(item=>{
    item.classList.remove('highlight');
    const idEl=item.querySelector('.li-value.mono');
    if(idEl&&idEl.textContent.trim().toUpperCase()===orderId.toUpperCase()){
      item.classList.add('highlight');
      item.scrollIntoView({behavior:'smooth',block:'center'});
      found=true;
    }
  });
  if(found)toast('Orderan ditemukan!','success');
}

function statusPill(status,progress){
  if(progress)return '<span class="pill progress">'+progress+'</span>';
  if(status==='selesai')return '<span class="pill success">Selesai</span>';
  if(status==='gagal')return '<span class="pill failed">Gagal</span>';
  return '<span class="pill waiting">Menunggu Antrian</span>';
}

function renderOrderItem(o,showUser=false){
  const date=new Date(o.createdAt).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  let html='<div class="list-item">';
  html+='<div class="li-row"><span class="li-label">ID Order</span><span class="li-value mono">'+o.orderId+'</span></div>';
  if(showUser)html+='<div class="li-row"><span class="li-label">User</span><span class="li-value">'+o.username+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Layanan</span><span class="li-value">'+(o.serviceName||o.service)+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Link</span><span class="li-value target">'+o.target+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Jumlah</span><span class="li-value">'+o.jumlah+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Status</span><span class="li-value">'+statusPill(o.status,o.progress)+'</span></div>';
  if(o.message)html+='<div class="li-row"><span class="li-label">Pesan</span><span class="li-value" style="font-size:11px">'+o.message+'</span></div>';
  html+='<div class="li-row"><span class="li-label">Tanggal</span><span class="li-value" style="font-size:11px;color:var(--text-3)">'+date+'</span></div>';
  html+='</div>';
  return html;
}

async function loadMyOrders(silent=false){
  try{
    const res=await fetch('/api/orders/my',{headers:authHeaders()});
    const data=await res.json();
    if(data.success){myOrdersCache=data.orders;renderMyOrders();}
  }catch(e){if(!silent)toast('Gagal memuat order','error');}
}

function renderMyOrders(){
  const container=document.getElementById('myOrdersList');
  const filter=(document.getElementById('searchOrderId').value||'').trim().toUpperCase();
  const list=myOrdersCache.filter(o=>!filter||o.orderId.toUpperCase().includes(filter));
  if(!list.length){
    container.innerHTML='<div class="empty">Belum ada orderan'+(filter?' yang cocok':'')+'.</div>';
    return;
  }
  container.innerHTML=list.map(o=>renderOrderItem(o)).join('');
  if(filter&&list.length)setTimeout(()=>highlightOrder(filter),300);
}

async function loadActiveRedeems(){
  const container=document.getElementById('activeRedeemList');
  try{
    const res=await fetch('/api/redeem/active',{headers:authHeaders()});
    const data=await res.json();
    if(!data.success||!data.redeems.length){
      container.innerHTML='<div class="empty">Belum ada kode redeem aktif.</div>';
      return;
    }
    container.innerHTML=data.redeems.map(r=>{
      const exp=r.expiresAt?'<div class="li-row"><span class="li-label">Expired</span><span class="li-value" style="font-size:11px">'+new Date(r.expiresAt).toLocaleString('id-ID')+'</span></div>':'';
      return '<div class="list-item">'+
        '<div class="li-row"><span class="li-label">Kode</span><span class="li-value"><span class="code-chip" onclick="useCode(\\''+r.code+'\\')">'+r.code+'</span></span></div>'+
        '<div class="li-row"><span class="li-label">Hadiah</span><span class="li-value">'+r.coins+' Koin</span></div>'+
        '<div class="li-row"><span class="li-label">Sisa</span><span class="li-value">'+r.remaining+'</span></div>'+
        exp+
      '</div>';
    }).join('');
  }catch(e){
    container.innerHTML='<div class="empty">Gagal memuat kode.</div>';
  }
}

function useCode(code){
  document.getElementById('redeemInput').value=code;
  toast('Kode dimasukkan, klik Klaim','info');
}

async function claimRedeem(){
  const code=document.getElementById('redeemInput').value;
  if(!code.trim()){toast('Masukkan kode dulu','error');return;}
  try{
    const res=await fetch('/api/redeem/claim',{
      method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({code})
    });
    const data=await res.json();
    toast(data.message,data.success?'success':'error');
    if(data.success){
      document.getElementById('redeemInput').value='';
      checkAuth();loadActiveRedeems();
    }
  }catch(e){toast('Gagal terhubung','error');}
}

// ============ ADMIN SERVER CONTROL ============
async function loadServerStatus(){
  if(!currentUser||currentUser.role!=='admin')return;
  try{
    const res=await fetch('/api/admin/server/status',{headers:authHeaders()});
    const data=await res.json();
    if(data.success){
      const s=data.status;
      const box=document.getElementById('serverBigStatus');
      const icon=document.getElementById('serverBigIcon');
      const title=document.getElementById('serverBigTitle');
      const sub=document.getElementById('serverBigSub');
      const meta=document.getElementById('serverBigMeta');
      const msgInput=document.getElementById('offlineMessageInput');

      if(s.online){
        box.className='server-big-status online';
        icon.textContent='🟢';
        title.className='server-big-title online';
        title.textContent='ONLINE';
      }else{
        box.className='server-big-status offline';
        icon.textContent='🔴';
        title.className='server-big-title offline';
        title.textContent='OFFLINE';
      }
      sub.textContent=s.message||'-';
      meta.textContent='Update: '+new Date(s.updatedAt).toLocaleString('id-ID')+' oleh '+s.updatedBy;
      if(msgInput)msgInput.value=s.message||'';
    }
  }catch(e){}
}

async function toggleServer(online){
  if(!currentUser||currentUser.role!=='admin'){toast('Hanya admin','error');return;}
  const btn=online?document.getElementById('btnServerOn'):document.getElementById('btnServerOff');
  const original=btn.textContent;
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';

  const message=document.getElementById('offlineMessageInput').value.trim();

  try{
    const res=await fetch('/api/admin/server/toggle',{
      method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({online,message})
    });
    const data=await res.json();
    toast(data.message,data.success?'success':'error');
    if(data.success){
      serverOnline=data.status.online;
      serverMessage=data.status.message;
      updateServerUI();
      loadServerStatus();
      fetchServerStatus();
    }
  }catch(e){toast('Gagal terhubung','error');}
  finally{btn.disabled=false;btn.textContent=original;}
}

// ============ ADMIN OTHER ============
async function adminGiveCoin(){
  const targetUsername=document.getElementById('giveCoinUsername').value;
  const amount=document.getElementById('giveCoinAmount').value;
  if(!targetUsername.trim()){toast('Username wajib diisi','error');return;}
  try{
    const res=await fetch('/api/admin/give-coin',{
      method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({targetUsername,amount})
    });
    const data=await res.json();
    toast(data.message,data.success?'success':'error');
    if(data.success)document.getElementById('giveCoinUsername').value='';
  }catch(e){toast('Gagal terhubung','error');}
}

async function adminCreateRedeem(){
  try{
    const res=await fetch('/api/admin/redeem/create',{
      method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({
        code:document.getElementById('newRedeemCode').value,
        coins:document.getElementById('newRedeemCoins').value,
        maxUses:document.getElementById('newRedeemMaxUses').value,
        expiresInHours:document.getElementById('newRedeemExpires').value
      })
    });
    const data=await res.json();
    toast(data.success?(data.message+' - '+data.redeem.code):data.message,data.success?'success':'error');
    if(data.success){
      document.getElementById('newRedeemCode').value='';
      loadAdminRedeems();loadActiveRedeems();
    }
  }catch(e){toast('Gagal terhubung','error');}
}

async function loadAdminRedeems(){
  const container=document.getElementById('adminRedeemList');
  try{
    const res=await fetch('/api/admin/redeem',{headers:authHeaders()});
    const data=await res.json();
    if(!data.success||!data.redeems.length){
      container.innerHTML='<div class="empty">Belum ada kode redeem.</div>';
      return;
    }
    container.innerHTML=data.redeems.map(r=>{
      const exp=r.expiresAt?'<div class="li-row"><span class="li-label">Expired</span><span class="li-value" style="font-size:11px">'+new Date(r.expiresAt).toLocaleString('id-ID')+'</span></div>':'';
      const used=(r.usedBy?.length||0)+(r.maxUses?' / '+r.maxUses:' / unlimited');
      return '<div class="list-item">'+
        '<div class="li-row"><span class="li-label">Kode</span><span class="li-value"><span class="code-chip">'+r.code+'</span></span></div>'+
        '<div class="li-row"><span class="li-label">Koin</span><span class="li-value">'+r.coins+'</span></div>'+
        '<div class="li-row"><span class="li-label">Terpakai</span><span class="li-value">'+used+'</span></div>'+
        exp+
        '<div style="text-align:right;margin-top:10px;"><button class="btn-danger-sm" onclick="deleteRedeem(\\''+r.code+'\\')">Hapus</button></div>'+
      '</div>';
    }).join('');
  }catch(e){container.innerHTML='<div class="empty">Gagal memuat.</div>';}
}

async function deleteRedeem(code){
  if(!confirm('Hapus kode redeem '+code+'?'))return;
  const res=await fetch('/api/admin/redeem/'+encodeURIComponent(code),{
    method:'DELETE',headers:authHeaders()
  });
  const data=await res.json();
  toast(data.message,data.success?'success':'error');
  if(data.success){loadAdminRedeems();loadActiveRedeems();}
}

async function loadAdminOrders(silent=false){
  try{
    const res=await fetch('/api/admin/orders',{headers:authHeaders()});
    const data=await res.json();
    if(data.success){adminOrdersCache=data.orders;renderAdminOrders();}
  }catch(e){if(!silent)toast('Gagal memuat order','error');}
}

function renderAdminOrders(){
  const container=document.getElementById('adminOrdersList');
  const filter=(document.getElementById('adminOrderFilter').value||'').trim().toUpperCase();
  const list=adminOrdersCache.filter(o=>
    !filter||o.orderId.toUpperCase().includes(filter)||(o.username||'').toUpperCase().includes(filter)
  );
  if(!list.length){
    container.innerHTML='<div class="empty">Belum ada orderan.</div>';
    return;
  }
  container.innerHTML=list.map(o=>renderOrderItem(o,true)).join('');
  if(filter&&list.length)setTimeout(()=>highlightOrder(filter),300);
}

// ============ INIT ============
(async()=>{
  await fetchServerStatus();
  await checkAuth();
  serverStatusTimer=setInterval(fetchServerStatus,10000);
})();
</script>
</body>
</html>`);
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  Promise.all([
    loadUsersFromFirebase(),
    loadRedeemsFromFirebase(),
    loadOrdersFromFirebase(),
    loadServerStatusFromFirebase()
  ]).then(() => {
    app.listen(PORT, () => {
      console.log(`\n================================================--`);
      console.log(`Server Lokal Aktif pada Port: ${PORT}`);
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`Halaman Lacak Publik: http://localhost:${PORT}/status`);
      console.log(`Firebase DB: ${FIREBASE_URL}`);
      console.log(`Server Status: ${serverStatus.online ? 'ONLINE' : 'OFFLINE'}`);
      console.log(`Akun Admin -> Username: adminbaguss | Password: baguss`);
      console.log(`================================================--\n`);
    });
  });
}