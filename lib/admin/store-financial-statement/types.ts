/**
 * 매장 재무 기간 키 (오늘·최근 7일·최근 30일·직접).
 * 재감사 P-8 (2026-11-04): 예전 「매장 재무제표」 모델 타입은 화면·API 삭제와 함께 정리했다.
 */
export type StoreFinancialPeriodKey = "today" | "7d" | "30d" | "custom";
