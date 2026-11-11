/**
 * Vitest Node 전역 setup.
 * Browser-only SDK 는 vitest.config alias (agora-rtc-sdk-ng 등).
 * window 는 테스트별 stub — 전역 덮어쓰기 금지 (delivery-home-hub 등 setTimeout 필요).
 */
import { setImmediate as realSetImmediate } from "node:timers";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
/**
 * 어드민 문구 등록 (C3 · Owner 2026-11-11 「CI 시간 개선」):
 * 서버는 `lib/i18n/messages.ts` 의 서버 전용 require 로 어드민 문구(약 1만 7천 키)를 등록하지만 vitest(node) 는 TS require 를
 * 못 한다. 11-10 D 단계에서는 이 전역 준비 파일이 모든 시험 파일(3,091개)마다 어드민 문구 55개 모듈을 다시 불러와
 * 시험 준비 시간이 묶음당 약 750초(누적)였다(표본 350개: 준비 143초 → 4초).
 * 이제 **어드민 문구를 쓰는 코드를 실행하는 시험만** 파일 맨 위에서 `import "@/lib/i18n/admin-catalog";` 로 등록한다 (2026-11-11 기준 177개 — 실패로 드러난 74개 + 키 누락 계측으로 찾은 103개).
 * 새 시험이 어드민 문구를 쓰는데 이 줄이 없으면 → 아래 안전장치가 그 시험 파일을 **실패**시킨다(빈 값으로 조용히 통과하지 않음). 그 시험에 이 줄을 추가한다.
 * 회원 화면 묶음 계약은 `lib/i18n/__tests__/admin-catalog-member-split.test.ts` 가 파일 기준으로 검사한다.
 */

/**
 * C3 안전장치: 번역 모듈은 없는 키를 만나면 `[i18n-missing-ko|en] <key>` 경고를 낸다(`lib/i18n/messages.ts` warnMissingKey).
 * 이 시험 파일에서 `admin_` 키 누락이 한 번이라도 나오면 파일 끝에서 실패시킨다 → 어드민 문구 등록 누락이 숨지 않는다.
 * (시험이 console.warn 을 직접 mock 해 경고를 삼키는 경우는 잡지 못한다.)
 */
/**
 * 기존 결함 — 보고만 (C3 범위 밖, 2026-11-11): 아래 시험은 `vi.resetModules()` 뒤 번역 모듈을 새로 불러와
 * 11-10 전역 등록 때도 어드민 문구가 빈 값이었다(전역 import 상태로 재현 확인 · 시험 76개는 통과). 고치지 않고 안전장치에서만 제외한다.
 */
const KNOWN_ADMIN_TEXT_GAP_AFTER_RESET_MODULES = new Set([
  "app/api/admin/notification-campaigns/__tests__/cms-routes.test.ts",
  "app/api/admin/notification-campaigns/__tests__/create-target-payload-contract.test.ts",
  "app/api/admin/notification-campaigns/__tests__/route-auth.test.ts",
  "app/api/admin/push/test/__tests__/route.test.ts",
  "app/api/me/notifications/__tests__/inapp-wp3-notification-center-api.test.ts",
  "lib/admin/notification-campaigns/__tests__/campaign-send-user-u1-dedupe.test.ts",
  "lib/admin/notification-campaigns/__tests__/campaign-send-user.test.ts",
  "lib/admin/notification-campaigns/__tests__/campaign-stop-and-source-skip.test.ts",
  "lib/admin/notification-campaigns/__tests__/marketing-consent-p0-2026-11-05.test.ts",
  "lib/admin/platform-list/__tests__/platform-admin-list-api-contract.test.ts",
]);
let currentTestFile = "";
beforeAll(() => {
  currentTestFile = String(expect.getState().testPath ?? "").replace(/\\/g, "/");
});
const missingAdminKeys = new Set<string>();
{
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const [tag, key] = args;
    if ((tag === "[i18n-missing-ko]" || tag === "[i18n-missing-en]") && typeof key === "string" && key.startsWith("admin_")) {
      missingAdminKeys.add(key);
    }
    originalWarn(...args);
  };
}
afterAll(() => {
  if (missingAdminKeys.size === 0) return;
  if ([...KNOWN_ADMIN_TEXT_GAP_AFTER_RESET_MODULES].some((f) => currentTestFile.endsWith(f))) return;
  const sample = [...missingAdminKeys].slice(0, 5).join(", ");
  throw new Error(
    `[C3] 어드민 문구 미등록 상태로 admin_ 키 ${missingAdminKeys.size}개를 조회함 (${sample}). 이 시험 파일 맨 위에 import "@/lib/i18n/admin-catalog"; 를 추가하세요.`,
  );
});

/**
 * 시험마다 이벤트 루프를 한 번 놓아준다 — CI `[vitest-worker]: Timeout calling "onTaskUpdate"` 근본 수정.
 * 가짜 DB 처럼 즉시 끝나는 async 시험만 이어지면 파일이 끝날 때까지 매크로태스크가 한 번도 돌지 않아,
 * 작업 프로세스가 메인의 RPC 응답(birpc 60초)을 처리하지 못한다. 파일 전체가 60초를 넘으면(느린 러너에서
 * trade-browse-location-tiers-contract 40초+) 시험이 모두 통과해도 실행 전체가 실패했다
 * (main CI 실패 표본 10건 중 7건 · 2026-11-01 대기 시간을 5초로 줄여 로컬 재현 → 이 처리로 해소).
 * `node:timers` 의 setImmediate 를 쓰므로 vi.useFakeTimers() 가 남아 있어도 막히지 않는다.
 */
afterEach(() => new Promise<void>((resolve) => realSetImmediate(resolve)));

/**
 * Node 25+ 는 전역 `localStorage` getter 를 직접 정의한다(`--localstorage-file` 없으면 undefined).
 * jsdom 환경에서 이 getter 가 jsdom 의 Storage 를 가려 `localStorage.clear()` 가 터진다 (CI Node 22 는 해당 없음).
 * 가려진 경우에만 같은 jsdom 창의 Storage 로 되돌린다.
 */
{
  const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
  if (dom) {
    for (const key of ["localStorage", "sessionStorage"] as const) {
      if ((globalThis as Record<string, unknown>)[key] == null && dom.window[key]) {
        Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
      }
    }
  }
}

/**
 * 관리자 판정 캐시(`lib/admin/admin-membership.ts`, 프로세스 메모리)가 시험 사이에 남지 않게 한다.
 * 모듈을 가져오지 않고 전역 키로 비운다 — 시험이 그 모듈을 vi.mock 해도 충돌하지 않는다.
 */
afterEach(() => {
  const st = (globalThis as Record<string, unknown>).__dibayAdminMembershipJudgmentCache as
    | { cache: Map<string, unknown>; inflight: Map<string, unknown>; generation: number }
    | undefined;
  if (!st) return;
  st.generation += 1;
  st.cache.clear();
  st.inflight.clear();
});
