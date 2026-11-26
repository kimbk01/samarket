/**
 * 사장님 광고 상세 「이력」 문구 단일 정의 (광고 감사 SA-11 · 2026-11-26).
 *
 * 예전 화면은 감사 기록의 코드(`owner_banner_submit · owner · 2026-11-26 03:12:00` — UTC)를 그대로 보였다.
 * 동작·주체를 키로 바꾸고, 시각은 화면에서 PHT(`formatPhtDisplayDateTime`)로 표시한다.
 * 동작 값 근거: 운영 DB `delivery_ad_audit_logs.action` 20종(2026-11-26 조회) + 제출 라우트 `actionLabel`.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export function ownerAdHistoryActionKey(action: string | null | undefined): MessageKey {
  const a = String(action ?? "").trim().toLowerCase();
  if (a.endsWith("create_draft") || a.endsWith("update_draft")) return "owner_ads_history_act_draft";
  if (a === "submitted" || a === "resubmitted" || a.endsWith("_submit")) return "owner_ads_history_act_submitted";
  if (a === "review_started") return "owner_ads_history_act_review";
  if (a === "approved") return "owner_ads_history_act_approved";
  if (a === "rejected") return "owner_ads_history_act_rejected";
  if (a === "changes_requested") return "owner_ads_history_act_changes";
  if (a.startsWith("paused")) return "owner_ads_history_act_paused";
  if (a.startsWith("resumed")) return "owner_ads_history_act_resumed";
  if (a === "system_activated") return "owner_ads_history_act_started";
  if (a.startsWith("ended") || a === "system_ended") return "owner_ads_history_act_ended";
  if (a === "extended") return "owner_ads_history_act_extended";
  return "owner_ads_history_act_other";
}

export function ownerAdHistoryActorKey(actorType: string | null | undefined): MessageKey | null {
  const v = String(actorType ?? "").trim().toLowerCase();
  if (v === "owner") return "owner_ads_history_by_owner";
  if (v === "admin") return "owner_ads_history_by_staff";
  if (v === "system") return "owner_ads_history_by_system";
  return null;
}
