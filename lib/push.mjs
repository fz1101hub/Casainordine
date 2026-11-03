import webpush from 'web-push';

import { validPushSubscription } from './push-validate.mjs';
export {validPushSubscription};
export function configuredPush(){return !!(process.env.VAPID_PRIVATE_KEY&&process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&/^mailto:/.test(process.env.VAPID_SUBJECT||''));}
export async function sendPush(subscription,payload){
  if(!configuredPush())return {skipped:true};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_secret}},JSON.stringify(payload),{TTL:86400,urgency:'normal'});
}
