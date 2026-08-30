const express = require('express');
const crypto = require('crypto');
const { exec } = require('node:child_process');
const Go = require('@xof/fetch');
const cookieParser = require('cookie-parser');
const Pusher = require('pusher');

const app = express();
const PORT = process.env.PORT || 3000;

// --- KONFIGURASI PUSHER FOR VERCEL REAL-TIME ---
const PUSHER_KEY = process.env.PUSHER_KEY || "60635481dadc77515254";
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "2190190",
  key: PUSHER_KEY,
  secret: process.env.PUSHER_SECRET || "6a372a5e062d3878dd2b",
  cluster: process.env.PUSHER_CLUSTER || "ap1",
  useTLS: true
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- DATABASE MEMORI ---
const users = [
    { username: 'adminbagus', password: 'baguss', role: 'admin', coins: 99999, clientId: 'nx_admin00000000000000', redeemedCodes: [], lastCoinReset: Date.now() }
];
const redeemCodes = [];
const sessions = new Map();

// --- FUNGSI HELPER RESET KOIN 24 JAM ---
function checkAndResetCoins(user) {
    if (user.role === 'admin') return;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (!user.lastCoinReset) {
        user.lastCoinReset = now;
    } else if (now - user.lastCoinReset >= twentyFourHours) {
        if (user.coins <= 0) {
            user.coins = 3;
        }
        user.lastCoinReset = now;
    }
}

// --- LOGIKA UTAMA DARI KODE ANDA ---
const Random = () => Math.floor(Math.random() * 10000000);
const Uid = () => 'nx_' + crypto.randomUUID().replace(/-/g,'').slice(0,21);
const Password = () => crypto.randomBytes(7).toString('base64') + 'XOF-A1!';
const generateFakeIP = () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const fpHash = Math.abs(Math.floor(Math.random() * 1000000)).toString(16);
const fakeIP = generateFakeIP();
const fb = () => ({ headers: { 'X-Device-Fingerprint': `fp_${fpHash}`, 'X-Forwarded-For': fakeIP, 'X-Real-IP': fakeIP, 'True-Client-IP': fakeIP } }); 
let T;

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

async function handshake(taunting = 9) {
  const res = await new Promise((resolve, reject) => {
  exec(`curl 'https://anzzmodsofficial.edgeone.dev/api/v1/handshake' -X POST -H 'Accept: */*' -H 'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' -H 'Cache-Control: no-cache' -H 'Connection: keep-alive' -H 'Content-Length: 0' -H 'Origin: https://reach-wa-nexus.vercel.app' -H 'Pragma: no-cache' -H 'Referer: https://reach-wa-nexus.vercel.app/' -H 'Sec-Fetch-Dest: empty' -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Site: cross-site' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' -H 'X-API-Key: anzz_live_18fc288f3fbc64643542c40197a5713f0aef51e354a6c254' -H 'sec-ch-ua: "Chromium";v="137", "Not/A)Brand";v="24"' -H 'sec-ch-ua-mobile: ?1' -H 'sec-ch-ua-platform: "Android"' --compressed`, (err, stdout) => {
    if (err) return reject(err);
    try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
  });
});
  if (res.ok && res.token) return res.token;
  if(typeof res.error === 'string' && res.error.includes('key_')) {
    let attempt = 0;
    while(res.error.includes('key_') && attempt < Number(taunting)) {
        attempt++;
        await new Promise(r => setTimeout(r, 1000));
     }
  }
  return 0;
}

async function send(url, reactions){
  const t = await handshake();
  if (typeof t === 'string') { T = t; }
  reactions = parseEmoji(reactions);
  const isValid = /^https:\/\/(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]+\/\d+$/.test(url);
  if(!isValid) throw new Error('invalid url (Pastikan format link channel WhatsApp benar)');
  
  const res = await new Promise((resolve, reject) => { 
   exec(`curl '${config.api}/api/v1/react' -X POST -H 'Accept: */*' -H 'Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' -H 'Cache-Control: no-cache' -H 'Connection: keep-alive' -H 'Content-Type: application/json' -H 'Origin: https://reach-wa-nexus.vercel.app' -H 'Pragma: no-cache' -H 'Referer: https://reach-wa-nexus.vercel.app/' -H 'Sec-Fetch-Dest: empty' -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Site: cross-site' -H 'User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' -H 'X-API-Key: ${config.apikey}' -H 'X-Handshake-Token: ${T}' -H 'sec-ch-ua: "Chromium";v="137", "Not/A)Brand";v="24"' -H 'sec-ch-ua-mobile: ?1' -H 'sec-ch-ua-platform: "Android"' --data-raw '${JSON.stringify({ url, reactions })}' --compressed`, (err, stdout) => {
    if (err) return reject(err);
    try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
  });
});
  return res;
}

