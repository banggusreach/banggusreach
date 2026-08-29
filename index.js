const express = require('express');
const crypto = require('crypto');
const Go = require('@xof/fetch');
const cookieParser = require('cookie-parser');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set, update, remove, child } = require('firebase/database');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- INISIALISASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCg1K6T7IZ4ldhX6ehn9uC_KfRrFSSv9ec",
    authDomain: "jualakunbs.firebaseapp.com",
    databaseURL: "https://jualakunbs-default-rtdb.firebaseio.com",
    projectId: "jualakunbs",
    storageBucket: "jualakunbs.firebasestorage.app",
    messagingSenderId: "341323679179",
    appId: "1:341323679179:web:0167d4d9e3661c553d624e"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const sessions = new Map();

// --- INISIALISASI DATA AWAL DI FIREBASE ---
async function initializeDatabase() {
    try {
        const dbRef = ref(db);
        
        // Cek apakah admin sudah ada
        const adminSnap = await get(child(dbRef, 'users/adminbagus'));
        if (!adminSnap.exists()) {
            await set(ref(db, 'users/adminbagus'), {
                username: 'adminbagus',
                password: 'baguss',
                role: 'admin',
                coins: 99999,
                clientId: 'nx_admin00000000000000',
                redeemedCodes: [],
                lastCoinReset: Date.now()
            });
        }

        // Cek status server
        const statusSnap = await get(child(dbRef, 'system/serverStatus'));
        if (!statusSnap.exists()) {
            await set(ref(db, 'system/serverStatus'), 'online');
        }
    } catch (e) {
        console.error('Gagal menginisialisasi database Firebase:', e.message);
    }
}
initializeDatabase();

// --- FUNGSI HELPER DATABASE ---
async function getUsers() {
    const snapshot = await get(ref(db, 'users'));
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val());
}

async function getUserByUsername(username) {
    const snapshot = await get(ref(db, `users/${username}`));
    if (!snapshot.exists()) return null;
    return snapshot.val();
}

async function saveUser(user) {
    await set(ref(db, `users/${user.username}`), user);
}

async function getRedeemCodes() {
    const snapshot = await get(ref(db, 'redeemCodes'));
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val());
}

async function saveRedeemCode(codeObj) {
    await set(ref(db, `redeemCodes/${codeObj.code}`), codeObj);
}

async function deleteRedeemCode(code) {
    await remove(ref(db, `redeemCodes/${code}`));
}

async function getServerStatus() {
    const snapshot = await get(ref(db, 'system/serverStatus'));
    return snapshot.exists() ? snapshot.val() : 'online';
}

async function setServerStatus(status) {
    await set(ref(db, 'system/serverStatus'), status);
}

// --- FUNGSI HELPER RESET KOIN 24 JAM ---
async function checkAndResetCoins(user) {
    if (user.role === 'admin') return;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (!user.lastCoinReset) {
        user.lastCoinReset = now;
        await saveUser(user);
    } else if (now - user.lastCoinReset >= twentyFourHours) {
        if (user.coins <= 0) {
            user.coins = 3; // Reset koin kembali ke 3 jika habis setelah 24 jam
        }
        user.lastCoinReset = now;
        await saveUser(user);
    }
}

// --- LOGIKA UTAMA DARI KODE ANDA ---
const Uid = () => 'nx_' + crypto.randomUUID().replace(/-/g,'').slice(0,21);
const generateFakeIP = () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const fpHash = Math.abs(Math.floor(Math.random() * 1000000)).toString(16);
const fakeIP = generateFakeIP();
const fb = () => ({ headers: { 'X-Device-Fingerprint': `fp_${fpHash}`, 'X-Forwarded-For': fakeIP, 'X-Real-IP': fakeIP, 'True-Client-IP': fakeIP } }); 

