/**
 * C8 — 앱 진입·복귀 계측 계약 (클라이언트·서버 공용, 순수 함수).
 * 근거: docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C8 (Owner 「Phase 1 승인」 2026-11-08).
 *
 * 금지: 토큰·사용자 ID·이메일·IP·URL 쿼리·User-Agent 수집. 이벤트는 화이트리스트 필드만 통과한다.
 * 저장: DB 0 — 수집 API 가 Vercel 로그 1줄(`[dibay-entry]`)만 남긴다.
 */

export const ENTRY_TELEMETRY_SCHEMA_VERSION = 1;
export const ENTRY_TELEMETRY_ENDPOINT = "/api/telemetry/entry";
export const ENTRY_TELEMETRY_LOG_TAG = "[dibay-entry]";
/** 요청 본문 상한 (바이트). 넘으면 버린다. */
export const ENTRY_TELEMETRY_MAX_BODY_BYTES = 4096;
/** 실행(문서) 1개당 보낼 수 있는 이벤트 수 상한. */
export const ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN = 6;

export const ENTRY_EVENT_KINDS = ["cold", "resume"] as const;
export type EntryEventKind = (typeof ENTRY_EVENT_KINDS)[number];

/**
 * released = 시작 화면 해제 · failure = 시작/복귀 중 실패 · no_release = 해제 신호 없이 관측 한도 경과 · resume = 복귀 ·
 * update_reload = 복귀 시 새 웹 배포로 안전 새로고침 (C3, lib/startup/web-version-resume.client.ts)
 */
export const ENTRY_EVENT_TYPES = ["released", "failure", "no_release", "resume", "update_reload"] as const;
export type EntryEventType = (typeof ENTRY_EVENT_TYPES)[number];

export const ENTRY_PLATFORMS = ["android", "ios", "web"] as const;
export type EntryPlatform = (typeof ENTRY_PLATFORMS)[number];

/**
 * pre_hydration_chunk = React 마운트 전 번들·청크 실패 (루트 초기 가드, lib/startup/pre-hydration-guard-script.ts).
 * 이동 멈춤 3종 (설계 `docs/audit/idle-menu-freeze-design-2026-11-22.md` §S1):
 * - nav_stall = 화면 이동 요청(RSC)이 상한 안에 응답하지 않아 중단 → Next 가 문서 이동으로 넘김
 * - nav_watchdog = 하단 탭 감시가 끝나지 않은 이동을 문서 이동으로 바꿈
 * - chunk_stall = JS·CSS 조각 받기가 상한을 넘김 (관찰만 — 동작 변경 없음)
 * DB `failure` 열은 값 제한이 없어 마이그레이션이 필요 없다 (운영 제약 = ev·kind·platform 만, 2026-11-22 조회).
 */
export const ENTRY_FAILURE_CLASSES = [
  "chunk_reload",
  "error_boundary",
  "global_error",
  "pre_hydration_chunk",
  "nav_stall",
  "nav_watchdog",
  "chunk_stall",
] as const;
export type EntryFailureClass = (typeof ENTRY_FAILURE_CLASSES)[number];

export const ENTRY_STALL_FAILURES = ["nav_stall", "nav_watchdog", "chunk_stall"] as const;
export type EntryStallFailure = (typeof ENTRY_STALL_FAILURES)[number];

/**
 * 멈춤의 끝.
 * - chunk_stall: load·error = 늦게라도 끝남 · pending = 끝나기 전에 문서가 사라짐
 * - nav_watchdog: rsc_aborted = 진행 중인 이동 요청(RSC)을 끊어 Next 가 문서 이동 ·
 *   doc_nav = 진행 중인 이동 요청이 없어 감시가 직접 문서 이동(요청은 끝났는데 화면이 안 바뀜·통화 중 관문 꺼짐)
 */
export const ENTRY_STALL_RESULTS = ["load", "error", "pending", "rsc_aborted", "doc_nav"] as const;
export type EntryStallResult = (typeof ENTRY_STALL_RESULTS)[number];

/**
 * 멈춤 상세 — 멈춤 실패 3종에서만 채운다. DB 는 `stages` jsonb 의 `stall` 키에 함께 보존한다(열 추가 없음).
 * waitedMs = 멈춘 시간 · sinceShownMs = 마지막으로 화면이 다시 보인 뒤 지난 시간(방치 연관, 숨긴 적 없으면 null) ·
 * target = 하단 탭 허브 id 또는 other(주소 미수집) · result = 멈춤의 끝(조각 멈춤·하단 탭 감시).
 */
export type EntryStallDetail = {
  waitedMs: number;
  sinceShownMs: number | null;
  target: string | null;
  result: EntryStallResult | null;
};

export const ENTRY_RECOVERY = ["none", "after_reload"] as const;
export type EntryRecovery = (typeof ENTRY_RECOVERY)[number];

/** 단계 시각 키 — 값은 문서 시작(performance.timeOrigin) 기준 ms. */
export const ENTRY_STAGE_KEYS = [
  "nativeStart",
  "webviewReady",
  "firstHtml",
  "responseStart",
  "domInteractive",
  "reactMounted",
  "firstPaint",
  "shellReady",
  "visualReady",
  "release",
] as const;
export type EntryStageKey = (typeof ENTRY_STAGE_KEYS)[number];
export type EntryStages = Partial<Record<EntryStageKey, number>>;

