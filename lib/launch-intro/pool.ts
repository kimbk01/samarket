/**
 * 진입 감사 5단계 IN-3·IN-1·OS-3 (2026-11-17 · Owner 「설계안대로 진행」) — 인트로 소재 묶음. 순수 모듈(서버·클라이언트).
 *
 * - 소재 = 그림 1장(투명 PNG 가능) + 배경색 + 표시 시간(1~5초) + 목적지(선택) + 「광고」 표기 + 기간·순서.
 * - 앱(새 바이너리)은 웹이 발견 때 받은 목록을 네이티브 저장소에 맞추고, 다음 「새로 켬」에 네이티브 화면으로 바로 그린다
 *   (웹이 뜨기 전 — 로딩 시간을 채움). 진입마다 다음 소재.
 * - 전체 설정: admin_settings `launch_intro_pool_policy_v1` = { enabled, showOnOsRestore }.
 *   showOnOsRestore = OS 가 앱을 종료한 뒤 아이콘으로 다시 켤 때도 보이기(OS-3).
 */
import { parseDestinationHref } from "@/lib/destination/destination-contract";

export const LAUNCH_INTRO_POOL_POLICY_KEY = "launch_intro_pool_policy_v1";
export const LAUNCH_INTRO_POOL_MAX_ACTIVE = 20;
export const LAUNCH_INTRO_POOL_DURATION_MIN_MS = 1000;
export const LAUNCH_INTRO_POOL_DURATION_MAX_MS = 5000;
export const LAUNCH_INTRO_POOL_DURATION_DEFAULT_MS = 2000;
export const LAUNCH_INTRO_POOL_MIN_LONG_EDGE = 1080;
export const LAUNCH_INTRO_POOL_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LaunchIntroPoolImageMime = (typeof LAUNCH_INTRO_POOL_IMAGE_MIMES)[number];
export const LAUNCH_INTRO_POOL_STATUSES = ["active", "paused", "ended"] as const;
export type LaunchIntroPoolStatus = (typeof LAUNCH_INTRO_POOL_STATUSES)[number];
export const LAUNCH_INTRO_EVENT_TYPES = ["impression", "skip", "click", "complete"] as const;
export type LaunchIntroEventType = (typeof LAUNCH_INTRO_EVENT_TYPES)[number];

/** 빌드 전 감사 I3: 기록 API 의 `platform` — android·ios·web 만, 그 외 null */
export const LAUNCH_INTRO_EVENT_PLATFORMS = ["android", "ios", "web"] as const;
export function normalizeLaunchIntroEventPlatform(v: unknown): (typeof LAUNCH_INTRO_EVENT_PLATFORMS)[number] | null {
  return typeof v === "string" && (LAUNCH_INTRO_EVENT_PLATFORMS as readonly string[]).includes(v.trim())
    ? (v.trim() as (typeof LAUNCH_INTRO_EVENT_PLATFORMS)[number])
    : null;
}

/** 빌드 전 감사 I3: 기록 API 의 `deviceKey` — 영숫자·`_`·`-` 8~80자만, 그 외 null */
export function normalizeLaunchIntroEventDeviceKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.trim();
  return /^[0-9A-Za-z_-]{8,80}$/.test(k) ? k : null;
}

/**
 * 앱 진입 어드민 v3 §2 — 소재 종류. DB 열 `kind`(마이그레이션 20271117140000) 가 아직 없으면 모두 'ad' 로 읽는다.
 * 종류 'ad' 는 「광고」 표기를 끌 수 없다(화면·서버 같은 규칙).
 */
export const LAUNCH_INTRO_POOL_KINDS = ["ad", "event", "notice"] as const;
export type LaunchIntroPoolKind = (typeof LAUNCH_INTRO_POOL_KINDS)[number];
export const LAUNCH_INTRO_POOL_NAME_MAX = 80;

export function normalizeLaunchIntroPoolKind(raw: unknown): LaunchIntroPoolKind {
  return (LAUNCH_INTRO_POOL_KINDS as readonly unknown[]).includes(raw) ? (raw as LaunchIntroPoolKind) : "ad";
}

export type LaunchIntroPoolPolicy = { enabled: boolean; showOnOsRestore: boolean };
/** 기본: 켜짐(소재가 하나도 없으면 아무것도 안 나옴) · OS 종료 후 실행에도 보임(설계 OS-3 「포함한다」) */
export const DEFAULT_LAUNCH_INTRO_POOL_POLICY: LaunchIntroPoolPolicy = { enabled: true, showOnOsRestore: true };