const config = {
    base: "https://reach-wa-nexus.vercel.app",
    apikey: 'anzz_live_18fc288f3fbc64643542c40197a5713f0aef51e354a6c254',
    api: 'https://anzzmodsofficial.edgeone.dev'
};

const go = Go.create({
    baseURL: config.base,
    ...fb(),
    browser: true,
    cookieJar: false,
    keepAlive: true
});

function parseEmoji(input) {
    if (Array.isArray(input)) return input;
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(input))].map(x => x.segment.trim()).filter(Boolean).flatMap(x => x.split(',')).map(x => x.trim()).filter(Boolean);
}

async function registerXof(username, password, clientId){
  const res = await go.post('/api/payload?path=/api/auth/register', {
      body: { username, password, clientId }
  });
  return res.json();
}

// --- PERBAIKAN FUNGSI HANDSHAKE (PER-REQUEST LOOP RETRY) ---
async function handshake(taunting = 9) {
  let attempt = 0;
  while (attempt < Number(taunting)) {
      try {
          const response = await fetch('https://anzzmodsofficial.edgeone.dev/api/v1/handshake', {
              method: 'POST',
              headers: {
                  'Accept': '*/*',
                  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                  'Content-Length': '0',
                  'Origin': 'https://reach-wa-nexus.vercel.app',
                  'Pragma': 'no-cache',
                  'Referer': 'https://reach-wa-nexus.vercel.app/',
                  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                  'X-API-Key': config.apikey,
                  'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
                  'sec-ch-ua-mobile': '?1',
                  'sec-ch-ua-platform': '"Android"'
              }
          });
          const resData = await response.json();

          if (resData.ok && resData.token) {
              return resData.token;
          }

          if (typeof resData.error === 'string' && resData.error.includes('key_')) {
              attempt++;
              await new Promise(r => setTimeout(r, 1500));
              continue;
          }
      } catch (e) {
          attempt++;
          await new Promise(r => setTimeout(r, 1000));
      }
  }
  throw new Error('Gagal mendapatkan token Handshake (API Key sibuk atau terlimit)');
}

// --- PERBAIKAN FUNGSI SEND (ISOLASI TOKEN LOKAL & VALIDASI UPSTREAM) ---
async function send(url, reactions){
  const handshakeToken = await handshake();
  if (!handshakeToken) {
      throw new Error('Token Handshake tidak valid.');
  }

  reactions = parseEmoji(reactions);
  const isValid = /^https:\/\/(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]+\/\d+$/.test(url);
  if(!isValid) throw new Error('invalid url (Pastikan format link channel WhatsApp benar)');
  
  let resData;
  try {
      const response = await fetch(`${config.api}/api/v1/react`, {
          method: 'POST',
          headers: {
              'Accept': '*/*',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Content-Type': 'application/json',
              'Origin': 'https://reach-wa-nexus.vercel.app',
              'Pragma': 'no-cache',
              'Referer': 'https://reach-wa-nexus.vercel.app/',
              'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
              'X-API-Key': config.apikey,
              'X-Handshake-Token': handshakeToken,
              'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
              'sec-ch-ua-mobile': '?1',
              'sec-ch-ua-platform': '"Android"'
          },
          body: JSON.stringify({ url, reactions })
      });
      resData = await response.json();
  } catch (e) {
      throw new Error('Gagal mengirim reaksi: ' + e.message);
  }

  if (resData && resData.ok === false) {
      throw new Error(resData.message || resData.error || 'API Upstream menolak permintaan reaksi');
  }

  return resData;
}

// --- MIDDLEWARE AUTENTIKASI ---
async function checkAuth(req, res, next) {
    const token = req.cookies.session_token;
    if (token && sessions.has(token)) {
        const sessionUser = sessions.get(token);
        const latestUser = await getUserByUsername(sessionUser.username);
        if (latestUser) {
            await checkAndResetCoins(latestUser);
            req.user = latestUser;
            next();
            return;
        }
    }
    res.redirect('/login');
}

