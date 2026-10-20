/**
 * Admin 목록 조회 조건 ↔ URL 쿼리 문자열 (설계 v4 §7 「필터 바」·「페이지네이션」) — 순수 함수만.
 *
 * 공통 키: `page`(1부터) · `size`(20/50/100, 기본 20) · `status` · `q` · `from`/`to`(필리핀 날짜 YYYY-MM-DD) · `sort`
 * + 도메인 추가 키(`extras`, 예: `domain`·`wallet`). 기본값과 같은 값은 주소에 쓰지 않는다.
 * 관리하지 않는 다른 키(`tab` 등)는 `writeAdminListQuery` 가 그대로 둔다.
 * 서버 API 로 보낼 때는 `adminListQueryToApiParams` (limit/offset — `parse-admin-list-page` 계약).
 * Client-safe (서버 모듈 import 없음). React 훅은 `use-admin-list-query.ts`.
 */

export const ADMIN_LIST_PAGE_SIZES = [20, 50, 100] as const;
export type AdminListPageSize = (typeof ADMIN_LIST_PAGE_SIZES)[number];
export const ADMIN_LIST_QUERY_DEFAULT_SIZE: AdminListPageSize = 20;
/** 비정상적으로 큰 page 로 DB 를 긁는 요청 방지 (100건 × 1000쪽 = offset 100,000 — 서버 상한과 같음). */
export const ADMIN_LIST_QUERY_MAX_PAGE = 1000;
export const ADMIN_LIST_QUERY_MAX_Q_LENGTH = 100;

/** 이 모듈이 관리하는 공통 키 — `extras` 이름으로 쓸 수 없다. */
export const ADMIN_LIST_QUERY_RESERVED_KEYS = ["page", "size", "status", "q", "from", "to", "sort"] as const;

export type AdminListQueryState<E extends string = string> = {
  page: number;
  size: AdminListPageSize;
  /** "" = 전체 */
  status: string;
  q: string;
  /** "" 또는 YYYY-MM-DD (PHT) */
  from: string;
  to: string;
  /** "" = 화면 기본 정렬 */
  sort: string;
  extras: Record<E, string>;
};

export type AdminListQueryConfig<E extends string = string> = {
  /** 기본값 (주소에 생략되는 값). */
  defaults?: { status?: string; sort?: string; size?: AdminListPageSize };
  /** 허용 상태 코드 — 지정 시 목록 밖 값은 기본값으로. */
  statuses?: readonly string[];
  /** 허용 정렬 키 — 지정 시 목록 밖 값은 기본값으로. */
  sorts?: readonly string[];
  /** 도메인 추가 키 (즉시 적용 필드). */
  extras?: readonly E[];
  extraDefaults?: Partial<Record<E, string>>;
};

type ParamSource = { get(name: string): string | null } | Record<string, string | string[] | null | undefined>;