export function normalizeLaunchIntroPoolPolicy(raw: unknown): LaunchIntroPoolPolicy {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_LAUNCH_INTRO_POOL_POLICY.enabled,
    showOnOsRestore:
      typeof o.showOnOsRestore === "boolean" ? o.showOnOsRestore : DEFAULT_LAUNCH_INTRO_POOL_POLICY.showOnOsRestore,
  };
}

export function validateLaunchIntroPoolPolicy(
  raw: unknown
): { ok: true; policy: LaunchIntroPoolPolicy } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "policy_invalid" };
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean" || typeof o.showOnOsRestore !== "boolean") {
    return { ok: false, error: "policy_invalid" };
  }
  return { ok: true, policy: { enabled: o.enabled, showOnOsRestore: o.showOnOsRestore } };
}

/** 앱에 보내는 소재 1개(공개 정보만) */
export type LaunchIntroPoolEntry = {
  id: string;
  url: string;
  sha256: string;
  mime: LaunchIntroPoolImageMime;
  bgColor: string;
  durationMs: number;
  ctaHref: string | null;
  showAdLabel: boolean;
  startAtMs: number;
  endAtMs: number;
  sortOrder: number;
};

export type LaunchIntroPoolPayload = {
  enabled: boolean;
  showOnOsRestore: boolean;
  /** 목록 판 — 같으면 기기는 다시 맞추지 않는다 */
  revision: string;
  entries: LaunchIntroPoolEntry[];
};

export type LaunchIntroPoolInput = {
  name?: unknown;
  status?: unknown;
  sortOrder?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  backgroundColor?: unknown;
  durationMs?: unknown;
  ctaHref?: unknown;
  showAdLabel?: unknown;
  kind?: unknown;
};

/** 어드민 입력 → DB 열. 모르는 값은 거절(조용히 바꾸지 않음). `partial` = 수정(온 칸만). */
export function validateLaunchIntroPoolInput(
  input: LaunchIntroPoolInput,
  opts: { partial: boolean }
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const row: Record<string, unknown> = {};
  const has = (k: keyof LaunchIntroPoolInput) => k in input && input[k] !== undefined;
  if (has("name") || !opts.partial) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > LAUNCH_INTRO_POOL_NAME_MAX) return { ok: false, error: "name_invalid" };
    row.name = name;
  }
  if (has("status")) {
    if (!(LAUNCH_INTRO_POOL_STATUSES as readonly unknown[]).includes(input.status)) {
      return { ok: false, error: "status_invalid" };
    }
    row.status = input.status;
  }
  if (has("sortOrder")) {
    if (typeof input.sortOrder !== "number" || !Number.isInteger(input.sortOrder) || Math.abs(input.sortOrder) > 100000) {
      return { ok: false, error: "sort_order_invalid" };
    }
    row.sort_order = input.sortOrder;
  }
  for (const [k, col] of [
    ["startAt", "start_at"],
    ["endAt", "end_at"],
  ] as const) {
    if (!has(k)) continue;
    const v = input[k];
    if (v === null || v === "") {
      row[col] = null;
      continue;
    }
    if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) return { ok: false, error: "window_invalid" };
    row[col] = new Date(v).toISOString();
  }
  // 빌드 전 감사 I6: 문자열이 아니라 시각(ms)으로 비교한다
  if (typeof row.start_at === "string" && typeof row.end_at === "string" && Date.parse(row.start_at) >= Date.parse(row.end_at)) {
    return { ok: false, error: "window_invalid" };
  }
  if (has("backgroundColor")) {
    if (typeof input.backgroundColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(input.backgroundColor.trim())) {
      return { ok: false, error: "background_invalid" };
    }
    row.background_color = input.backgroundColor.trim().toUpperCase();
  }
  if (has("durationMs")) {
    const d = input.durationMs;
    if (
      typeof d !== "number" ||
      !Number.isInteger(d) ||
      d < LAUNCH_INTRO_POOL_DURATION_MIN_MS ||
      d > LAUNCH_INTRO_POOL_DURATION_MAX_MS
    ) {
      return { ok: false, error: "duration_invalid" };
    }
    row.duration_ms = d;
  }
  if (has("ctaHref")) {
    const v = input.ctaHref;
    if (v === null || (typeof v === "string" && !v.trim())) row.cta_href = null;
    else {
      const href = typeof v === "string" ? v.trim() : "";
      if (href.length > 500 || !(href.startsWith("/") || href.startsWith("https://")) || !parseDestinationHref(href).ok) {
        return { ok: false, error: "cta_invalid" };
      }
      row.cta_href = href;
    }
  }
  if (has("showAdLabel")) {
    if (typeof input.showAdLabel !== "boolean") return { ok: false, error: "ad_label_invalid" };
    row.show_ad_label = input.showAdLabel;
  }
  if (has("kind")) {
    if (!(LAUNCH_INTRO_POOL_KINDS as readonly unknown[]).includes(input.kind)) return { ok: false, error: "kind_invalid" };
    row.kind = input.kind;
  }
  // 종류 「광고」 = 「광고」 표기 필수 (새 소재는 표기 기본값이 켜짐이라 생략 = 켜짐)
  if (row.kind === "ad" && row.show_ad_label === false) return { ok: false, error: "ad_label_required" };
  return { ok: true, row };
}

