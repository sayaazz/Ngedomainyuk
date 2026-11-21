// Webhook penerima notifikasi pembayaran dari HP penjual.
// Aplikasi penerus notifikasi (MacroDroid) meneruskan notifikasi
// "pembayaran QRIS diterima" dari GoPay/GoBiz ke alamat ini.
// Server mencocokkan NOMINAL UNIK dengan pesanan yang menunggu.
import * as lib from '../../lib/shop.mjs';

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    if (!lib.WEBHOOK_SECRET) return lib.jsonRes({ ok: false, msg: 'webhook belum diatur' }, 503);
    if (!lib.secretSama(input.secret || '', lib.WEBHOOK_SECRET)) {
      return lib.jsonRes({ ok: false, msg: 'secret salah' }, 403);
    }
    let amount = parseInt(input.amount || 0, 10) || 0;
    const text = String(input.text || '');
    if (amount <= 0 && text) amount = lib.ekstrakNominal(text);
    if (amount <= 0) return lib.jsonRes({ ok: false, msg: 'nominal tidak terbaca' }, 400);

    const orders = await lib.loadOrders();
    let cocok = null;
    for (const kode of Object.keys(orders)) {
      if (kode.startsWith('_')) continue;
      const o = orders[kode];
      if (o.status === 'pending' && o.total === amount && !lib.kedaluwarsa(o)) { cocok = kode; break; }
    }
    if (cocok) {
      orders[cocok].status = 'approved';
      orders[cocok].diputuskan = lib.waktuWIB();
      orders[cocok].via = 'notif-hp';
      lib.catatLog(orders, 'COCOK nominal ' + amount + ' -> pesanan ' + cocok + ' disetujui');
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: true, matched: true, order: cocok });
    }
    lib.catatLog(orders, 'TAK ADA PESANAN COCOK nominal ' + amount + '. text=' + text.slice(0, 120));
    await lib.saveOrders(orders);
    return lib.jsonRes({ ok: true, matched: false });
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'server error' }, 500);
  }
}

export const config = { path: '/api/notif-bayar' };
