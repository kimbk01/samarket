/**
 * Vitest Node 전역 setup.
 * Browser-only SDK 는 vitest.config alias (agora-rtc-sdk-ng 등).
 * window 는 테스트별 stub — 전역 덮어쓰기 금지 (delivery-home-hub 등 setTimeout 필요).
 */
export {};
