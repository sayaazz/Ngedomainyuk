// Mesin toko kode promo domain .my.id — versi Vercel (Node serverless).
// Rahasia (kode promo, secret webhook, PIN) TIDAK ada di file ini —
// semuanya dari Environment Variables project Vercel.
const crypto = require('crypto');
const fs = require('fs');

const PROMO_CODE = process.env.PROMO_CODE || '';
const PROMO_LINK = process.env.PROMO_LINK || '';
const PRICE = 1000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const ADMIN_PIN = process.env.ADMIN_PIN || '';
const EXPIRY_MIN = 30;
const MERCHANT_NAME = 'KHARQA, CINANGKA';
// Payload QRIS statis KHARQA (GoPay Merchant) — bukan rahasia, QR memang dipajang publik.
const QRIS_PAYLOAD = '00020101021126610014COM.GO-JEK.WWW01189360091439003334010210G9003334010303UMI51440014ID.CO.QRIS.WWW0215ID10254310493250303UMI5204549953033605802ID5916KHARQA, CINANGKA6006SERANG61054216762140703A01110362163049BCE';

// ---------------- penyimpanan pesanan di Vercel Blob ----------------
const ORDERS_PATH = 'domain-shop/orders.json';
const LOCAL_FILE = '/tmp/domain-shop-orders.json';

async function streamToString(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

async function loadOrders() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); } catch (e) { return {}; }
  }
  const { get } = require('@vercel/blob');
  const res = await get(ORDERS_PATH, { access: 'private' });
  if (!res || res.statusCode !== 200 || !res.stream) return {};
  const text = await streamToString(res.stream);
  try { return JSON.parse(text); } catch (e) { return {}; }
}

async function saveOrders(orders) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(orders));
    return;
  }
  const { put } = require('@vercel/blob');
  await put(ORDERS_PATH, JSON.stringify(orders), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function catatLog(orders, baris) {
  if (!Array.isArray(orders._log)) orders._log = [];
  orders._log.push(new Date().toISOString() + ' | ' + baris);
  if (orders._log.length > 50) orders._log = orders._log.slice(-50);
}

// ---------------- QRIS dinamis (standar EMVCo) ----------------
function qrisCrc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) << 8);
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function qrisParse(payload) {
  const out = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.substr(i, 2);
    const n = parseInt(payload.substr(i + 2, 2), 10);
    out.push([tag, payload.substr(i + 4, n)]);
    i += 4 + n;
  }
  return out;
}
// Tag 01 -> 12 (dinamis), tag 54 (nominal) disisipkan setelah tag 53, CRC dihitung ulang.
function qrisDinamis(payloadStatis, nominal) {
  let out = '';
  let sudah = false;
  for (const pair of qrisParse(payloadStatis)) {
    const tag = pair[0];
    let val = pair[1];
    if (tag === '63') continue;
    if (tag === '01') val = '12';
    out += tag + String(val.length).padStart(2, '0') + val;
    if (tag === '53' && !sudah) {
      const nom = String(nominal);
      out += '54' + String(nom.length).padStart(2, '0') + nom;
      sudah = true;
    }
  }
  out += '6304';
  out += qrisCrc16(out);
  return out;
}
// "Pembayaran QRIS Rp1.137 diterima" -> 1137
function ekstrakNominal(teks) {
  const m = /Rp\.?\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)/.exec(teks || '');
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : 0;
}

// ---------------- helper umum ----------------
function buatKode() {
  const huruf = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(6);
  let k = 'KD-';
  for (let i = 0; i < 6; i++) k += huruf[buf[i] % huruf.length];
  return k;
}
function kedaluwarsa(o) {
  if (!o.ts) return true;
  return (Date.now() - o.ts) > EXPIRY_MIN * 60000;
}
function waktuWIB() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });
}
async function readInput(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  let data = {};
  if (raw) {
    try { data = JSON.parse(raw); }
    catch (e) { data = Object.fromEntries(new URLSearchParams(raw)); }
  }
  try {
    const u = new URL(req.url, 'http://localhost');
    for (const entry of u.searchParams) {
      if (!(entry[0] in data)) data[entry[0]] = entry[1];
    }
  } catch (e) { /* abaikan */ }
  return data;
}
function jsonRes(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function secretSama(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function adminToken() {
  return crypto.createHmac('sha256', WEBHOOK_SECRET || 'cadangan').update('admin:' + ADMIN_PIN).digest('hex').slice(0, 32);
}
function isAdmin(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some(function (c) { return c.trim() === 'admin=' + adminToken(); });
}

module.exports = {
  PROMO_CODE, PROMO_LINK, PRICE, WEBHOOK_SECRET, ADMIN_PIN, EXPIRY_MIN,
  MERCHANT_NAME, QRIS_PAYLOAD,
  loadOrders, saveOrders, catatLog,
  qrisDinamis, ekstrakNominal,
  buatKode, kedaluwarsa, waktuWIB, readInput, jsonRes, secretSama,
  adminToken, isAdmin,
};
