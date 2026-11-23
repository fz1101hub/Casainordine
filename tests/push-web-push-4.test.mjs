import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { generateVAPIDKeys, generateRequestDetails } from 'web-push';
import { pushTarget, pushOptions, configuredPush } from '../lib/push.mjs';

// Una richiesta push completa (cifratura e firma VAPID) preparata con web-push 4, senza rete.
test('web-push 4: richiesta cifrata e firmata con le nostre opzioni', () => {
  const vapid = generateVAPIDKeys();
  const browser = createECDH('prime256v1'); browser.generateKeys();
  const subscription = { endpoint: 'https://push.example.org/abc', p256dh: browser.getPublicKey('base64url'), auth_secret: randomBytes(16).toString('base64url') };
  const options = pushOptions({ VAPID_SUBJECT: 'mailto:avvisi@example.org', NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
  const request = generateRequestDetails(pushTarget(subscription), JSON.stringify({ title: 'Prova' }), options);
  assert.equal(request.endpoint, subscription.endpoint);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.TTL, 86400);
  assert.equal(request.headers.Urgency, 'normal');
  assert.match(request.headers.Authorization, /^vapid t=.+, k=/);
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(Buffer.isBuffer(request.body) && request.body.length > 20, 'contenuto cifrato');
  assert.equal(request.body.includes(Buffer.from('Prova')), false, 'il testo non viaggia in chiaro');
});

test('senza chiavi VAPID le push non partono', () => {
  const saved = { ...process.env };
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(configuredPush(), false);
  Object.assign(process.env, saved);
});
