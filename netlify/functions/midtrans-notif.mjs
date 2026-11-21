// Penerima notifikasi pembayaran (webhook) resmi dari Midtrans.
// Verifikasi: signature_key = SHA512(order_id + status_code + gross_amount + KUNCI).
// Sejak 28 Okt 2026 Midtrans memakai Signature Secret Key terpisah; sebelum itu
// Server Key. Handler ini menerima keduanya (yang terisi di env yang dicoba).
//   MIDTRANS_SIGNATURE_KEY (diprioritaskan), MIDTRANS_SERVER_KEY (cadangan)
// Sukses = status_code 200 + transaction_status settlement/capture + fraud accept.
// Idempoten: notifikasi ganda untuk pesanan yang sama aman.
import crypto from 'node:crypto';
import * as lib from '../../lib/shop.mjs';

const KUNCI = [process.env.MIDTRANS_SIGNATURE_KEY || '', process.env.MIDTRANS_SERVER_KEY || '']
  .filter(Boolean);

function signatureCocok(input) {
  const mentah = String(input.order_id || '') + String(input.status_code || '') + String(input.gross_amount || '');
  for (const k of KUNCI) {
    const harap = crypto.createHash('sha512').update(mentah + k).digest('hex');
    if (lib.secretSama(harap, String(input.signature_key || ''))) return true;
  }
  return false;
}

export default async function handler(request) {
  try {
    if (!KUNCI.length) return lib.jsonRes({ ok: false, msg: 'Midtrans belum diatur di server.' }, 503);
    const input = await lib.readInput(request);
    const orders = await lib.loadOrders();
    const orderId = String(input.order_id || '');

    if (!signatureCocok(input)) {
      lib.catatLog(orders, 'MIDTRANS notif DITOLAK (signature tak cocok) order=' + orderId);
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: false, msg: 'signature salah' }, 403);
    }

    const o = orders[orderId];
    if (!o) {
      lib.catatLog(orders, 'MIDTRANS notif utk pesanan tak dikenal: ' + orderId);
      await lib.saveOrders(orders);
      return lib.jsonRes({ ok: true });
    }

    const jumlah = parseFloat(String(input.gross_amount || '0'));
    const sukses = String(input.status_code) === '200'
      && (input.transaction_status === 'settlement'
        || (input.transaction_status === 'capture' && (input.fraud_status === 'accept' || !input.fraud_status)));

    if (sukses && jumlah === o.total) {
      if (o.status === 'pending') {
        o.status = 'approved';
        o.diputuskan = lib.waktuWIB();
        o.via = 'midtrans';
        lib.catatLog(orders, 'MIDTRANS COCOK ' + orderId + ' lunas ' + jumlah + ' via ' + (input.payment_type || '?')
          + (lib.kedaluwarsa(o) ? ' (lewat batas 30 mnt, tetap disetujui krn uang masuk)' : ''));
      } else {
        lib.catatLog(orders, 'MIDTRANS notif ganda (sudah diproses) ' + orderId);
      }
    } else if (sukses && jumlah !== o.total) {
      lib.catatLog(orders, 'MIDTRANS nominal TAK cocok ' + orderId + ': masuk ' + jumlah + ' vs total ' + o.total);
    } else {
      lib.catatLog(orders, 'MIDTRANS notif ' + orderId + ' status=' + input.transaction_status + '/' + input.status_code);
    }
    await lib.saveOrders(orders);
    return lib.jsonRes({ ok: true });
  } catch (e) {
    return lib.jsonRes({ ok: false, msg: 'server error' }, 500);
  }
}

export const config = { path: '/api/midtrans-notif' };
