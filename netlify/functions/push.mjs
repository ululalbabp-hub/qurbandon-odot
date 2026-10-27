// Netlify Function: kirim Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) tanpa dependensi.
// Dipanggil oleh Apps Script. Hanya pemegang kunci privat VAPID yang cocok dengan kunci publik
// aplikasi di bawah ini yang bisa mengirim, jadi fungsi ini tidak bisa disalahgunakan orang lain.
import crypto from 'node:crypto';

const PUBLIC_KEY = 'BI6apTacoWJHmqGPBUaA5igyFXLdfIoKMrLVqk4y47n3ENYYX-QHUbMiV5JnvLaG3qVUxiPob461g6G9K1slSMs';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function privateKeyObject(dB64u) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(unb64u(dB64u));
  const pub = ecdh.getPublicKey();
  const jwk = { kty: 'EC', crv: 'P-256', d: dB64u, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  return { key: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), pub: b64u(pub) };
}

function vapidHeader(endpoint, subject, key) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const data = header + '.' + claims;
  const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + data + '.' + b64u(sig) + ', k=' + PUBLIC_KEY;
}

export function encrypt(payload, sub) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let input;
  try { input = await req.json(); } catch (e) { return Response.json({ ok: false, error: 'JSON tidak valid' }, { status: 400 }); }
  let pk;
  try { pk = privateKeyObject(input.vapidPrivate); } catch (e) { return Response.json({ ok: false, error: 'Kunci tidak valid' }, { status: 403 }); }
  if (pk.pub !== PUBLIC_KEY) return Response.json({ ok: false, error: 'Kunci tidak cocok' }, { status: 403 });
  const subject = String(input.subject || 'mailto:admin@example.com');
  const payload = JSON.stringify(input.payload || {});
  const subs = Array.isArray(input.subs) ? input.subs.slice(0, 200) : [];
  const results = await Promise.all(subs.map(async (sub) => {
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: vapidHeader(sub.endpoint, subject, pk.key)
        },
        body: encrypt(payload, sub)
      });
      return { endpoint: sub.endpoint, status: res.status };
    } catch (e) {
      return { endpoint: sub.endpoint, status: 0, error: String(e) };
    }
  }));
  return Response.json({
    ok: true,
    sent: results.filter((r) => r.status >= 200 && r.status < 300).length,
    gone: results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint),
    results
  });
};

export const config = { path: '/api/push' };
