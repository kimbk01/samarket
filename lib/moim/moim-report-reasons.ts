/** 모임 신고 사유 코드 (설계 §6 P13 · 참고 앱 FAQ 3730/27663/20399 기반). 화면 문구 키 = moim_report_reason_<code> */
export const MOIM_REPORT_REASON_CODES = [
  "commercial",
  "religion",
  "politics",
  "dating",
  "mlm_investment",
  "personal_info",
  "external_messenger",
  "abuse_hate",
  "sexual",
  "fraud",
  "noshow_fee",
  "other",
] as const;
export type MoimReportReasonCode = (typeof MOIM_REPORT_REASON_CODES)[number];
export function isMoimReportReasonCode(v: unknown): v is MoimReportReasonCode {
  return typeof v === "string" && (MOIM_REPORT_REASON_CODES as readonly string[]).includes(v);
}
