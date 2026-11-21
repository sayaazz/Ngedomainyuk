const lib = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return lib.jsonRes(res, 405, { ok: false, msg: 'Method tidak diizinkan.' });
  try {
    const input = await lib.readInput(req);
    const nama = String(input.nama || '').trim();
    if (nama.length < 2) return lib.jsonRes(res, 200, { ok: false, msg: 'Isi nama dulu ya.' });

    const orders = await lib.loadOrders();
    const terpakai = {};
    for (const kode of Object.keys(orders)) {
      if (kode.startsWith('_')) continue;
      const o = orders[kode];
      if (o.status === 'pending' && !lib.kedaluwarsa(o)) terpakai[o.unik] = true;
    }
    let unik = 0;
    for (let i = 0; i < 60 && unik === 0; i++) {
      const coba = 1 + Math.floor(Math.random() * 499);
      if (!terpakai[coba]) unik = coba;
    }
    if (unik === 0) {
      for (let coba = 1; coba <= 499; coba++) if (!terpakai[coba]) { unik = coba; break; }
    }
    if (unik === 0) return lib.jsonRes(res, 200, { ok: false, msg: 'Lagi ramai banget, coba lagi sebentar ya.' });

    let kode = lib.buatKode();
    while (orders[kode]) kode = lib.buatKode();
    const total = lib.PRICE + unik;
    orders[kode] = {
      nama: nama,
      nominal: lib.PRICE,
      unik: unik,
      total: total,
      status: 'pending',
      waktu: lib.waktuWIB(),
      ts: Date.now(),
    };
    await lib.saveOrders(orders);
    return lib.jsonRes(res, 200, {
      ok: true,
      code: kode,
      total: total,
      unik: unik,
      payload: lib.qrisDinamis(lib.QRIS_PAYLOAD, total),
      merchant: lib.MERCHANT_NAME,
      menit: lib.EXPIRY_MIN,
    });
  } catch (e) {
    return lib.jsonRes(res, 500, { ok: false, msg: 'Server lagi bermasalah. Coba lagi sebentar.' });
  }
};
