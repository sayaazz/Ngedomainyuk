// Panel admin CADANGAN (darurat saja — alur normal full otomatis).
const lib = require('./_lib');

module.exports = async function handler(req, res) {
  try {
    const input = await lib.readInput(req);
    const action = String(input.action || '');

    if (action === 'login') {
      if (lib.ADMIN_PIN && lib.secretSama(input.pin || '', lib.ADMIN_PIN)) {
        res.setHeader('Set-Cookie', 'admin=' + lib.adminToken() + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400');
        return lib.jsonRes(res, 200, { ok: true });
      }
      return lib.jsonRes(res, 200, { ok: false, msg: 'PIN salah.' });
    }

    if (!lib.isAdmin(req)) return lib.jsonRes(res, 200, { ok: false, msg: 'Belum login.' });

    if (action === 'list') {
      const orders = await lib.loadOrders();
      delete orders._log;
      return lib.jsonRes(res, 200, { ok: true, orders: orders });
    }

    if (action === 'decide') {
      const kode = String(input.code || '').toUpperCase().trim();
      const keputusan = String(input.decision || '');
      if (keputusan !== 'approved' && keputusan !== 'rejected') {
        return lib.jsonRes(res, 200, { ok: false, msg: 'Keputusan tidak valid.' });
      }
      const orders = await lib.loadOrders();
      if (!orders[kode] || kode.startsWith('_')) {
        return lib.jsonRes(res, 200, { ok: false, msg: 'Pesanan tidak ditemukan.' });
      }
      orders[kode].status = keputusan;
      orders[kode].diputuskan = lib.waktuWIB();
      orders[kode].via = 'admin-cadangan';
      await lib.saveOrders(orders);
      return lib.jsonRes(res, 200, { ok: true });
    }

    return lib.jsonRes(res, 200, { ok: false, msg: 'Aksi tidak dikenal.' });
  } catch (e) {
    return lib.jsonRes(res, 500, { ok: false, msg: 'server error' });
  }
};
