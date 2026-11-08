import { translate, type MessageKey } from "@/lib/i18n/messages";

/**
 * 관리자 포인트 원장 목록 조건 합계 — 화면 표시 (순수 · 클라이언트 공용). 계산은 `admin-point-ledger-bucket-sums.ts`(서버).
 */
export type AdminPointBucketSums = {
  charge: number;
  grant: number;
  refund: number;
  use: number;
  reclaim: number;
  /** 보류 중 = 보류 − 해제 (확정분 제외) */
  hold: number;
  /** 합한 원장 줄 수 */
  rows: number;
};

/** 화면 한 줄 — 0 인 칸은 빼고, 부호 = 잔액 증감 */
export function formatAdminPointBucketLine(
  b: AdminPointBucketSums,
  fmt: (n: number) => string,
  ko: boolean = true
): string {
  const lang = ko ? "ko" : "en";
  const parts: string[] = [];
  const add = (label: MessageKey, v: number, sign: "+" | "−") => {
    if (v) parts.push(`${translate(lang, label)} ${sign}${fmt(Math.abs(v))} P`);
  };
  add("admin_points_bucket_charge", b.charge, "+");
  add("admin_points_bucket_grant", b.grant, "+");
  add("admin_points_bucket_refund", b.refund, "+");
  add("admin_points_bucket_use", b.use, "−");
  add("admin_points_bucket_reclaim", b.reclaim, "−");
  // 순변화 양수 = 보류 중(잔액 −), 음수 = 이전 보류가 이 범위에서 해제(잔액 +) — 회원 기간 합계 칸과 같은 규칙 (D-14 ③)
  if (b.hold > 0) parts.push(translate(lang, "admin_points_bucket_hold", { amount: fmt(b.hold) }));
  else if (b.hold < 0) parts.push(translate(lang, "admin_points_bucket_hold_released", { amount: fmt(Math.abs(b.hold)) }));
  return parts.length ? parts.join(" · ") : translate(lang, "admin_points_bucket_no_change");
}
