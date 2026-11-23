// Panel admin CADANGAN (darurat saja — alur normal full otomatis).
import * as lib from '../../lib/shop.mjs';

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    const action = String(input.action || '');

    if (action === 'login') {
      // Anti brute-force PIN (audit 23 Nov 2026): 8x salah = kunci 10 menit,
      // dicatat di blob pesanan key _sec; PIN benar mereset hitungan.
      const berkas = await lib.loadOrders();
      const sec = berkas._sec && typeof berkas._sec === 'object' ? berkas._sec : { fails: 0, lockUntil: 0 };
      const sekarang = Date.now();
      if (sec.lockUntil && sekarang < sec.lockUntil) {
        return lib.jsonRes({ ok: false, msg: 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.' });
      }
      if (lib.ADMIN_PIN && lib.secretSama(input.pin || '', lib.ADMIN_PIN)) {
        if (sec.fails || sec.lockUntil) {
          sec.fails = 0;
          sec.lockUntil = 0;
          berkas._sec = sec;
          await lib.saveOrders(berkas);
        }
        return lib.jsonRes({ ok: true }, 200, {
          'Set-Cookie': 'admin=' + lib.adminToken() + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400',
        });
      }
      sec.fails = (sec.fails || 0) + 1;
      if (sec.fails >= 8) {
        sec.lockUntil = sekarang + 10 * 60000;
        sec.fails = 0;
      }
      berkas._sec = sec;
      await lib.saveOrders(berkas);
      await new Promise(function (r) { setTimeout(r, 700); });
      return lib.jsonRes({ ok: false, msg: 'PIN salah.' });
    }

    if (!lib.isAdmin(request)) return lib.jsonRes({ ok: false, msg: 'Belum login.' });

    if (action === 'list') {
      const orders = await lib.loadOrders();
      delete orders._log;
      delete orders._sec;
      return lib.jsonRes({ ok: true, orders: orders });
    }

    if (action === 'log') {
      const orders = await lib.loadOrders();
      return lib.jsonRes({ ok: true, log: orders._log || [] });
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