// --- MIDDLEWARE AUTENTIKASI ---
function checkAuth(req, res, next) {
    const token = req.cookies.session_token;
    if (token && sessions.has(token)) {
        const sessionUser = sessions.get(token);
        const latestUser = users.find(u => u.username === sessionUser.username);
        if (latestUser) {
            checkAndResetCoins(latestUser);
            req.user = latestUser;
            next();
            return;
        }
    }
    res.redirect('/login');
}

function guestOnly(req, res, next) {
    const token = req.cookies.session_token;
    if (token && sessions.has(token)) {
        const sessionUser = sessions.get(token);
        const latestUser = users.find(u => u.username === sessionUser.username);
        if (latestUser) {
            return res.redirect(latestUser.role === 'admin' ? '/admin' : '/');
        }
    }
    next();
}

// --- API ENDPOINT FOR PUSHER CHAT REALTIME ---
app.post('/api/chat/send', checkAuth, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' });
    }

    const msgPayload = {
        id: crypto.randomUUID(),
        username: req.user.username,
        role: req.user.role,
        message: message.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
        await pusher.trigger('global-chat-channel', 'new_message', msgPayload);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Gagal mempublikasikan pesan real-time' });
    }
});

// --- ROUTE AUTH ---
app.get('/login', guestOnly, (req, res) => res.send(renderAuthPage('login')));
app.get('/register', guestOnly, (req, res) => res.send(renderAuthPage('register')));

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ success: false, error: 'Username atau password salah!' });
    
    checkAndResetCoins(user);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionToken, user);
    
    res.cookie('session_token', sessionToken, { 
        httpOnly: true, 
        maxAge: 7 * 24 * 60 * 60 * 1000 
    });
    
    res.json({ success: true, role: user.role });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Semua kolom wajib diisi!' });
    if (users.find(u => u.username === username)) return res.status(400).json({ success: false, error: 'Username sudah digunakan!' });
    
    const clientId = Uid();
    try {
        await registerXof(username, password, clientId);
        users.push({ username, password, role: 'user', coins: 3, clientId, redeemedCodes: [], lastCoinReset: Date.now() });
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
app.get('/', checkAuth, (req, res) => {
    if (req.user.role === 'admin') return res.redirect('/admin');
    res.send(renderDashboardUser(req.user));
});

app.get('/admin', checkAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.redirect('/');
    res.send(renderDashboardAdmin(req.user, users, redeemCodes));
});

