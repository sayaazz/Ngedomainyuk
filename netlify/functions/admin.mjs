// Panel admin CADANGAN (darurat saja — alur normal full otomatis).
import * as lib from '../../lib/shop.mjs';

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    const action = String(input.action || '');

    if (action === 'login') {
      if (lib.ADMIN_PIN && lib.secretSama(input.pin || '', lib.ADMIN_PIN)) {
        return lib.jsonRes({ ok: true }, 200, {
          'Set-Cookie': 'admin=' + lib.adminToken() + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400',
        });
      }
      return lib.jsonRes({ ok: false, msg: 'PIN salah.' });
    }

    if (!lib.isAdmin(request)) return lib.jsonRes({ ok: false, msg: 'Belum login.' });

    if (action === 'list') {
      const orders = await lib.loadOrders();
      delete orders._log;
      return lib.jsonRes({ ok: true, orders: orders });
    }

    if (action === 'decide') {
      const kode = String(input.code || '').toUpperCase().trim();
      const keputusan = String(input.decision || '');
      if (keputusan !== 'approved' && keputusan !== 'rejected') {
        return lib.jsonRes({ ok: false, msg: 'Keputusan tidak valid.' });
      }
      const orders = await lib.loadOrders();
      if (!orders[kode] || kode.startsWith('_')) {
        return lib.jsonRes({ ok: false, msg: 'Pesanan tidak ditemukan.' });
      }
      orders[kode].status = keputusan;
      orders[kode].diputuskan = lib.waktuWIB();
      orders[kode].via = 'admin-cadangan';
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: true });
    }

    return lib.jsonRes({ ok: false, msg: 'Aksi tidak dikenal.' });
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'server error' }, 500);
  }
}

export const config = { path: '/api/admin' };
