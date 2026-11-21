// Buat transaksi Snap Midtrans untuk sebuah pesanan toko.
// Input: { code: 'KD-XXXXXX' } -> { ok, token, redirect_url, client_key }
// Kunci dari Environment Variables Netlify:
//   MIDTRANS_SERVER_KEY   (rahasia, server-side saja)
//   MIDTRANS_CLIENT_KEY   (publik, buat snap.js)
//   MIDTRANS_PRODUCTION   ('true' = produksi, selain itu sandbox)
import * as lib from '../../lib/shop.mjs';

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || '';
const IS_PROD = process.env.MIDTRANS_PRODUCTION === 'true';
const SNAP_URL = (IS_PROD ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com')
  + '/snap/v1/transactions';

export default async function handler(request) {
  try {
    if (!SERVER_KEY) return lib.jsonRes({ ok: false, msg: 'Midtrans belum diatur di server.' }, 503);
    const input = await lib.readInput(request);
    const code = String(input.code || '').toUpperCase().trim();
    if (!code) return lib.jsonRes({ ok: false, msg: 'kode pesanan kosong' }, 400);

    const orders = await lib.loadOrders();
    const o = orders[code];
    if (!o) return lib.jsonRes({ ok: false, msg: 'pesanan tidak ditemukan' }, 404);
    if (o.status !== 'pending') return lib.jsonRes({ ok: true, status: o.status });
    if (lib.kedaluwarsa(o)) return lib.jsonRes({ ok: false, msg: 'pesanan sudah kedaluwarsa, buat pesanan baru' }, 410);

    const auth = Buffer.from(SERVER_KEY + ':').toString('base64');
    const resp = await fetch(SNAP_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth,
      },
      body: JSON.stringify({
        transaction_details: { order_id: code, gross_amount: o.total },
        enabled_payments: ['qris'],
        customer_details: { first_name: String(o.nama || 'Pembeli').slice(0, 50) },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.token) {
      const pesan = (data.error_messages || data.status_message || 'Midtrans menolak transaksi');
      lib.catatLog(orders, 'MIDTRANS create GAGAL ' + code + ' | ' + JSON.stringify(pesan).slice(0, 200));
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: false, msg: 'Midtrans: ' + pesan }, 502);
    }
    lib.catatLog(orders, 'MIDTRANS create OK ' + code + ' total ' + o.total + (IS_PROD ? ' (PRODUKSI)' : ' (sandbox)'));
    await lib.saveOrders(orders);
    return lib.jsonRes({ ok: true, token: data.token, redirect_url: data.redirect_url, client_key: CLIENT_KEY, sandbox: !IS_PROD });
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'server error' }, 500);
  }
}

export const config = { path: '/api/midtrans-create' };