export type EntryTelemetryEvent = {
  v: number;
  /** 문서 1개당 무작위 실행 ID — 사용자와 연결하지 않는다. */
  run: string;
  seq: number;
  kind: EntryEventKind;
  ev: EntryEventType;
  platform: EntryPlatform;
  appVersion: string | null;
  appBuild: string | null;
  webSha: string | null;
  entryKind: string | null;
  restoreHint: string | null;
  releaseReason: string | null;
  failure: EntryFailureClass | null;
  recovery: EntryRecovery;
  prevFailure: EntryFailureClass | null;
  /** 같은 탭 세션에서 청크 실패로 새로고침한 횟수 (무한 새로고침 감지). */
  reloads: number;
  ageMs: number;
  hiddenMs: number | null;
  visible: boolean;
  t: EntryStages;
  /**
   * D3 (2026-11-19, `docs/audit/mac-bottom-nav-device-class-2026-11-19.md`) — 보낼 때의 기기 판정·메뉴 형태·창 폭.
   * 셸이 아직 없으면 null. DB 저장 열은 없고 Vercel 로그 줄에만 남는다.
   */
  deviceClass: string | null;
  deviceClassSource: string | null;
  nav: EntryNavKind | null;
  usableWidth: number | null;
  /** 멈춤 실패 3종에서만 — 그 밖에는 null */
  stall: EntryStallDetail | null;
};

export const ENTRY_NAV_KINDS = ["rail", "bottom"] as const;
export type EntryNavKind = (typeof ENTRY_NAV_KINDS)[number];

/** 시작 단계 시각(문서 시작 기준) 상한 — 시작 과정은 1시간을 넘지 않는다. 넘는 값은 그 단계만 버린다. */
const MAX_STAGE_MS = 3_600_000;
/**
 * 문서 나이(ageMs)·숨김 시간(hiddenMs) 상한 7일 — 넘으면 버리지 않고 상한값으로 고정한다.
 * (2026-11-08 검토 D1: 1시간 상한에서 이벤트 전체를 버려, 정작 재려던 장시간 사용·복귀 이벤트가 사라졌다.)
 * DB 열이 integer(최대 약 24.8일)라 7일로 둔다.
 */
export const ENTRY_TELEMETRY_MAX_DURATION_MS = 7 * 24 * 3_600_000;
const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function asToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return TOKEN_RE.test(s) ? s : null;
}

function asMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_STAGE_MS) return null;
  return Math.round(value);
}

/** 기간 값 — 음수·숫자 아님은 null, 상한 초과는 상한으로 고정(버리지 않음). */
function asDurationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(Math.min(value, ENTRY_TELEMETRY_MAX_DURATION_MS));
}

function asStall(value: unknown, failure: EntryFailureClass | null): EntryStallDetail | null {
  if (!failure || !(ENTRY_STALL_FAILURES as readonly string[]).includes(failure)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const waitedMs = asDurationMs(r.waitedMs);
  if (waitedMs == null) return null;
  return {
    waitedMs,
    sinceShownMs: asDurationMs(r.sinceShownMs),
    target: asToken(r.target),
    result: asEnum(r.result, ENTRY_STALL_RESULTS),
  };
}

function asCount(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > max) return null;
  return value;
}

/**
 * 받은 값을 계약 필드만 남겨 정규화한다. 필수 필드가 틀리면 null (기록하지 않음).
 * 알 수 없는 필드는 모두 버린다 — 개인정보가 섞여 들어올 경로를 막는다.
 */
export function sanitizeEntryTelemetryEvent(raw: unknown): EntryTelemetryEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== ENTRY_TELEMETRY_SCHEMA_VERSION) return null;
  const run = asToken(r.run);
  const seq = asCount(r.seq, ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN);
  const kind = asEnum(r.kind, ENTRY_EVENT_KINDS);
  const ev = asEnum(r.ev, ENTRY_EVENT_TYPES);
  const platform = asEnum(r.platform, ENTRY_PLATFORMS);
  const ageMs = asDurationMs(r.ageMs);
  if (!run || seq == null || !kind || !ev || !platform || ageMs == null) return null;

  const t: EntryStages = {};
  if (r.t && typeof r.t === "object" && !Array.isArray(r.t)) {
    const rt = r.t as Record<string, unknown>;
    for (const key of ENTRY_STAGE_KEYS) {
      const ms = asMs(rt[key]);
      if (ms != null) t[key] = ms;
    }
  }

  const failure = asEnum(r.failure, ENTRY_FAILURE_CLASSES);
  return {
    v: ENTRY_TELEMETRY_SCHEMA_VERSION,
    run,
    seq,
    kind,
    ev,
    platform,
    appVersion: asToken(r.appVersion),
    appBuild: asToken(r.appBuild),
    webSha: asToken(r.webSha),
    entryKind: asToken(r.entryKind),
    restoreHint: asToken(r.restoreHint),
    releaseReason: asToken(r.releaseReason),
    failure,
    recovery: asEnum(r.recovery, ENTRY_RECOVERY) ?? "none",
    prevFailure: asEnum(r.prevFailure, ENTRY_FAILURE_CLASSES),
    reloads: asCount(r.reloads, 1000) ?? 0,
    ageMs,
    hiddenMs: asDurationMs(r.hiddenMs),
    visible: r.visible === true,
    t,
    deviceClass: asToken(r.deviceClass),
    deviceClassSource: asToken(r.deviceClassSource),
    nav: asEnum(r.nav, ENTRY_NAV_KINDS),
    usableWidth: asCount(r.usableWidth, 20_000),
    stall: asStall(r.stall, failure),
  };
}
