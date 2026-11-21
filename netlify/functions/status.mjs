import * as lib from '../../lib/shop.mjs';

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    const kode = String(input.code || '').toUpperCase().trim();
    const orders = await lib.loadOrders();
    if (!kode || !orders[kode] || kode.startsWith('_')) {
      return lib.jsonRes({ ok: false, msg: 'Kode pesanan tidak ditemukan. Cek lagi tulisannya.' });
    }
    const o = orders[kode];
    if (o.status === 'pending' && lib.kedaluwarsa(o)) {
      orders[kode].status = 'expired';
      await lib.saveOrders(orders);
      o.status = 'expired';
    }
    const out = { ok: true, status: o.status, nama: o.nama, total: o.total };
    if (o.status === 'approved') {
      // Kode promo HANYA dikirim server kalau pembayaran sudah terverifikasi.
      out.promo_code = lib.PROMO_CODE;
      out.promo_link = lib.PROMO_LINK;
    }
    return lib.jsonRes(out);
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'Server lagi bermasalah. Coba lagi sebentar.' }, 500);
  }
}

export const config = { path: '/api/status' };
