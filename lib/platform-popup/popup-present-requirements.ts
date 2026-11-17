/**
 * v3 ④ (앱 진입 어드민 · Owner 2026-11-17 「v3대로 진행」) — 팝업 「표시 단계」 데이터 조건(서버 전용).
 * 앱 조회(`app/api/platform-popup/resolve/route.ts`)와 어드민 「앱에 나오나」(`admin-applied-status.ts`)가 같은 함수를 쓴다.
 * - 혜택 다이얼로그: 이동 대상 이벤트의 혜택 내용이 있어야 한다.
 * - 하단 목록: 노출 자격 있는 매장이 1곳 이상 (`loadPlatformPopupListStores` — 같은 함수).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractPlatformEventBenefitContent,
  type PlatformPopupEventBenefitContent,
} from "@/lib/platform-popup/event-benefit-authority";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";

/** 혜택 다이얼로그가 읽는 이벤트 id — `event_detail` 이동만 (그 밖 = 혜택 없음) */
export function popupBenefitEventId(candidate: Pick<PlatformPopupCandidate, "ctaType" | "ctaTarget">): string {
  return candidate.ctaType === "event_detail" ? String(candidate.ctaTarget ?? "").trim() : "";
}

/** 이벤트 혜택 내용 — 없으면 null (그 팝업은 대기열에서 빠진다) */
export async function loadPopupCandidateEventBenefit(
  sb: SupabaseClient,
  candidate: Pick<PlatformPopupCandidate, "ctaType" | "ctaTarget">
): Promise<PlatformPopupEventBenefitContent | null> {
  const eventId = popupBenefitEventId(candidate);
  if (!eventId) return null;
  const { data: eventRow } = await sb.from("platform_events").select("sections").eq("id", eventId).maybeSingle();
  return extractPlatformEventBenefitContent(eventRow?.sections ?? null);
}
