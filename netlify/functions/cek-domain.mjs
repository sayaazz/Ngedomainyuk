// Cek ketersediaan domain .my.id lewat RDAP resmi PANDI (registri .id).
// RDAP: domain terdaftar -> HTTP 200, belum terdaftar -> HTTP 404.
import * as lib from '../../lib/shop.mjs';

const RDAP_BASE = 'https://rdap.pandi.id/rdap/domain/';

export default async function handler(request) {
  try {
    const input = await lib.readInput(request);
    let nama = String(input.domain || '').trim().toLowerCase().replace(/\.$/, '');
    if (!nama) return lib.jsonRes({ ok: false, msg: 'Isi nama domainnya dulu.' }, 400);
    if (!nama.endsWith('.my.id')) {
      if (nama.includes('.')) {
        return lib.jsonRes({ ok: false, msg: 'Form ini khusus domain .my.id ya.' }, 400);
      }
      nama += '.my.id';
    }
    const label = nama.slice(0, -'.my.id'.length);
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return lib.jsonRes({ ok: false, msg: 'Nama domain tidak valid. Pakai huruf/angka/strip saja, tanpa spasi.' }, 400);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let status = 0;
    try {
      const r = await fetch(RDAP_BASE + encodeURIComponent(nama), {
        headers: { 'Accept': 'application/rdap+json', 'User-Agent': 'ngedomainyuk-cek-domain' },
        signal: ctrl.signal,
      });
      status = r.status;
    } finally {
      clearTimeout(timer);
    }
    if (status === 200) return lib.jsonRes({ ok: true, domain: nama, tersedia: false });
    if (status === 404) return lib.jsonRes({ ok: true, domain: nama, tersedia: true });
    return lib.jsonRes({ ok: false, msg: 'Cek domain lagi gangguan (status ' + status + '). Coba lagi sebentar.' }, 502);
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'Cek domain lagi gangguan. Coba lagi sebentar.' }, 502);
  }
}

export const config = { path: '/api/cek-domain' };