// --- API ENDPOINT REACT ---
app.post('/api/react', checkAuth, async (req, res) => {
    const { link, emoji } = req.body;
    if (!link || !emoji) return res.status(400).json({ success: false, error: 'Link & emoji wajib diisi!' });
    
    if (req.user.role !== 'admin' && req.user.coins < 1) {
        return res.status(400).json({ success: false, error: 'Koin Anda habis! Koin akan direset otomatis dalam 24 jam atau tukar kode redeem.' });
    }

    try {
        const result = await send(link, emoji);
        if (req.user.role !== 'admin') {
            req.user.coins -= 1;
        }
        res.json({ success: true, remainingCoins: req.user.coins, result });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- API REDEEM & ADMIN ---
app.post('/api/redeem', checkAuth, (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Kode redeem wajib diisi!' });

    const targetCodeIndex = redeemCodes.findIndex(c => c.code === code.trim().toUpperCase());
    if (targetCodeIndex === -1) return res.status(400).json({ success: false, error: 'Kode redeem tidak valid!' });

    const targetCode = redeemCodes[targetCodeIndex];

    if (targetCode.quota <= 0) {
        redeemCodes.splice(targetCodeIndex, 1);
        return res.status(400).json({ success: false, error: 'Kuota kode redeem ini sudah habis dan telah dihapus dari sistem!' });
    }

    if (!req.user.redeemedCodes) req.user.redeemedCodes = [];
    if (req.user.redeemedCodes.includes(targetCode.code)) {
        return res.status(400).json({ success: false, error: 'Anda sudah pernah menggunakan kode redeem ini!' });
    }

    const earnedCoins = Math.floor(Math.random() * (targetCode.maxCoins - targetCode.minCoins + 1)) + targetCode.minCoins;
    
    req.user.coins += earnedCoins;
    targetCode.quota -= 1;
    req.user.redeemedCodes.push(targetCode.code);

    if (targetCode.quota <= 0) {
        redeemCodes.splice(targetCodeIndex, 1);
    }

    res.json({ success: true, earnedCoins, totalCoins: req.user.coins, message: `Berhasil menukar kode! Anda mendapatkan ${earnedCoins} koin.` });
});

app.post('/api/admin/create-code', checkAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Akses ditolak!' });
    
    const { code, minCoins, maxCoins, quota } = req.body;
    if (!code || minCoins === undefined || maxCoins === undefined || quota === undefined) {
        return res.status(400).json({ success: false, error: 'Semua field wajib diisi!' });
    }

    const formattedCode = code.trim().toUpperCase();
    if (redeemCodes.some(c => c.code === formattedCode)) {
        return res.status(400).json({ success: false, error: 'Kode redeem sudah ada!' });
    }

    const parsedMin = parseInt(minCoins);
    const parsedMax = parseInt(maxCoins);
    const parsedQuota = parseInt(quota);

    if (parsedMin > parsedMax) {
        return res.status(400).json({ success: false, error: 'Min Koin tidak boleh lebih besar dari Max Koin!' });
    }

    redeemCodes.push({
        code: formattedCode,
        minCoins: parsedMin,
        maxCoins: parsedMax,
        quota: parsedQuota
    });

    res.json({ success: true, message: 'Kode redeem berhasil dibuat!' });
});

app.post('/api/admin/delete-code', checkAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Akses ditolak!' });
    const { code } = req.body;
    const index = redeemCodes.findIndex(c => c.code === code);
    if (index !== -1) {
        redeemCodes.splice(index, 1);
        return res.json({ success: true, message: 'Kode redeem berhasil dihapus.' });
    }
    res.status(400).json({ success: false, error: 'Kode tidak ditemukan.' });
});

// ==========================================
// TEMPLATE HALAMAN HTML
// ==========================================

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
                <p class="text-xs text-slate-400 mt-1">${isLogin ? 'Silakan masuk dengan akun Anda' : 'Daftar sekarang & bergabung bersama komunitas!'}</p>
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

function renderDashboardUser(user) {
    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - BANGGUS REACH</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://js.pusher.com/8.0.1/pusher.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col justify-between">
        <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
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

        <main class="max-w-3xl w-full mx-auto px-4 py-8 flex-grow space-y-6">
            <!-- FITUR REAKSI & REDEEM -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h3 class="text-sm font-bold text-white mb-2"><i class="fa-solid fa-ticket mr-2 text-emerald-400"></i>Kode Redeem</h3>
                    <p class="text-xs text-slate-400 mb-4">Tukar kode unik untuk klaim koin acak.</p>
                    <form id="redeemForm" class="flex gap-2">
                        <input type="text" id="redeemCodeInput" required placeholder="Kode redeem..." class="flex-grow bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 uppercase">
                        <button type="submit" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer">Tukar</button>
                    </form>
                    <div id="redeemAlert" class="mt-3 text-xs hidden p-2 rounded-lg"></div>
                </div>

                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h3 class="text-sm font-bold text-white mb-2"><i class="fa-solid fa-paper-plane mr-2 text-cyan-400"></i>Kirim Reaksi</h3>
                    <form id="reactForm" class="space-y-3">
                        <input type="text" id="link" required placeholder="Link Channel WhatsApp..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500">
                        <input type="text" id="emoji" required placeholder="Emoji (🔥, 👍, ❤️)..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500">
                        <button type="submit" id="submitBtn" class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold py-2 rounded-xl text-xs transition-all cursor-pointer">Kirim Reaksi (1 Koin)</button>
                    </form>
                    <div id="resultContainer" class="mt-3 hidden text-[11px] text-emerald-400 bg-slate-950 p-2 rounded-lg border border-slate-800">Eksekusi Berhasil!</div>
                </div>
            </div>

            <!-- GLOBAL LIVE CHAT COMMUNITY -->
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-base font-bold text-white flex items-center">
                            <i class="fa-solid fa-users text-emerald-400 mr-2"></i> Ruang Chat Komunitas (Global Live)
                        </h2>
                        <p class="text-xs text-slate-400">Tempat kumpul seluruh pengguna dan admin secara real-time.</p>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                            <span>Live Vercel</span>
                        </span>
                    </div>
                </div>

                <!-- Chat Box Area -->
                <div id="chatBox" class="h-80 overflow-y-auto bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 mb-4 text-xs">
                    <!-- Pesan real-time dari semua user tampil di sini -->
                </div>

                <form id="chatForm" class="flex gap-2">
                    <input type="text" id="chatInput" required placeholder="Ketik pesan untuk semua orang..." class="flex-grow bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                    <button type="submit" class="bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer flex items-center">
                        <i class="fa-solid fa-paper-plane mr-1.5"></i> Kirim
                    </button>
                </form>
            </div>
        </main>

        <footer class="border-t border-slate-900 bg-slate-950/50 py-4 text-center text-xs text-slate-500">Powered by BANGGUS REACH</footer>

        <script>
            const currentUsername = "${user.username}";
            const currentRole = "${user.role}";
            
            // Inisialisasi Pusher Client Side
            const pusher = new Pusher("${PUSHER_KEY}", { cluster: 'ap1' });
            const channel = pusher.subscribe('global-chat-channel');

            const chatBox = document.getElementById('chatBox');
            const chatForm = document.getElementById('chatForm');
            const chatInput = document.getElementById('chatInput');

            function appendMessage(msg) {
                const isMe = msg.username === currentUsername;
                const msgEl = document.createElement('div');
                msgEl.className = 'flex flex-col ' + (isMe ? 'items-end' : 'items-start');
                
                let badge = '';
                if(msg.role === 'admin') {
                    badge = '<span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">ADMIN</span>';
                } else if(!isMe) {
                    badge = '<span class="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">MEMBER</span>';
                }

                msgEl.innerHTML = `
                    <div class="flex items-center space-x-1 text-[11px] text-slate-400 mb-0.5">
                        <span class="font-semibold \${isMe ? 'text-emerald-400' : 'text-slate-300'}">\${msg.username}</span>
                        \${badge}
                        <span class="text-[9px] text-slate-500 ml-1">\${msg.time}</span>
                    </div>
                    <div class="max-w-[85%] rounded-xl px-3.5 py-2 \${isMe ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30' : (msg.role === 'admin' ? 'bg-purple-900/40 text-purple-200 border border-purple-700/50' : 'bg-slate-800/80 text-slate-200 border border-slate-700/50')}">
                        \${msg.message}
                    </div>
                `;
                chatBox.appendChild(msgEl);
                chatBox.scrollTop = chatBox.scrollHeight;
            }

            // Mendengar event pesan baru dari Pusher
            channel.bind('new_message', function(msg) {
                appendMessage(msg);
            });

            // Kirim pesan via HTTP Endpoint Vercel
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = chatInput.value;
                if(text.trim()) {
                    chatInput.value = '';
                    await fetch('/api/chat/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text })
                    });
                }
            });

            // REDEEM & REACT FORM HANDLERS
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
                outContainer.classList.remove('hidden');
                try {
                    const res = await fetch('/api/react', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({link, emoji})
                    });
                    const data = await res.json();
                    if(data.success) {
                        document.getElementById('coinDisplay').textContent = data.remainingCoins + ' Koin';
                    } else {
                        alert(data.error);
                        outContainer.classList.add('hidden');
                    }
                } catch(err) {
                    alert('Gagal: ' + err.message);
                    outContainer.classList.add('hidden');
                } finally {
                    btn.disabled = false; btn.textContent = 'Kirim Reaksi (1 Koin)';
                }
            });
        </script>
    </body>
    </html>
    `;
}

function renderDashboardAdmin(user, allUsers, allCodes) {
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

    return `
    <!DOCTYPE html>
    <html lang="id" class="dark">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Panel - BANGGUS REACH</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://js.pusher.com/8.0.1/pusher.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col justify-between">
        <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
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
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Status Chat</div>
                    <div class="text-3xl font-bold text-cyan-400 flex items-center"><span class="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2 animate-pulse"></span> Active</div>
                </div>
                <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                    <div class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Kode Aktif</div>
                    <div class="text-3xl font-bold text-purple-400">${allCodes.length}</div>
                </div>
            </div>

            <!-- CHAT ROOM GLOBAL LIVE ADMIN -->
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h2 class="text-base font-bold text-white flex items-center">
                            <i class="fa-solid fa-comments text-purple-400 mr-2"></i> Ruang Chat Komunitas (Admin Room)
                        </h2>
                        <p class="text-xs text-slate-400">Ikut serta dalam percakapan publik secara real-time.</p>
                    </div>
                </div>

                <div id="adminChatBox" class="h-72 overflow-y-auto bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 mb-4 text-xs">
                    <!-- Chat Realtime -->
                </div>

                <form id="adminChatForm" class="flex gap-2">
                    <input type="text" id="adminChatInput" required placeholder="Tulis pengumuman / balasan..." class="flex-grow bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500">
                    <button type="submit" class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer flex items-center">
                        <i class="fa-solid fa-paper-plane mr-1.5"></i> Kirim
                    </button>
                </form>
            </div>

            <!-- FUNGSI REAKSI & KODE REDEEM -->
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <h2 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-bolt mr-2 text-purple-400"></i>Kirim Reaksi WhatsApp (Admin)</h2>
                <form id="adminReactForm" class="space-y-4">
                    <div>
                        <input type="text" id="adminLink" required placeholder="Link Channel WhatsApp..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <div>
                        <input type="text" id="adminEmoji" required placeholder="Emoji Reaksi (🔥, 👍, ❤️)..." class="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500">
                    </div>
                    <button type="submit" id="adminSubmitBtn" class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold py-3 rounded-xl shadow-lg transition-all cursor-pointer">
                        Kirim Reaksi (Bebas Biaya)
                    </button>
                </form>
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
            const currentUsername = "${user.username}";
            const currentRole = "${user.role}";
            
            // Inisialisasi Pusher Client Side
            const pusher = new Pusher("${PUSHER_KEY}", { cluster: 'ap1' });
            const channel = pusher.subscribe('global-chat-channel');

            const adminChatBox = document.getElementById('adminChatBox');
            const adminChatForm = document.getElementById('adminChatForm');
            const adminChatInput = document.getElementById('adminChatInput');

            function appendAdminMessage(msg) {
                const isMe = msg.username === currentUsername;
                const msgEl = document.createElement('div');
                msgEl.className = 'flex flex-col ' + (isMe ? 'items-end' : 'items-start');
                
                let badge = '';
                if(msg.role === 'admin') {
                    badge = '<span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">ADMIN</span>';
                } else {
                    badge = '<span class="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] px-1.5 py-0.2 rounded font-semibold ml-1">MEMBER</span>';
                }

                msgEl.innerHTML = `
                    <div class="flex items-center space-x-1 text-[11px] text-slate-400 mb-0.5">
                        <span class="font-semibold \${isMe ? 'text-purple-400' : 'text-slate-300'}">\${msg.username}</span>
                        \${badge}
                        <span class="text-[9px] text-slate-500 ml-1">\${msg.time}</span>
                    </div>
                    <div class="max-w-[85%] rounded-xl px-3.5 py-2 \${isMe ? 'bg-purple-600/20 text-purple-100 border border-purple-500/30' : 'bg-slate-800/80 text-slate-200 border border-slate-700/50'}">
                        \${msg.message}
                    </div>
                `;
                adminChatBox.appendChild(msgEl);
                adminChatBox.scrollTop = adminChatBox.scrollHeight;
            }

            channel.bind('new_message', function(msg) {
                appendAdminMessage(msg);
            });

            adminChatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = adminChatInput.value;
                if(text.trim()) {
                    adminChatInput.value = '';
                    await fetch('/api/chat/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text })
                    });
                }
            });

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
                
                btn.disabled = true; btn.textContent = 'Memproses...';
                try {
                    const res = await fetch('/api/react', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({link, emoji})
                    });
                    const data = await res.json();
                    if(data.success) {
                        alert('Reaksi Berhasil Dikirim!');
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

// Menjalankan Server (Support Localhost & Vercel Serverless Function)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log('═══════════════════════════════════════════');
        console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
        console.log(`👑 Admin: username 'adminbagus' | password 'baguss'`);
        console.log('═══════════════════════════════════════════');
    });
}

module.exports = app;