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
export function formatAdminPointBucketLine(b: AdminPointBucketSums, fmt: (n: number) => string): string {
  const parts: string[] = [];
  const add = (label: string, v: number, sign: "+" | "−") => {
    if (v) parts.push(`${label} ${sign}${fmt(Math.abs(v))} P`);
  };
  add("충전", b.charge, "+");
  add("지급", b.grant, "+");
  add("환불·환원", b.refund, "+");
  add("사용", b.use, "−");
  add("회수·차감", b.reclaim, "−");
  // 순변화 양수 = 보류 중(잔액 −), 음수 = 이전 보류가 이 범위에서 해제(잔액 +) — 회원 기간 합계 칸과 같은 규칙 (D-14 ③)
  if (b.hold > 0) parts.push(`보류 중 −${fmt(b.hold)} P`);
  else if (b.hold < 0) parts.push(`보류 해제 +${fmt(Math.abs(b.hold))} P`);
  return parts.length ? parts.join(" · ") : "변동 없음";
}
