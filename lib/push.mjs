// web-push 4 è solo ESM e non ha più l'esportazione predefinita: si usano le funzioni con nome.
// Le chiavi VAPID passano a ogni invio (niente stato globale della libreria).
import { sendNotification } from 'web-push';

import { validPushSubscription } from './push-validate.mjs';
export {validPushSubscription};
export function configuredPush(){return !!(process.env.VAPID_PRIVATE_KEY&&process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&/^mailto:/.test(process.env.VAPID_SUBJECT||''));}
export function pushTarget(subscription){return {endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_secret}};}
export function pushOptions(env=process.env){
  return {TTL:86400,urgency:'normal',vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}};
}
export async function sendPush(subscription,payload){
  if(!configuredPush())return {skipped:true};
  return sendNotification(pushTarget(subscription),JSON.stringify(payload),pushOptions());
}
