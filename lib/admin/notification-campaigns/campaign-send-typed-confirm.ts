/**
 * V3-10: 알림 캠페인 즉시 대량 발송(send · resend) 확인 — 수신 대상 수를 다시 입력해야 한다.
 * (클라이언트 안전 — 서버 전용 모듈 import 금지)
 */
import type {
  CampaignConfirmAction,
  CampaignConfirmFacts,
} from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";

const TYPED_COUNT_ACTIONS: ReadonlySet<CampaignConfirmAction> = new Set<CampaignConfirmAction>([
  "send",
  "resend",
]);

/** 대상 수를 모르면(null) 숫자 대신 고정 문구를 입력하게 한다 — 확인 우회 방지. */
export function campaignSendConfirmMatchText(
  action: CampaignConfirmAction | null,
  facts: CampaignConfirmFacts | null,
  lang: "ko" | "en"
): string | undefined {
  if (!action || !facts || !TYPED_COUNT_ACTIONS.has(action)) return undefined;
  if (typeof facts.targetCount === "number" && Number.isFinite(facts.targetCount)) {
    return String(Math.trunc(facts.targetCount));
  }
  return lang === "en" ? "SEND" : "발송";
}

export function campaignSendConfirmMatchLabel(
  matchText: string | undefined,
  facts: CampaignConfirmFacts | null,
  lang: "ko" | "en"
): string | undefined {
  if (matchText == null) return undefined;
  if (typeof facts?.targetCount === "number") {
    return lang === "en"
      ? `Type the recipient count (${matchText}) to send`
      : `발송하려면 수신 대상 수 「${matchText}」 를 그대로 입력하세요`;
  }
  return lang === "en"
    ? `Recipient count unknown — type "${matchText}" to send`
    : `수신 대상 수를 알 수 없습니다 — 발송하려면 「${matchText}」 를 입력하세요`;
}