/** 기간 안·켜진 소재만 · 정렬 순서 */
export function selectLiveLaunchIntroPoolRows<
  T extends { status: string; start_at: string | null; end_at: string | null; sort_order: number; id: string },
>(rows: readonly T[], now: Date = new Date()): T[] {
  const t = now.getTime();
  const order = (a: T, b: T) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const live = rows.filter((r) => r.status === "active").filter((r) => !r.end_at || Date.parse(r.end_at) > t);
  // 재감사 L1: 지금 보일 소재가 먼저 — 시작 전 소재가 20개 칸을 차지해 지금 소재가 빠지지 않게
  const startsLater = (r: T) => Boolean(r.start_at && Date.parse(r.start_at) > t);
  return [...live.filter((r) => !startsLater(r)).sort(order), ...live.filter(startsLater).sort(order)].slice(
    0,
    LAUNCH_INTRO_POOL_MAX_ACTIVE
  );
}

/**
 * 앱 진입 어드민 v3 §3 「앱에 나오나」 — 기기가 받는 발견 응답(`buildLaunchIntroPoolPayload`)과 같은 규칙으로 계산한다.
 * 규칙: 전체 설정 켜짐 · 상태 켜짐 · 기간(끝나지 않음) · 20개 상한(`selectLiveLaunchIntroPoolRows`) · 그림(sha256 · 형식).
 * 시작 전이면 「예약」(목록에는 들어가 기기가 시작 시각부터 보인다). 시간 기준은 시각(ms) — 표시만 PHT.
 */
export type LaunchIntroPoolAppliedState = "live" | "scheduled" | "off";
export type LaunchIntroPoolOffReason =
  | "policy_off"
  | "paused"
  | "ended_status"
  | "window_ended"
  | "image_missing"
  | "over_cap";
export type LaunchIntroPoolApplied =
  | { state: "live"; reason: null; rank: number }
  | { state: "scheduled"; reason: null; rank: number; startAt: string }
  | { state: "off"; reason: LaunchIntroPoolOffReason; endAt?: string | null };

type AppliedRow = {
  id: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
  image_path?: string | null;
  image_sha256?: string | null;
  image_mime?: string | null;
};

/** 기기가 받아들이는 그림인가 — 네이티브는 sha256 64자 hex 가 아니면 소재를 버린다 */
export function launchIntroPoolRowHasImage(r: AppliedRow): boolean {
  return (
    Boolean(r.image_path && String(r.image_path).trim()) &&
    /^[0-9a-f]{64}$/.test(String(r.image_sha256 ?? "")) &&
    (LAUNCH_INTRO_POOL_IMAGE_MIMES as readonly string[]).includes(String(r.image_mime ?? ""))
  );
}

export function computeLaunchIntroPoolApplied<T extends AppliedRow>(
  rows: readonly T[],
  policy: LaunchIntroPoolPolicy,
  now: Date = new Date()
): Record<string, LaunchIntroPoolApplied> {
  const t = now.getTime();
  const out: Record<string, LaunchIntroPoolApplied> = {};
  const selected = selectLiveLaunchIntroPoolRows(rows, now);
  const rankById = new Map(selected.map((r, i) => [r.id, i] as const));
  for (const r of rows) {
    if (r.status === "paused") out[r.id] = { state: "off", reason: "paused" };
    else if (r.status !== "active") out[r.id] = { state: "off", reason: "ended_status" };
    else if (r.end_at && Date.parse(r.end_at) <= t) out[r.id] = { state: "off", reason: "window_ended", endAt: r.end_at };
    else if (!launchIntroPoolRowHasImage(r)) out[r.id] = { state: "off", reason: "image_missing" };
    else if (!policy.enabled) out[r.id] = { state: "off", reason: "policy_off" };
    else if (!rankById.has(r.id)) out[r.id] = { state: "off", reason: "over_cap" };
    else if (r.start_at && Date.parse(r.start_at) > t) {
      out[r.id] = { state: "scheduled", reason: null, rank: rankById.get(r.id)!, startAt: r.start_at };
    } else {
      out[r.id] = { state: "live", reason: null, rank: rankById.get(r.id)! };
    }
  }
  return out;
}
