// Webhook penerima notifikasi pembayaran dari HP penjual.
// Aplikasi penerus notifikasi (MacroDroid) meneruskan notifikasi
// "pembayaran QRIS diterima" dari GoPay/GoBiz ke alamat ini.
// Server mencocokkan NOMINAL UNIK dengan pesanan yang menunggu.
const lib = require('./_lib');

module.exports = async function handler(req, res) {
  try {
    const input = await lib.readInput(req);
    if (!lib.WEBHOOK_SECRET) return lib.jsonRes(res, 503, { ok: false, msg: 'webhook belum diatur' });
    if (!lib.secretSama(input.secret || '', lib.WEBHOOK_SECRET)) {
      return lib.jsonRes(res, 403, { ok: false, msg: 'secret salah' });
    }
    let amount = parseInt(input.amount || 0, 10) || 0;
    const text = String(input.text || '');
    if (amount <= 0 && text) amount = lib.ekstrakNominal(text);
    if (amount <= 0) return lib.jsonRes(res, 400, { ok: false, msg: 'nominal tidak terbaca' });

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
      return lib.jsonRes(res, 200, { ok: true, matched: true, order: cocok });
    }
    lib.catatLog(orders, 'TAK ADA PESANAN COCOK nominal ' + amount + '. text=' + text.slice(0, 120));
    await lib.saveOrders(orders);
    return lib.jsonRes(res, 200, { ok: true, matched: false });
  } catch (e) {
    return lib.jsonRes(res, 500, { ok: false, msg: 'server error' });
  }
};