// --- ROUTE HALAMAN AUTH ---
app.get('/login', (req, res) => res.send(renderAuthPage('login')));
app.get('/register', (req, res) => res.send(renderAuthPage('register')));

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, error: 'Username atau password salah!' });
    }
    
    await checkAndResetCoins(user);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionToken, user);
    res.cookie('session_token', sessionToken, { httpOnly: true });
    res.json({ success: true, role: user.role });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Semua kolom wajib diisi!' });
    
    const existingUser = await getUserByUsername(username);
    if (existingUser) return res.status(400).json({ success: false, error: 'Username sudah digunakan!' });
    
    const clientId = Uid();
    try {
        await registerXof(username, password, clientId);
        const newUser = { username, password, role: 'user', coins: 3, clientId, redeemedCodes: [], lastCoinReset: Date.now() };
        await saveUser(newUser);
        res.json({ success: true, message: 'Registrasi berhasil! Anda mendapatkan 3 koin gratis.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Gagal mendaftar ke server pusat: ' + e.message });
    }
});

app.get('/logout', (req, res) => {
    const token = req.cookies.session_token;
    if (token) sessions.delete(token);
    res.clearCookie('session_token');
    res.redirect('/login');
});

// --- ROUTE DASHBOARD ---
app.get('/', checkAuth, async (req, res) => {
    if (req.user.role === 'admin') return res.redirect('/admin');
    const serverStatus = await getServerStatus();
    if (serverStatus === 'offline') {
        return res.send(renderServerOfflinePage());
    }
    res.send(renderDashboardUser(req.user));
});

app.get('/admin', checkAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.redirect('/');
    const allUsers = await getUsers();
    const redeemCodes = await getRedeemCodes();
    const serverStatus = await getServerStatus();
    res.send(renderDashboardAdmin(req.user, allUsers, redeemCodes, serverStatus));
});

