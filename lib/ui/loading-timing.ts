/**
 * 로딩 표시 시간 단일 정의 — `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-0.
 *
 * 새 숫자를 만들지 않고 앱에 이미 있던 값만 쓴다:
 * - 450ms = 메신저 방 진입 복사본 위 스피너 지연(옛 `ENTRY_SPINNER_DELAY_MS`). 이보다 빨리 내용이 오면 스피너가 안 보인다.
 *
 * CSS `--sam-spinner-appear-delay`(app/design-tokens.css)와 같은 값 — `lib/ui/__tests__/loading-timing.test.ts` 가 검사한다.
 */
export const LOADING_SPINNER_APPEAR_DELAY_MS = 450;
