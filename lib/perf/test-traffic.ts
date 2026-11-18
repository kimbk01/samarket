/**
 * K7 — 시험 트래픽 표지 (SSOT).
 * 실기기 시험은 운영 서버·운영 Supabase 를 쓴다(테스트 DB 금지). 감시 집계에서 시험 사용량을 따로 세기 위한 목록.
 * 기기·계정이 바뀌면 이 파일만 고친다. 근거: docs/audit/supabase-request-surge-2026-11-18/root-cause-design.md §3
 */

/** 사무실 시험 기기 — WebView User-Agent 에 들어가는 모델명 */
export const TEST_DEVICE_USER_AGENT_MARKERS: readonly string[] = [
  "SM-M156S", // Samsung Galaxy M15 (Android 16)
  "24076RP19G", // Xiaomi (Android 16)
];

/** 시험 계정 (profiles.id) */
export const TEST_ACCOUNT_USER_IDS: readonly string[] = [
  "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc", // zxzx11
  "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8", // q테스트1
];

export function isTestTrafficUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  for (const marker of TEST_DEVICE_USER_AGENT_MARKERS) {
    if (userAgent.includes(marker)) return true;
  }
  return false;
}
