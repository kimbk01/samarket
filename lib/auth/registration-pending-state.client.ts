/**
 * 현재 회원의 빠진 가입 단계(전화·주소) — 화면 요청 단계 안내(`registration-guidance-fetch-gate`)가 보내기 전에 쓰는 사본.
 * 값은 서버 판정(`getOnboardingStatus.registrationNextStep`)이 담긴 응답에서만 채운다(클라이언트가 다시 계산하지 않는다):
 * `/api/me/mandatory-address-gate` · `/api/me/signup-status` · 서버 403 `signup_incomplete`+step.
 * 모르면 null → 서버가 판단(보내기 전에 막지 않는다). 오래된 값(10분)도 「모름」으로 본다.
 * 설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §5-3.
 */
export type RegistrationPendingStep = "phone" | "address";

/**
 * 사본을 믿는 시간 — 빠진 단계는 15초(요청 캐시 `mandatory-address-gate` 와 같음), 완료는 10분.
 * 다른 기기·관리자 처리로 서버가 먼저 완료가 되면 오래된 「빠진 단계」로 화면마다 단계 화면을 들르던 결함(재감사2 #2).
 */
const STEP_STALE_MS = 15_000;
const COMPLETE_STALE_MS = 10 * 60_000;

let state: { step: RegistrationPendingStep | null; at: number } | null = null;

/**
 * 마지막으로 서버가 알려 준 빠진 단계 — 「모름」(무효화)에도 지우지 않는다. 「빠진 단계 → 완료」 전환을 잡아
 * 토큰을 1회 갱신하는 데 쓴다(재감사2 #1: 화면 컴포넌트 ref 는 단계 화면에서 사라져 전환을 놓쳤다).
 */
let lastMissingStep: RegistrationPendingStep | null = null;
let justCompleted = false;

function isStale(s: { step: RegistrationPendingStep | null; at: number }, nowMs: number): boolean {
  return nowMs - s.at > (s.step === null ? COMPLETE_STALE_MS : STEP_STALE_MS);
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* 구독자 오류는 다른 구독자에 번지지 않게 */
    }
  }
}

/** 값이 바뀔 때 알림 — 가입 관문(`DibaySignupGate`)이 서버 값 도착 즉시 다시 판정한다 */
export function subscribeRegistrationPending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 서버가 준 값으로 갱신 — `"phone"`·`"address"` = 빠진 단계 · `null` = 가입 완료(관리자 포함).
 * `"terms"`(동의 미완)·그 밖 값은 **「모름」**으로 둔다 — 동의 뒤 전화·주소가 남았는지 이 값으로는 알 수 없다
 * (재감사 2026-11-24 R4: 「terms」를 「완료」로 적어 동의 직후 가입 관문이 꺼지던 결함).
 */
export function setRegistrationPendingFromServer(step: unknown): void {
  if (step !== null && step !== "phone" && step !== "address") {
    invalidateRegistrationPending();
    return;
  }
  const s = step;
  if (s !== null) {
    lastMissingStep = s;
  } else if (lastMissingStep !== null) {
    lastMissingStep = null;
    justCompleted = true;
  }
  const changed = state?.step !== s;
  state = { step: s, at: Date.now() };
  if (changed || justCompleted) emit();
}

/** 「빠진 단계 → 완료」가 방금 일어났는가 — 한 번 읽으면 지워진다(토큰 1회 갱신용) */
export function consumeRegistrationJustCompleted(): boolean {
  const v = justCompleted;
  justCompleted = false;
  return v;
}

/** 로그아웃·계정 전환 — 이전 계정의 빠진 단계 기억을 지운다 */
export function forgetRegistrationHistory(): void {
  lastMissingStep = null;
  justCompleted = false;
}

/** 주소·전화가 바뀌었을 수 있음(주소 저장·전화 인증·로그아웃) — 다음 서버 응답까지 「모름」 */
export function invalidateRegistrationPending(): void {
  const had = state !== null;
  state = null;
  if (had) emit();
}

/** 확실히 아는 빠진 단계 — 모르거나 오래됐으면 null */
export function peekKnownRegistrationPendingStep(nowMs = Date.now()): RegistrationPendingStep | null {
  if (!state) return null;
  if (isStale(state, nowMs)) return null;
  return state.step;
}

/** 세 가지 상태 — 서버가 알려 준 빠진 단계 / 가입 완료(관리자 포함) / 모름(값 없음·오래됨) */
export function peekRegistrationPendingKnowledge(nowMs = Date.now()): RegistrationPendingStep | "complete" | "unknown" {
  if (!state || isStale(state, nowMs)) return "unknown";
  return state.step ?? "complete";
}

export function resetRegistrationPendingForTests(): void {
  state = null;
  listeners.clear();
  lastMissingStep = null;
  justCompleted = false;
}