// --- API ENDPOINT REACT ---
app.post('/api/react', checkAuth, async (req, res) => {
    const serverStatus = await getServerStatus();
    if (serverStatus === 'offline' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Server sedang offline oleh Admin. Anda tidak dapat mengirimkan reach saat ini.' });
    }

    const { link, emoji } = req.body;
    if (!link || !emoji) return res.status(400).json({ success: false, error: 'Link & emoji wajib diisi!' });
    
    if (req.user.role !== 'admin' && req.user.coins < 1) {
        return res.status(400).json({ success: false, error: 'Koin Anda habis! Koin akan direset otomatis dalam 24 jam atau tukar kode redeem.' });
    }

    try {
        const result = await send(link, emoji);
        
        if (req.user.role !== 'admin') {
            req.user.coins -= 1;
            await saveUser(req.user);
        }
        res.json({ success: true, remainingCoins: req.user.coins, result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- API ENDPOINT REDEEM KODE ---
app.post('/api/redeem', checkAuth, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Kode redeem wajib diisi!' });

    const formattedCode = code.trim().toUpperCase();
    const redeemCodes = await getRedeemCodes();
    const targetCode = redeemCodes.find(c => c.code === formattedCode);
    
    if (!targetCode) return res.status(400).json({ success: false, error: 'Kode redeem tidak valid!' });

    if (targetCode.quota <= 0) {
        await deleteRedeemCode(targetCode.code);
        return res.status(400).json({ success: false, error: 'Kuota kode redeem ini sudah habis dan telah dihapus dari sistem!' });
    }

    if (!req.user.redeemedCodes) req.user.redeemedCodes = [];
    if (req.user.redeemedCodes.includes(targetCode.code)) {
        return res.status(400).json({ success: false, error: 'Anda sudah pernah menggunakan kode redeem ini!' });
    }

    const earnedCoins = Math.floor(Math.random() * (targetCode.maxCoins - targetCode.minCoins + 1)) + targetCode.minCoins;
    
    req.user.coins += earnedCoins;
    req.user.redeemedCodes.push(targetCode.code);
    await saveUser(req.user);

    targetCode.quota -= 1;
    if (targetCode.quota <= 0) {
        await deleteRedeemCode(targetCode.code);
    } else {
        await saveRedeemCode(targetCode);
    }

    res.json({ success: true, earnedCoins, totalCoins: req.user.coins, message: `Berhasil menukar kode! Anda mendapatkan ${earnedCoins} koin.` });
});

// --- API ENDPOINT ADMIN: BUAT KODE REDEEM ---
app.post('/api/admin/create-code', checkAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Akses ditolak!' });
    
    const { code, minCoins, maxCoins, quota } = req.body;
    if (!code || minCoins === undefined || maxCoins === undefined || quota === undefined) {
        return res.status(400).json({ success: false, error: 'Semua field wajib diisi!' });
    }

    const formattedCode = code.trim().toUpperCase();
    const redeemCodes = await getRedeemCodes();
    if (redeemCodes.some(c => c.code === formattedCode)) {
        return res.status(400).json({ success: false, error: 'Kode redeem sudah ada!' });
    }

    const parsedMin = parseInt(minCoins);
    const parsedMax = parseInt(maxCoins);
    const parsedQuota = parseInt(quota);

    if (parsedMin > parsedMax) {
        return res.status(400).json({ success: false, error: 'Min Koin tidak boleh lebih besar dari Max Koin!' });
    }

    const newCode = {
        code: formattedCode,
        minCoins: parsedMin,
        maxCoins: parsedMax,
        quota: parsedQuota
    };

    await saveRedeemCode(newCode);
    res.json({ success: true, message: 'Kode redeem berhasil dibuat!' });
});

// --- API ENDPOINT ADMIN: HAPUS KODE REDEEM MANUAL ---
app.post('/api/admin/delete-code', checkAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Akses ditolak!' });
    const { code } = req.body;
    const redeemCodes = await getRedeemCodes();
    const target = redeemCodes.find(c => c.code === code);
    if (target) {
        await deleteRedeemCode(code);
        return res.json({ success: true, message: 'Kode redeem berhasil dihapus.' });
    }
    res.status(400).json({ success: false, error: 'Kode tidak ditemukan.' });
});

// --- API ENDPOINT ADMIN: TOGGLE STATUS SERVER ---
app.post('/api/admin/toggle-server', checkAuth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Akses ditolak!' });
    const currentStatus = await getServerStatus();
    const newStatus = currentStatus === 'online' ? 'offline' : 'online';
    await setServerStatus(newStatus);
    res.json({ success: true, serverStatus: newStatus, message: `Status server berhasil diubah menjadi ${newStatus}` });
});

// --- TEMPLATE HALAMAN HTML ---
function renderAuthPage(type) {
    const isLogin = type === 'login';
    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BANGGUS REACH - ${isLogin ? 'Login' : 'Register'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
            <div class="text-center mb-6">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 mx-auto flex items-center justify-center shadow-lg mb-3">
                    <i class="fa-solid fa-bolt text-white text-xl"></i>
                </div>
                <h1 class="text-xl font-bold text-white">${isLogin ? 'Masuk ke Banggus Reach' : 'Buat Akun Baru'}</h1>
                <p class="text-xs text-slate-400 mt-1">${isLogin ? 'Silakan masuk dengan akun Anda' : 'Daftar sekarang & dapatkan 3 koin gratis!'}</p>
            </div>
            <form id="authForm" class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Username</label>
                    <input type="text" id="username" required class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500">
                </div>
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Password</label>
                    <input type="password" id="password" required class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500">
                </div>
                <div id="alertBox" class="hidden text-xs p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"></div>
                <button type="submit" class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-slate-950 font-bold py-3 rounded-xl shadow-lg transition-all cursor-pointer">
                    ${isLogin ? 'Masuk' : 'Daftar'}
                </button>
            </form>
            <div class="mt-6 text-center text-xs text-slate-400">
                ${isLogin ? 'Belum punya akun? <a href="/register" class="text-emerald-400 hover:underline">Daftar sekarang</a>' : 'Sudah punya akun? <a href="/login" class="text-emerald-400 hover:underline">Masuk</a>'}
            </div>
        </div>
        <script>
            document.getElementById('authForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const endpoint = ${isLogin} ? '/api/auth/login' : '/api/auth/register';
                
                try {
                    const res = await fetch(endpoint, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({username, password})
                    });
                    const data = await res.json();
                    if(data.success) {
                        if(${isLogin}) {
                            window.location.href = data.role === 'admin' ? '/admin' : '/';
                        } else {
                            alert(data.message);
                            window.location.href = '/login';
                        }
                    } else {
                        const alertBox = document.getElementById('alertBox');
                        alertBox.textContent = data.error;
                        alertBox.classList.remove('hidden');
                    }
                } catch(err) {
                    alert('Terjadi kesalahan koneksi');
                }
            });
        </script>
    </body>
    </html>
    `;
}

function renderServerOfflinePage() {
    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Server Offline - BANGGUS REACH</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 text-center shadow-2xl">
            <div class="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mx-auto flex items-center justify-center mb-4">
                <i class="fa-solid fa-power-off text-red-400 text-2xl"></i>
            </div>
            <h1 class="text-xl font-bold text-white mb-2">Server Sedang Offline</h1>
            <p class="text-xs text-slate-400 mb-6">Administrator telah menonaktifkan server sementara waktu. Fitur kirim reaksi saat ini ditutup untuk pengguna lain. Silakan coba beberapa saat lagi.</p>
            <a href="/logout" class="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-5 py-2.5 rounded-xl transition-all">
                <i class="fa-solid fa-right-from-bracket mr-1.5"></i> Keluar Akun
            </a>
        </div>
    </body>
    </html>
    `;
}

