/**
 * 브라우저 번들에 `NEXT_PUBLIC_*` 가 주입됨 — 서버 전용 Agora 인증서와 무관하게
 * 「앱 ID 없음 = 토큰 API 호출 불가」만 판별한다.
 */
export function isCommunityMessengerAgoraAppConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID?.trim());
}