/** 키가 없으면 null (빈 값 `status=` 과 구분 — 기본 상태가 있을 때 「전체」 표현). */
function readParamRaw(sp: ParamSource, key: string): string | null {
  if (typeof (sp as { get?: unknown }).get === "function") {
    return (sp as { get(name: string): string | null }).get(key);
  }
  const v = (sp as Record<string, string | string[] | null | undefined>)[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v == null ? null : String(v);
}

function readParam(sp: ParamSource, key: string): string {
  return readParamRaw(sp, key) ?? "";
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제 달력에 있는 YYYY-MM-DD 인지 (2026-02-30 → false). */
export function isAdminListDateString(raw: string): boolean {
  const m = DATE_RE.exec(raw);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  return isAdminListDateString(s) ? s : "";
}

/** 검색어 정리 — 앞뒤 공백 제거, 연속 공백 1칸, 최대 100자. */
export function normalizeAdminListSearch(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ADMIN_LIST_QUERY_MAX_Q_LENGTH);
}

export function normalizeAdminListPageSize(raw: unknown, fallback: AdminListPageSize = ADMIN_LIST_QUERY_DEFAULT_SIZE): AdminListPageSize {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return (ADMIN_LIST_PAGE_SIZES as readonly number[]).includes(n) ? (n as AdminListPageSize) : fallback;
}

export function normalizeAdminListPage(raw: unknown): number {
  const s = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return 1;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return Math.min(n, ADMIN_LIST_QUERY_MAX_PAGE);
}

function pickAllowed(raw: string | null, allowed: readonly string[] | undefined, fallback: string): string {
  if (raw === null) return fallback;
  const v = raw.trim();
  /** 명시적 빈 값 = 「전체」 (기본값이 비어 있지 않은 화면에서만 주소에 남는다). */
  if (!v) return "";
  if (allowed && !allowed.includes(v)) return fallback;
  return v;
}

/** 기간 정리 — 잘못된 날짜는 비우고, from > to 이면 서로 바꾼다. */
export function normalizeAdminListPeriod(from: string, to: string): { from: string; to: string } {
  const f = normalizeDate(from);
  const t = normalizeDate(to);
  if (f && t && f > t) return { from: t, to: f };
  return { from: f, to: t };
}

function assertExtras<E extends string>(config: AdminListQueryConfig<E>): readonly E[] {
  const extras = config.extras ?? [];
  for (const k of extras) {
    if ((ADMIN_LIST_QUERY_RESERVED_KEYS as readonly string[]).includes(k)) {
      throw new Error(`admin_list_query_reserved_extra:${k}`);
    }
  }
  return extras;
}

/** 기본 상태 (주소가 비었을 때 / 초기화 후). */
export function defaultAdminListQuery<E extends string = string>(
  config: AdminListQueryConfig<E> = {}
): AdminListQueryState<E> {
  const extras = {} as Record<E, string>;
  for (const k of assertExtras(config)) extras[k] = config.extraDefaults?.[k] ?? "";
  return {
    page: 1,
    size: config.defaults?.size ?? ADMIN_LIST_QUERY_DEFAULT_SIZE,
    status: config.defaults?.status ?? "",
    q: "",
    from: "",
    to: "",
    sort: config.defaults?.sort ?? "",
    extras,
  };
}

/** URL 쿼리 → 정리된 목록 상태. 잘못된 값은 조용히 기본값으로 돌린다. */
export function parseAdminListQuery<E extends string = string>(
  sp: ParamSource,
  config: AdminListQueryConfig<E> = {}
): AdminListQueryState<E> {
  const def = defaultAdminListQuery(config);
  const period = normalizeAdminListPeriod(readParam(sp, "from"), readParam(sp, "to"));
  const extras = { ...def.extras };
  for (const k of assertExtras(config)) {
    const v = readParam(sp, k).trim();
    if (v) extras[k] = v;
  }
  return {
    page: normalizeAdminListPage(readParam(sp, "page")),
    size: normalizeAdminListPageSize(readParam(sp, "size"), def.size),
    status: pickAllowed(readParamRaw(sp, "status"), config.statuses, def.status),
    q: normalizeAdminListSearch(readParam(sp, "q")),
    from: period.from,
    to: period.to,
    sort: pickAllowed(readParamRaw(sp, "sort"), config.sorts, def.sort) || def.sort,
    extras,
  };
}

/**
 * 목록 상태를 `base` 쿼리에 써 넣은 새 URLSearchParams 를 돌려준다.
 * 관리 키는 지우고 기본값이 아닌 것만 다시 쓴다 — `tab` 등 다른 키는 유지.
 */
export function writeAdminListQuery<E extends string = string>(
  base: URLSearchParams | string,
  state: AdminListQueryState<E>,
  config: AdminListQueryConfig<E> = {}
): URLSearchParams {
  const def = defaultAdminListQuery(config);
  const extrasKeys = assertExtras(config);
  const out = new URLSearchParams(typeof base === "string" ? base : base.toString());
  for (const k of ADMIN_LIST_QUERY_RESERVED_KEYS) out.delete(k);
  for (const k of extrasKeys) out.delete(k);

  const q = normalizeAdminListSearch(state.q);
  const period = normalizeAdminListPeriod(state.from, state.to);
  const size = normalizeAdminListPageSize(state.size, def.size);
  const status = state.status.trim();
  const sort = state.sort.trim();

  if (status && status !== def.status) out.set("status", status);
  else if (!status && def.status) out.set("status", "");
  if (q) out.set("q", q);
  if (period.from) out.set("from", period.from);
  if (period.to) out.set("to", period.to);
  if (sort && sort !== def.sort) out.set("sort", sort);
  for (const k of extrasKeys) {
    const v = String(state.extras?.[k] ?? "").trim();
    if (v && v !== def.extras[k]) out.set(k, v);
  }
  if (size !== def.size) out.set("size", String(size));
  const page = normalizeAdminListPage(state.page);
  if (page > 1) out.set("page", String(page));
  return out;
}

/** 경로 + 목록 상태 → `pathname?query` (쿼리가 비면 경로만). */
export function adminListQueryHref<E extends string = string>(
  pathname: string,
  base: URLSearchParams | string,
  state: AdminListQueryState<E>,
  config: AdminListQueryConfig<E> = {}
): string {
  const qs = writeAdminListQuery(base, state, config).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 즉시 적용 필드(상태·정렬·크기·추가 키)를 바꾸면 1쪽으로. `page` 만 바꾸면 그대로. */
export type AdminListQueryPatch<E extends string = string> = Partial<
  Pick<AdminListQueryState<E>, "page" | "size" | "status" | "q" | "from" | "to" | "sort">
> & { extras?: Partial<Record<E, string>> };

export function applyAdminListQueryPatch<E extends string = string>(
  state: AdminListQueryState<E>,
  patch: AdminListQueryPatch<E>
): AdminListQueryState<E> {
  const next: AdminListQueryState<E> = {
    ...state,
    ...patch,
    extras: { ...state.extras, ...(patch.extras ?? {}) } as Record<E, string>,
  };
  const onlyPage = Object.keys(patch).every((k) => k === "page");
  if (!onlyPage) next.page = patch.page ?? 1;
  const period = normalizeAdminListPeriod(next.from, next.to);
  next.from = period.from;
  next.to = period.to;
  next.q = normalizeAdminListSearch(next.q);
  next.page = normalizeAdminListPage(next.page);
  return next;
}

/**
 * 서버 목록 API 파라미터 — `limit`/`offset` (parse-admin-list-page 계약) + 필터 키.
 * 빈 값은 보내지 않는다. 기간은 PHT 날짜 문자열 그대로 — UTC 변환은 서버 책임.
 */
export function adminListQueryToApiParams<E extends string = string>(
  state: AdminListQueryState<E>,
  config: AdminListQueryConfig<E> = {}
): URLSearchParams {
  const out = new URLSearchParams();
  const page = normalizeAdminListPage(state.page);
  out.set("limit", String(state.size));
  out.set("offset", String((page - 1) * state.size));
  if (state.status) out.set("status", state.status);
  if (state.q) out.set("q", state.q);
  if (state.from) out.set("from", state.from);
  if (state.to) out.set("to", state.to);
  if (state.sort) out.set("sort", state.sort);
  for (const k of assertExtras(config)) {
    const v = String(state.extras?.[k] ?? "").trim();
    if (v) out.set(k, v);
  }
  return out;
}
