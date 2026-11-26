/**
 * 사장님 광고 상세 화면 「신청하기·다시 신청」 갈 곳 (광고 감사 R-73·R-75 · 2026-11-27).
 * - 결제 전(캐시 미확보) 신청·재신청 = 신청 화면(요금·기간 표시·확인 · 서버가 화면 금액·기간 필수)
 * - **이미 결제(FUNDED)한 재신청** = 상세 화면에서 바로 — 서버가 묶인 금액을 그대로 쓴다(새 결제 없음)
 */
export type OwnerDetailSubmitRoute = "direct" | "create_screen";

export function ownerDetailSubmitRoute(
  action: "submit" | "resubmit",
  funded: boolean
): OwnerDetailSubmitRoute {
  return action === "resubmit" && funded ? "direct" : "create_screen";
}