function renderDashboardUser(user) {
    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - BANGGUS REACH</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col justify-between">
        <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
            <div class="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center">
                        <i class="fa-solid fa-bolt text-white"></i>
                    </div>
                    <div><h1 class="font-bold text-base">BANGGUS REACH</h1><p class="text-xs text-slate-400">Halo, ${user.username}</p></div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                        <i class="fa-solid fa-coins text-amber-400"></i>
                        <span id="coinDisplay">${user.coins} Koin</span>
                    </div>
                    <a href="/logout" class="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-all">
                        <i class="fa-solid fa-right-from-bracket mr-1"></i> Keluar
                    </a>
                </div>
            </div>
        </header>

        <main class="max-w-2xl w-full mx-auto px-4 py-8 flex-grow space-y-6">
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 class="text-sm font-bold text-white mb-2"><i class="fa-solid fa-ticket mr-2 text-emerald-400"></i>Tukar Kode Redeem Koin</h3>
                <p class="text-xs text-slate-400 mb-4">Masukkan kode unik dari admin untuk mendapatkan koin secara acak.</p>
                <form id="redeemForm" class="flex gap-2">
                    <input type="text" id="redeemCodeInput" required placeholder="Masukkan kode redeem..." class="flex-grow bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 uppercase">
                    <button type="submit" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer">Tukar</button>
                </form>
                <div id="redeemAlert" class="mt-3 text-xs hidden p-2 rounded-lg"></div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-xl font-bold text-white mb-1">Kirim Reaksi WhatsApp</h2>
                        <p class="text-sm text-slate-400">Biaya: 1 Koin per eksekusi reaksi.</p>
                    </div>
                </div>
                <form id="reactForm" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Link Channel WhatsApp</label>
                        <input type="text" id="link" required placeholder="https://whatsapp.com/channel/..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Emoji Reaksi</label>
                        <input type="text" id="emoji" required placeholder="🔥, 👍, ❤️" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500">
                    </div>
                    <button type="submit" id="submitBtn" class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg transition-all cursor-pointer">
                        Kirim Reaksi
                    </button>
                </form>
                <div id="resultContainer" class="mt-6 hidden">
                    <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-400">
                        <div class="flex items-center space-x-2 text-emerald-400 font-bold mb-1">
                            <i class="fa-solid fa-circle-check"></i>
                            <span>Status Eksekusi Berhasil</span>
                        </div>
                        <p class="text-slate-400 text-[11px]">Reaksi Telah Terkirim Silakan Tunggu Beberapa Menit.</p>
                    </div>
                </div>
            </div>
        </main>

        <footer class="border-t border-slate-900 bg-slate-950/50 py-4 text-center text-xs text-slate-500">Powered by BANGGUS REACH</footer>

        <script>
            document.getElementById('redeemForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = document.getElementById('redeemCodeInput').value;
                const alertBox = document.getElementById('redeemAlert');
                try {
                    const res = await fetch('/api/redeem', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({code})
                    });
                    const data = await res.json();
                    alertBox.classList.remove('hidden');
                    if(data.success) {
                        alertBox.className = 'mt-3 text-xs p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        alertBox.textContent = data.message;
                        document.getElementById('coinDisplay').textContent = data.totalCoins + ' Koin';
                        document.getElementById('redeemCodeInput').value = '';
                    } else {
                        alertBox.className = 'mt-3 text-xs p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20';
                        alertBox.textContent = data.error;
                    }
                } catch(err) {
                    alert('Gagal memproses kode redeem');
                }
            });

            document.getElementById('reactForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const link = document.getElementById('link').value;
                const emoji = document.getElementById('emoji').value;
                const btn = document.getElementById('submitBtn');
                const outContainer = document.getElementById('resultContainer');
                
                btn.disabled = true; btn.textContent = 'Memproses...';
                outContainer.classList.add('hidden');
                try {
                    const res = await fetch('/api/react', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({link, emoji})
                    });
                    const data = await res.json();
                    if(data.success) {
                        outContainer.classList.remove('hidden');
                        document.getElementById('coinDisplay').textContent = data.remainingCoins + ' Koin';
                    } else {
                        alert(data.error);
                        if(data.error && data.error.includes('offline')) {
                            window.location.reload();
                        }
                    }
                } catch(err) {
                    alert('Gagal: ' + err.message);
                } finally {
                    btn.disabled = false; btn.textContent = 'Kirim Reaksi (1 Koin)';
                }
            });
        </script>
    </body>
    </html>
    `;
}

function renderDashboardAdmin(user, allUsers, allCodes, currentServerStatus) {
    const userRows = allUsers.map(u => `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/30">
            <td class="py-3 px-4 text-sm text-slate-200">${u.username}</td>
            <td class="py-3 px-4 text-sm"><span class="px-2 py-0.5 rounded text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">${u.role}</span></td>
            <td class="py-3 px-4 text-sm text-amber-400 font-semibold">${u.coins} Koin</td>
            <td class="py-3 px-4 text-xs font-mono text-slate-400">${u.clientId || '-'}</td>
        </tr>
    `).join('');

    const codeRows = allCodes.length > 0 ? allCodes.map(c => `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/30">
            <td class="py-3 px-4 text-sm font-mono font-bold text-emerald-400">${c.code}</td>
            <td class="py-3 px-4 text-sm text-slate-300">${c.minCoins} - ${c.maxCoins} Koin</td>
            <td class="py-3 px-4 text-sm text-cyan-400">${c.quota} Kuota</td>
            <td class="py-3 px-4 text-right">
                <button onclick="deleteCode('${c.code}')" class="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer">
                    <i class="fa-solid fa-trash mr-1"></i> Hapus
                </button>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="4" class="py-4 text-center text-xs text-slate-500">Belum ada kode redeem aktif</td></tr>`;

    const isOnline = currentServerStatus === 'online';

    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Panel - BANGGUS REACH</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col justify-between">
        <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
            <div class="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center">
                        <i class="fa-solid fa-shield-halved text-white"></i>
                    </div>
                    <div><h1 class="font-bold text-base">ADMIN BANGGUS</h1><p class="text-xs text-slate-400">Administrator: ${user.username}</p></div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-300 flex items-center space-x-1.5">
                        <i class="fa-solid fa-coins text-amber-400"></i>
                        <span id="adminCoinDisplay">${user.coins} Koin (Admin)</span>
                    </div>
                    <a href="/logout" class="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-all">
                        <i class="fa-solid fa-right-from-bracket mr-1"></i> Keluar
                    </a>
                </div>
            </div>
        </header>

        <main class="max-w-5xl w-full mx-auto px-4 py-10 flex-grow space-y-8">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Pengguna</div>
                    <div class="text-3xl font-bold text-emerald-400">${allUsers.length}</div>
                </div>
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                    <div>
                        <div class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Status Server</div>
                        <div class="text-lg font-bold ${isOnline ? 'text-cyan-400' : 'text-red-400'} flex items-center mt-1">
                            <span class="w-2 h-2 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'} rounded-full mr-2 animate-pulse"></span> 
                            <span id="serverStatusText">${isOnline ? 'Online (Aktif)' : 'Offline (Dimatikan)'}</span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button onclick="toggleServer()" id="toggleServerBtn" class="w-full text-xs font-bold py-2 rounded-xl transition-all cursor-pointer ${isOnline ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}">
                            <i class="fa-solid fa-power-off mr-1"></i> ${isOnline ? 'Matikan Server (Offline)' : 'Nyalakan Server (Online)'}
                        </button>
                    </div>
                </div>
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Kode Aktif</div>
                    <div class="text-3xl font-bold text-purple-400">${allCodes.length}</div>
                </div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-lg font-bold text-white mb-1"><i class="fa-solid fa-bolt mr-2 text-purple-400"></i>Kirim Reaksi WhatsApp (Admin)</h2>
                        <p class="text-xs text-slate-400">Fitur kirim reaksi langsung dari panel admin tanpa biaya koin.</p>
                    </div>
                </div>
                <form id="adminReactForm" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Link Channel WhatsApp</label>
                        <input type="text" id="adminLink" required placeholder="https://whatsapp.com/channel/..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Emoji Reaksi</label>
                        <input type="text" id="adminEmoji" required placeholder="🔥, 👍, ❤️" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <button type="submit" id="adminSubmitBtn" class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold py-3 rounded-xl shadow-lg transition-all cursor-pointer">
                        Kirim Reaksi
                    </button>
                </form>
                <div id="adminResultContainer" class="mt-6 hidden">
                    <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-4 text-xs font-mono text-purple-400">
                        <div class="flex items-center space-x-2 text-purple-400 font-bold mb-1">
                            <i class="fa-solid fa-shield-check"></i>
                            <span>Admin Eksekusi Reaksi Berhasil</span>
                        </div>
                        <p class="text-slate-400 text-[11px]">reaksi telah terkirim silakan tunggu beberapa menit.</p>
                    </div>
                </div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-ticket mr-2 text-purple-400"></i>Buat Kode Redeem Baru</h2>
                <form id="createCodeForm" class="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Nama Kode</label>
                        <input type="text" id="code" required placeholder="Cth: BONUSBANGGUS" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 uppercase">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Min Koin</label>
                        <input type="number" id="minCoins" required placeholder="1" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Max Koin</label>
                        <input type="number" id="maxCoins" required placeholder="10" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Kuota Pakai</label>
                        <input type="number" id="quota" required placeholder="50" class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <div class="flex items-end">
                        <button type="submit" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-xl text-sm transition-all cursor-pointer">Buat Kode</button>
                    </div>
                </form>
                <div id="codeAlert" class="mt-3 text-xs hidden"></div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-list mr-2 text-cyan-400"></i>Daftar Kode Redeem Aktif</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-800 text-xs font-semibold uppercase text-slate-400">
                                <th class="py-3 px-4">Kode</th>
                                <th class="py-3 px-4">Rentang Koin Acak</th>
                                <th class="py-3 px-4">Sisa Kuota</th>
                                <th class="py-3 px-4 text-right">Aksi Hapus</th>
                            </tr>
                        </thead>
                        <tbody>${codeRows}</tbody>
                    </table>
                </div>
            </div>

            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-users mr-2 text-purple-400"></i>Daftar Akun Terdaftar</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-800 text-xs font-semibold uppercase text-slate-400">
                                <th class="py-3 px-4">Username</th>
                                <th class="py-3 px-4">Role</th>
                                <th class="py-3 px-4">Saldo Koin</th>
                                <th class="py-3 px-4">Client ID</th>
                            </tr>
                        </thead>
                        <tbody>${userRows}</tbody>
                    </table>
                </div>
            </div>
        </main>

        <footer class="border-t border-slate-900 bg-slate-950/50 py-4 text-center text-xs text-slate-500">Powered by BANGGUS REACH</footer>

        <script>
            async function toggleServer() {
                try {
                    const res = await fetch('/api/admin/toggle-server', {
                        method: 'POST', headers: {'Content-Type': 'application/json'}
                    });
                    const data = await res.json();
                    if(data.success) {
                        window.location.reload();
                    } else {
                        alert(data.error);
                    }
                } catch(e) {
                    alert('Gagal mengubah status server');
                }
            }

            async function deleteCode(code) {
                if(!confirm('Yakin ingin menghapus kode redeem ' + code + '?')) return;
                try {
                    const res = await fetch('/api/admin/delete-code', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({code})
                    });
                    const data = await res.json();
                    if(data.success) {
                        window.location.reload();
                    } else {
                        alert(data.error);
                    }
                } catch(e) {
                    alert('Gagal menghapus kode');
                }
            }

            document.getElementById('createCodeForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = document.getElementById('code').value;
                const minCoins = document.getElementById('minCoins').value;
                const maxCoins = document.getElementById('maxCoins').value;
                const quota = document.getElementById('quota').value;
                const alertBox = document.getElementById('codeAlert');

                try {
                    const res = await fetch('/api/admin/create-code', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({code, minCoins, maxCoins, quota})
                    });
                    const data = await res.json();
                    alertBox.classList.remove('hidden');
                    if(data.success) {
                        alertBox.className = 'mt-3 text-xs p-2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        alertBox.textContent = data.message;
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        alertBox.className = 'mt-3 text-xs p-2 rounded bg-red-500/10 text-red-400 border border-red-500/20';
                        alertBox.textContent = data.error;
                    }
                } catch(err) {
                    alert('Gagal membuat kode redeem');
                }
            });

            document.getElementById('adminReactForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const link = document.getElementById('adminLink').value;
                const emoji = document.getElementById('adminEmoji').value;
                const btn = document.getElementById('adminSubmitBtn');
                const outContainer = document.getElementById('adminResultContainer');
                
                btn.disabled = true; btn.textContent = 'Memproses...';
                outContainer.classList.add('hidden');
                try {
                    const res = await fetch('/api/react', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({link, emoji})
                    });
                    const data = await res.json();
                    if(data.success) {
                        outContainer.classList.remove('hidden');
                        document.getElementById('adminCoinDisplay').textContent = data.remainingCoins + ' Koin (Admin)';
                    } else {
                        alert(data.error);
                    }
                } catch(err) {
                    alert('Gagal: ' + err.message);
                } finally {
                    btn.disabled = false; btn.textContent = 'Kirim Reaksi (Bebas Biaya)';
                }
            });
        </script>
    </body>
    </html>
    `;
}

// WAJIB UNTUK VERCEL SERVERLESS
module.exports = app;