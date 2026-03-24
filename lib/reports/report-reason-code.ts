/** 자유 입력·키워드 → reports.reason_code */
export function inferReportReasonCode(reason: string): string {
  const t = reason.toLowerCase();
  if (/사기|스캠|scam|fraud/.test(t)) return "fraud";
  if (/스팸|spam|도배/.test(t)) return "spam";
  if (/욕|비방|괴롭|harass|abusive/.test(t)) return "harassment";
  if (/허위|가짜|fake/.test(t)) return "fake_listing";
  if (/부적절|음란|inappropriate/.test(t)) return "inappropriate";
  if (/개인정보|privacy/.test(t)) return "privacy";
  if (/광고|홍보|스팸업체/.test(t)) return "promo";
  return "other";
}
