/**
 * 내정보 홈 오른쪽 값 표시 규칙 (최종 설계 H0 「숫자 표시 규칙」).
 * - 개수: `>0` 만 표시, 알려진 0 = 표시 안 함, 모름(실패·미응답) = 비움. **0 을 실패 대체값으로 쓰지 않음.**
 * - 포인트: 금액이라 0·음수 그대로 표시, 모름 = "—".
 * - `hidden` = 목적지에 숫자가 아직 없음 → 값 슬롯 자체 없음.
 */

import type { MypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";
import type { MypageSummaryCountKey } from "@/lib/mypage/mypage-summary-types";

export type MypageHomeCountValue =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "count"; count: number };

export type MypageHomePointsValue =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "amount"; amount: number };

export function resolveMypageHomeCountValue(
  summary: MypageHomeSummaryState | null,
  key: MypageSummaryCountKey,
): MypageHomeCountValue {
  if (!summary) return { kind: "empty" };
  const field = summary.fields?.[key];
  if (!field) return summary.loading ? { kind: "loading" } : { kind: "empty" };
  if (field.status === "hidden") return { kind: "hidden" };
  if (field.status !== "ok") return { kind: "empty" };
  const n = Number(field.value);
  if (!Number.isFinite(n) || n <= 0) return { kind: "empty" };
  return { kind: "count", count: Math.floor(n) };
}

export function resolveMypageHomePointsValue(summary: MypageHomeSummaryState | null): MypageHomePointsValue {
  if (!summary) return { kind: "unknown" };
  const field = summary.fields?.pointsBalance;
  if (!field) return summary.loading ? { kind: "loading" } : { kind: "unknown" };
  if (field.status !== "ok") return { kind: "unknown" };
  const n = Number(field.value);
  if (!Number.isFinite(n)) return { kind: "unknown" };
  return { kind: "amount", amount: Math.trunc(n) };
}

/** `MyRow` props 로 변환 — hidden 이면 값 슬롯 없음(`undefined`) */
export function mypageHomeCountRowProps(
  value: MypageHomeCountValue,
  format: (count: number) => string,
): { value?: string; valueState?: "loading" | "ready" | "empty" } {
  switch (value.kind) {
    case "hidden":
      return {};
    case "loading":
      return { valueState: "loading" };
    case "empty":
      return { valueState: "empty" };
    case "count":
      return { value: format(value.count), valueState: "ready" };
  }
}
