/**
 * Agora Web SDK `network-quality` 콜백 값(0~6)을 UI 문구로 매핑.
 * @see https://api-ref.agora.io/en/video-sdk/web/4.x/interfaces/networkquality.html
 */
export function formatMessengerAgoraLastMileLine(
  uplinkNetworkQuality: number,
  downlinkNetworkQuality: number
): string {
  const u = Number.isFinite(uplinkNetworkQuality) ? uplinkNetworkQuality : 0;
  const d = Number.isFinite(downlinkNetworkQuality) ? downlinkNetworkQuality : 0;
  const worst = Math.max(u, d);
  if (worst <= 0) return "네트워크 품질 · 확인 중";
  if (worst === 1) return "네트워크 품질 · 매우 좋음";
  if (worst === 2) return "네트워크 품질 · 좋음";
  if (worst === 3) return "네트워크 품질 · 보통";
  if (worst === 4) return "네트워크 품질 · 다소 불안정";
  if (worst === 5) return "네트워크 품질 · 나쁨";
  return "네트워크 품질 · 끊김";
}
