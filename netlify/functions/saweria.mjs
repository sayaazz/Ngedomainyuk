// Webhook penerima notifikasi donasi Saweria.
// Saweria (menu Integration > Webhook) mengirim alert donasi ke alamat ini.
// URL yang ditempel di Saweria wajib membawa ?secret=<WEBHOOK_SECRET>.
// Pencocokan utama: kode pesanan (KD-XXXXXX) yang ditulis pembeli di pesan /
// nama donatur — nominal tidak wajib persis (donasi minimal Rp1.000).
// Cadangan: nominal unik persis tanpa kode.
// Payload mentah selalu dicatat ke log supaya format aslinya bisa diperiksa.
import * as lib from '../../lib/shop.mjs';

function ambilAngka(v) {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function cariField(obj, namaList) {
  const sumber = [obj, obj && obj.data].filter(Boolean);
  for (const s of sumber) {
    for (const n of namaList) {
      if (s[n] !== undefined && s[n] !== null && s[n] !== '') return s[n];
    }
  }
  return undefined;
}

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    if (!lib.WEBHOOK_SECRET) return lib.jsonRes({ ok: false, msg: 'webhook belum diatur' }, 503);
    if (!lib.secretSama(input.secret || '', lib.WEBHOOK_SECRET)) {
      return lib.jsonRes({ ok: false, msg: 'secret salah' }, 403);
    }

    const mentah = JSON.stringify(input).slice(0, 500);
    let amount = ambilAngka(cariField(input, ['amount', 'nominal', 'total', 'gross_amount', 'amount_raw', 'donation_amount', 'price']));
    const pesan = String(cariField(input, ['message', 'pesan', 'donation_message', 'note']) || '');
    const nama = String(cariField(input, ['donator_name', 'donator', 'donatur', 'name', 'username', 'donor_name']) || '');
    if (amount <= 0) amount = lib.ekstrakNominal(pesan + ' ' + nama);
    const teksCari = (pesan + ' ' + nama).toUpperCase();
    const kodeDiPesan = (teksCari.match(/KD-[A-Z0-9]{6}/) || [null])[0];
    const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const teksNorm = norm(pesan + ' ' + nama);

    const orders = await lib.loadOrders();
    let cocok = null;
    let cara = '';
    // Jalur utama: kode pesanan tertulis di pesan/nama donatur, format bebas
    // (huruf besar/kecil, pakai strip atau tidak). Nominal tidak wajib persis,
    // tapi donasi minimal harus seharga dasar Rp1.000.
    if (amount >= 1000) {
      for (const kode of Object.keys(orders)) {
        if (kode.startsWith('_')) continue;
        const o = orders[kode];
        if (o.status === 'pending' && !lib.kedaluwarsa(o) && teksNorm.includes(norm(kode))) { cocok = kode; cara = 'kode'; break; }
      }
    }
    // Cadangan: nominal unik persis tanpa kode.
    if (!cocok && amount > 0) {
      for (const kode of Object.keys(orders)) {
        if (kode.startsWith('_')) continue;
        const o = orders[kode];
        if (o.status === 'pending' && o.total === amount && !lib.kedaluwarsa(o)) { cocok = kode; cara = 'nominal'; break; }
      }
    }
    if (cocok) {
      orders[cocok].status = 'approved';
      orders[cocok].diputuskan = lib.waktuWIB();
      orders[cocok].via = 'saweria';
      lib.catatLog(orders, 'SAWERIA COCOK (' + cara + ') dibayar ' + amount + ' dari total ' + orders[cocok].total + ' -> ' + cocok + ' | mentah=' + mentah);
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: true, matched: true, order: cocok });
    }
    lib.catatLog(orders, 'SAWERIA tak cocok. nominal=' + amount + ' kode=' + (kodeDiPesan || '-') + ' | mentah=' + mentah);
    await lib.saveOrders(orders);
    return lib.jsonRes({ ok: true, matched: false });
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'server error' }, 500);
  }
}

export const config = { path: '/api/saweria' };
