/* Shelly push relay - a Cloudflare Worker.
   It wakes a contact's phone when Shelly is closed. It never sees messages or calls:
   - Web push (browser / installed web app): Shelly encrypts the notification on the sender's phone (RFC 8291);
     this relay only adds its VAPID signature and forwards the sealed bytes to the phone's push service.
   - Android app (FCM): the notification says only "Incoming voice/video call" or "New message" - no names, no text.
   - Shelly Ultra mailboxes: sealed messages for an offline family member wait here (AES-256-GCM, sealed on the
     sender's phone - this relay cannot read them) and expire after at most 3 hours.
   Secrets (Settings -> Variables and Secrets):
     VAPID_PRIVATE        the key from /new-keys (needed for web push)
     FCM_SERVICE_ACCOUNT  Firebase service-account JSON (needed for the Android app)
   Binding (Settings -> Bindings -> KV namespace):  BOX  (needed for Shelly Ultra offline delivery)
   - TURN for calls on hard networks: GET /ice returns relay (TURN) servers. Set up EITHER:
       Cloudflare Realtime TURN (free): secrets TURN_KEY_ID + TURN_API_TOKEN (Realtime -> TURN in the dashboard), or
       any TURN server: secrets TURN_URLS (comma list), TURN_USERNAME, TURN_CREDENTIAL.
   Routes: GET /vapid, GET /new-keys, GET /ice, GET /where, POST /web, POST /fcm, POST /box, GET /box, POST /box/del    */

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/,
                    /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/];
const LIMIT_PER_MIN = 60;
const hits = new Map();
let fcmToken = null, fcmTokenExp = 0;

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const te = new TextEncoder();

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, {status: res.status, headers: h});
}
const text = (s, status = 200) => cors(new Response(s, {status, headers: {'Content-Type': 'text/plain; charset=utf-8'}}));
const json = (o, status = 200) => cors(new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json'}}));

function limited(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now(), win = Math.floor(now / 60000);
  const k = ip + ':' + win, n = (hits.get(k) || 0) + 1; hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + win)) hits.delete(key);
  return n > LIMIT_PER_MIN;
}

