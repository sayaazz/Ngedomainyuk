// Mesin toko kode promo domain .my.id — versi Netlify (functions + Blobs).
// Rahasia (kode promo, secret webhook, PIN) TIDAK ada di file ini —
// semuanya dari Environment Variables Netlify.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const PROMO_CODE = process.env.PROMO_CODE || '';
export const PROMO_LINK = process.env.PROMO_LINK || 'https://order.idwebhost.com/domain-gratis';
export const PRICE = 1000;
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const ADMIN_PIN = process.env.ADMIN_PIN || '';
export const EXPIRY_MIN = 30;
export const MERCHANT_NAME = 'KHARQA, CINANGKA';
// Payload QRIS statis KHARQA (GoPay Merchant) — bukan rahasia, QR memang dipajang publik.
export const QRIS_PAYLOAD = '00020101021126610014COM.GO-JEK.WWW01189360091439003334010210G9003334010303UMI51440014ID.CO.QRIS.WWW0215ID10254310493250303UMI5204549953033605802ID5916KHARQA, CINANGKA6006SERANG61054216762140703A01110362163049BCE';

// ---------------- penyimpanan pesanan di Netlify Blobs ----------------
const LOCAL_FILE = '/tmp/domain-shop-orders.json';

export async function loadOrders() {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('domain-shop');
    const data = await store.get('orders.json', { type: 'json' });
    return data || {};
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); } catch (e2) { return {}; }
  }
}

export async function saveOrders(orders) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('domain-shop');
    await store.setJSON('orders.json', orders);
    return;
  } catch (e) {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(orders));
  }
}

export function catatLog(orders, baris) {
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
export function qrisDinamis(payloadStatis, nominal) {
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
export function ekstrakNominal(teks) {
  const m = /Rp\.?\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)/.exec(teks || '');
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : 0;
}

// ---------------- helper umum ----------------
export function buatKode() {
  const huruf = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(6);
  let k = 'KD-';
  for (let i = 0; i < 6; i++) k += huruf[buf[i] % huruf.length];
  return k;
}
export function kedaluwarsa(o) {
  if (!o.ts) return true;
  return (Date.now() - o.ts) > EXPIRY_MIN * 60000;
}
export function waktuWIB() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });
}
export async function readInput(request) {
  let data = {};
  try {
    const u = new URL(request.url);
    for (const entry of u.searchParams) data[entry[0]] = entry[1];
  } catch (e) { /* abaikan */ }
  if (request.method !== 'GET') {
    let raw = '';
    try { raw = await request.text(); } catch (e) { /* abaikan */ }
    if (raw) {
      try { data = Object.assign(data, JSON.parse(raw)); }
      catch (e) { data = Object.assign(data, Object.fromEntries(new URLSearchParams(raw))); }
    }
  }
  return data;
}
export function jsonRes(obj, code = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
export function secretSama(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
export function adminToken() {
  return crypto.createHmac('sha256', WEBHOOK_SECRET || 'cadangan').update('admin:' + ADMIN_PIN).digest('hex').slice(0, 32);
}
export function isAdmin(request) {
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';').some(function (c) { return c.trim() === 'admin=' + adminToken(); });
}
