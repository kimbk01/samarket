/**
 * Agora Web SDK `network-quality` 콜백 값(0~6)을 UI 문구로 매핑.
 * @see https://api-ref.agora.io/en/video-sdk/web/4.x/interfaces/networkquality.html
 */
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const NETWORK_QUALITY_KEY_BY_WORST: Record<number, MessageKey> = {
  0: "cm_ui_network_quality_checking",
  1: "cm_ui_network_quality_excellent",
  2: "cm_ui_network_quality_good",
  3: "cm_ui_network_quality_fair",
  4: "cm_ui_network_quality_unstable",
  5: "cm_ui_network_quality_bad",
};

export function messengerNetworkQualityWorst(
  uplinkNetworkQuality: number,
  downlinkNetworkQuality: number
): number {
  const u = Number.isFinite(uplinkNetworkQuality) ? uplinkNetworkQuality : 0;
  const d = Number.isFinite(downlinkNetworkQuality) ? downlinkNetworkQuality : 0;
  return Math.max(u, d);
}

export function formatMessengerAgoraLastMileLine(
  uplinkNetworkQuality: number,
  downlinkNetworkQuality: number
): string {
  const worst = messengerNetworkQualityWorst(uplinkNetworkQuality, downlinkNetworkQuality);
  const key =
    NETWORK_QUALITY_KEY_BY_WORST[worst] ?? "cm_ui_network_quality_disconnected";
  return translate(getRuntimeAppLanguage(), key);
}