async function vapidKeys(env) {
  if (!env.VAPID_PRIVATE) throw new Error('VAPID_PRIVATE secret is not set - open /new-keys');
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const priv = await crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const pub = new Uint8Array([4, ...unb64u(jwk.x), ...unb64u(jwk.y)]);
  return {priv, pub: b64u(pub)};
}
async function jwtES256(priv, claims) {
  const head = b64u(te.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u(te.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, priv, te.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
function pemToDer(pem) { return unb64u(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_')); }

async function fcmAccess(sa) {
  if (fcmToken && Date.now() < fcmTokenExp - 60000) return fcmToken;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(te.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'})));
  const body = b64u(te.encode(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600})));
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(head + '.' + body)));
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + body + '.' + sig});
  const j = await r.json();
  if (!j.access_token) throw new Error('Firebase login failed: ' + (j.error_description || j.error || r.status));
  fcmToken = j.access_token; fcmTokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return fcmToken;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(new Response(null, {status: 204}));
    try {
      if (req.method === 'GET' && url.pathname === '/') return text('Shelly relay is running.');
      if (req.method === 'GET' && url.pathname === '/box'){                 // Ultra: collect my waiting (sealed) messages
        if (!env.BOX) return text('BOX storage is not set up', 501);
        const a = url.searchParams.get('a') || ''; if (!/^[0-9a-f]{64}$/.test(a)) return text('Bad address', 400);
        const list = await env.BOX.list({prefix: a + ':', limit: 100}), items = [];
        for (const k of list.keys){ const v = await env.BOX.get(k.name); if (v) items.push({k: k.name.slice(65), v}); }
        return json({items});
      }
      if (req.method === 'GET' && url.pathname === '/vapid') return text((await vapidKeys(env)).pub);
      if (req.method === 'GET' && url.pathname === '/ice') {           // TURN servers for calls behind strict mobile networks
        const servers = [];
        if (env.TURN_KEY_ID && env.TURN_API_TOKEN) {                   // Cloudflare Realtime TURN - short-lived credentials
          try {
            const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
              {method: 'POST', headers: {'Authorization': 'Bearer ' + env.TURN_API_TOKEN, 'Content-Type': 'application/json'}, body: JSON.stringify({ttl: 86400})});
            const j = await r.json(); if (j && j.iceServers) servers.push(j.iceServers);
          } catch (e) {}
        }
        if (env.TURN_URLS) servers.push({urls: env.TURN_URLS.split(',').map(s => s.trim()).filter(Boolean),
          username: env.TURN_USERNAME || '', credential: env.TURN_CREDENTIAL || ''});
        return json({iceServers: servers});
      }
      if (req.method === 'GET' && url.pathname === '/where') {         // free, approximate location from the device's own IP (Cloudflare edge geo) - no third party
        const c = req.cf || {};
        const lat = parseFloat(c.latitude), lon = parseFloat(c.longitude);
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return json({ok: false});
        return json({ok: true, lat: +lat.toFixed(3), lon: +lon.toFixed(3),   // rounded to ~100 m: this is city-level, never precise
          city: (c.city || '') + '', region: (c.region || '') + '', country: (c.country || '') + ''});
      }
      if (req.method === 'GET' && url.pathname === '/new-keys') {
        if (env.VAPID_PRIVATE) return text('Keys are already set. Nothing to do.');
        const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
        const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
        return text('Copy the line below (all of it) into a new secret named VAPID_PRIVATE, then deploy:\n\n' +
          JSON.stringify({kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d}) + '\n');
      }
      if (req.method !== 'POST') return text('Not found', 404);
      if (limited(req)) return text('Too many requests', 429);
      const raw = await req.text();
      if (raw.length > (url.pathname === '/box' ? 70000 : 8192)) return text('Too large', 413);
      const b = JSON.parse(raw);

      if (url.pathname === '/box') {                                       // Ultra: leave a sealed message for an offline family member
        if (!env.BOX) return text('BOX storage is not set up', 501);
        const a = String(b.a || ''), k = String(b.k || ''), v = String(b.v || '');
        if (!/^[0-9a-f]{64}$/.test(a) || !/^[\w-]{8,40}$/.test(k) || v.length > 65536) return text('Bad item', 400);
        await env.BOX.put(a + ':' + k, v, {expirationTtl: Math.max(60, Math.min(10800, b.ttl | 0 || 10800))});
        return json({ok: true});
      }
      if (url.pathname === '/box/del') {
        if (!env.BOX) return text('BOX storage is not set up', 501);
        const a = String(b.a || ''); if (!/^[0-9a-f]{64}$/.test(a)) return text('Bad address', 400);
        for (const k of (Array.isArray(b.keys) ? b.keys : []).slice(0, 100)) if (/^[\w-]{8,40}$/.test(String(k))) await env.BOX.delete(a + ':' + k);
        return json({ok: true});
      }

      if (url.pathname === '/web') {
        const ep = new URL(String(b.endpoint));
        if (ep.protocol !== 'https:' || !PUSH_HOSTS.some(re => re.test(ep.hostname))) return text('Not a push service', 400);
        const body = unb64u(String(b.body || ''));
        if (body.length < 86 || body.length > 4096) return text('Bad body', 400);
        const {priv, pub} = await vapidKeys(env);
        const jwt = await jwtES256(priv, {aud: ep.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
          sub: env.VAPID_SUBJECT || 'https://bajanbob.github.io/Shelly/'});
        const r = await fetch(ep.href, {method: 'POST', body, headers: {
          'Authorization': `vapid t=${jwt}, k=${pub}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          'TTL': String(Math.max(0, Math.min(86400, b.ttl | 0 || 60))), 'Urgency': b.urgency === 'high' ? 'high' : 'normal'}});
        return json({ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410});
      }

      if (url.pathname === '/fcm') {
        if (!env.FCM_SERVICE_ACCOUNT) return text('FCM_SERVICE_ACCOUNT secret is not set', 501);
        const token = String(b.token || '');
        if (!/^[\w:\-.]{20,400}$/.test(token)) return text('Bad token', 400);
        const kind = ['voice', 'video', 'msg', 'sos'].includes(b.kind) ? b.kind : 'msg';
        const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
        const access = await fcmAccess(sa);
        const call = kind === 'voice' || kind === 'video', sos = kind === 'sos';
        const msg = {message: {token, data: {k: kind}, android: {priority: 'HIGH', ttl: call ? '60s' : sos ? '3600s' : '10800s', notification: {
          channel_id: call ? 'calls_' + kind : sos ? 'sos' : 'messages', title: sos ? 'Shelly SOS' : 'Shelly',
          body: kind === 'voice' ? 'Incoming voice call - tap to answer' : kind === 'video' ? 'Incoming video call - tap to answer' : sos ? 'A family member needs help - open Shelly now' : 'New message',
          sound: call ? 'shelly_' + kind : sos ? 'shelly_sos' : 'shelly_msg', tag: call ? 'shelly-call' : sos ? 'shelly-sos' : 'shelly-msg', icon: 'ic_stat_shelly', color: sos ? '#c4161c' : '#0a8c8a',
          notification_priority: call || sos ? 'PRIORITY_MAX' : 'PRIORITY_HIGH', visibility: 'PRIVATE'}}}};
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {method: 'POST',
          headers: {'Authorization': 'Bearer ' + access, 'Content-Type': 'application/json'}, body: JSON.stringify(msg)});
        return json({ok: r.ok, status: r.status});
      }
      return text('Not found', 404);
    } catch (e) {
      return text('Error: ' + (e && e.message || e), 500);
    }
  }
};
