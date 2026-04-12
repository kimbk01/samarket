import webpush from "web-push";

let configured = false;

/**
 * VAPID 키는 `scripts/generate-vapid-keys.cjs` 로 생성.
 * 공개키는 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(클라이언트 구독)와 동일해야 함.
 */
export function isWebPushSendConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv);
}

export function getVapidPublicKeyForServer(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function ensureWebPushVapidConfigured(): boolean {
  if (configured) return isWebPushSendConfigured();
  const pub = getVapidPublicKeyForServer();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@samarket.app";
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}
