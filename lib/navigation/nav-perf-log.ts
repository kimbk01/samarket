/**
 * 하단 네비 전환 체감 진단 필드 정의 (`[nav-perf]` 콘솔 — `samarket:debug:navPerf` 등, `lib/debug/samarket-client-console-flags.ts`).
 * blocking API·prefetch 여부는 후속(fetch 후킹·Next 내부)에서 채운다.
 */

export type NavPerfLogPayload = {
  phase: "intent_sync" | "route_settled";
  fromPath: string;
  toPath: string;
  /** Wall clock — 서버 로그와 상관 */
  clickTs: number;
  /** `beginMenuNavigation` 동기 구간 ms — 활성 탭 낙관 업데이트도 같은 클릭 핸들러 안에서 이어짐 */
  optimisticActiveSetMs: number;
  /** 명시적 `router.push` 없음(Next Link)일 때 null */
  routePushStartMs: number | null;
  /** 더블 rAF 근사 첫 페인트(route_settled 에만 채워질 수 있음) */
  firstShellVisibleMs: number | null;
  /** pathname 이 인텐트와 맞아 pending 해소까지 */
  routeSettledMs: number | null;
  blockingApiNames: string[];
  blockingApiTotalMs: number | null;
  apiCountOnNavigation: number | null;
  wasPrefetched: boolean | null;
  isDevCompileLikely: boolean;
  note?: string;
};
