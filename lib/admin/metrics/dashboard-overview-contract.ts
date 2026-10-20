/**
 * 통합 대시보드 API 응답 계약 (`GET /api/admin/dashboard/overview`) + 화면 병합 규칙.
 * 오류 시 0 대신 이전 값 + 「불러오기 실패」(설계 v4 §3-3). 클라이언트 안전.
 */
import { formatAdminNumber, formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";
import type { AdminActionQueueCategory, AdminActionQueuePriority } from "@/lib/admin/admin-action-queue-registry";
import type { AdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import type {
  AdminDashboardTabId,
  AdminDashboardTrendId,
  AdminMetricPeriod,
  AdminMetricUnit,
} from "@/lib/admin/metrics/registry";

export const ADMIN_DASHBOARD_PARTS = ["band", "metrics", "trend", "pending", "recent", "notices"] as const;
export type AdminDashboardPart = (typeof ADMIN_DASHBOARD_PARTS)[number];

/** `parts=band,pending` → 집합. 비었거나 모르는 값만 있으면 전부. */
export function parseAdminDashboardParts(raw: string | null | undefined): ReadonlySet<AdminDashboardPart> {
  const wanted = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AdminDashboardPart => (ADMIN_DASHBOARD_PARTS as readonly string[]).includes(s));
  return new Set(wanted.length ? wanted : ADMIN_DASHBOARD_PARTS);
}

export type AdminDashboardMetricValue = {
  id: string;
  labelKo: string;
  labelEn: string;
  shortKo?: string;
  shortEn?: string;
  unit: AdminMetricUnit;
  /** 화면 칩: now = 「현재」 · selected = 선택 기간 · today_fixed = 「오늘」 */
  period: AdminMetricPeriod;
  /** null = 확인 불가 (0 아님) */
  value: number | null;
  /** 값이 null 인 이유 (출처 실패 등) */
  error?: string;
  href: string;
  /** 화면 병합: 이번 응답이 실패해 이전 값을 유지 중 */
  stale?: boolean;
};

export type AdminDashboardBandTile = {
  id: string;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  tab: AdminDashboardTabId | null;
  href: string;
  primary: AdminDashboardMetricValue;
  secondary: AdminDashboardMetricValue | null;
};

export type AdminDashboardTrendPoint = { key: string; values: Record<string, number> };

export type AdminDashboardTrendPayload = {
  id: AdminDashboardTrendId;
  labelKo: string;
  labelEn: string;
  /** PHT 일별 버킷 수 — 선택 기간이 끝나는 날(toDay)까지 */
  days: 7 | 30;
  /** 추세 창 PHT 날짜 (양끝 포함) — 「어제」 선택 시 어제에서 끝난다 */
  fromDay: string;
  toDay: string;
  /** 집계 정의 (예: 7일 활성) */
  definitionKo?: string;
  definitionEn?: string;
  unit: AdminMetricUnit;
  series: { key: string; labelKo: string; labelEn: string }[];
  points: AdminDashboardTrendPoint[];
  href: string;
  /** 실패 시 points = [] + error */
  error?: string;
};

export type AdminDashboardPendingItem = {
  key: AdminActionQueueCategory;
  titleKo: string;
  titleEn: string;
  domainKo: string;
  domainEn: string;
  priority: AdminActionQueuePriority;
  count: number | null;
  status: "ok" | "unavailable";
  /** null = 같은 조건을 읽는 목록 없음 (레거시 보관) — 링크 없음 */
  href: string | null;
  /** 세는 단위가 행 수가 아닐 때 (예: 커뮤니티 신고 = 신고 대상 묶음) */
  unitNoteKo?: string;
  unitNoteEn?: string;
};

export type AdminDashboardPendingPayload = {
  items: AdminDashboardPendingItem[];
  /** 보이는 항목 합계 (확인 불가 항목이 있으면 null) */
  total: number | null;
  /** false = 보이는 카테고리 중 확인 불가가 있음 */
  complete: boolean;
  error?: string;
};

/** 최근 활동 (설계 이전 대시보드 「최근 활동」 복구) — 종류별 최신 5건. */
export type AdminDashboardRecentKind = "products" | "users" | "reports" | "chats" | "reviews";

export type AdminDashboardRecentItem = {
  id: string;
  title: string;
  sub: string;
  /** UTC ISO (표시는 PHT) */
  at: string | null;
  href: string;
};

export type AdminDashboardRecentGroup = {
  kind: AdminDashboardRecentKind;
  labelKo: string;
  labelEn: string;
  /** 전체 목록 */
  href: string;
  items: AdminDashboardRecentItem[];
};

export type AdminDashboardRecentPayload = {
  groups: AdminDashboardRecentGroup[];
  error?: string;
};

/** 공지 (고객센터 콘텐츠 `app_notices` — 관리자 「공지·고객센터」 화면과 같은 원장) 최신 5건 */
export type AdminDashboardNoticeState = "published" | "scheduled" | "ended" | "hidden";

export type AdminDashboardNoticeItem = {
  id: string;
  title: string;
  /** notice · system · marketing */
  contentType: string;
  state: AdminDashboardNoticeState;
  /** UTC ISO (표시는 PHT) — 게시 시각, 없으면 작성 시각 */
  at: string | null;
  href: string;
};

export type AdminDashboardNoticesPayload = {
  items: AdminDashboardNoticeItem[];
  /** 전체 목록 */
  href: string;
  error?: string;
};

export type AdminDashboardOverviewPayload = {
  ok: true;
  tab: AdminDashboardTabId;
  generatedAt: string;
  todayPht: string;
  period: { id: AdminDashboardPeriod; fromDay: string; toDay: string };
  band?: AdminDashboardBandTile[];
  metrics?: AdminDashboardMetricValue[];
  trend?: AdminDashboardTrendPayload;
  pending?: AdminDashboardPendingPayload;
  recent?: AdminDashboardRecentPayload;
  notices?: AdminDashboardNoticesPayload;
  shortcuts?: { id: string; labelKo: string; labelEn: string; href: string }[];
};

/** 새 값이 실패(null + error)면 이전 값을 유지하고 stale 표시 — 0 으로 덮지 않는다. */
export function mergeAdminDashboardMetric(
  prev: AdminDashboardMetricValue | null | undefined,
  next: AdminDashboardMetricValue
): AdminDashboardMetricValue {
  if (next.value !== null || !next.error) return { ...next, stale: false };
  if (prev && prev.value !== null) return { ...next, value: prev.value, stale: true };
  return { ...next, stale: false };
}

export function mergeAdminDashboardMetrics(
  prev: readonly AdminDashboardMetricValue[] | null | undefined,
  next: readonly AdminDashboardMetricValue[]
): AdminDashboardMetricValue[] {
  const byId = new Map((prev ?? []).map((m) => [m.id, m]));
  return next.map((m) => mergeAdminDashboardMetric(byId.get(m.id), m));
}

export function mergeAdminDashboardBand(
  prev: readonly AdminDashboardBandTile[] | null | undefined,
  next: readonly AdminDashboardBandTile[]
): AdminDashboardBandTile[] {
  const byId = new Map((prev ?? []).map((t) => [t.id, t]));
  return next.map((t) => {
    const p = byId.get(t.id);
    return {
      ...t,
      primary: mergeAdminDashboardMetric(p?.primary, t.primary),
      secondary: t.secondary ? mergeAdminDashboardMetric(p?.secondary ?? null, t.secondary) : null,
    };
  });
}

/** 응답 안 어느 부분이든 실패가 있으면 true — 「갱신 시각」은 모두 성공했을 때만 바꾼다. */
export function adminDashboardPayloadHasErrors(p: AdminDashboardOverviewPayload): boolean {
  const metricFailed = (m: AdminDashboardMetricValue | null | undefined) => Boolean(m?.error);
  if (p.band?.some((t) => metricFailed(t.primary) || metricFailed(t.secondary))) return true;
  if (p.metrics?.some(metricFailed)) return true;
  if (p.trend?.error) return true;
  if (p.pending && (p.pending.error || !p.pending.complete)) return true;
  if (p.recent?.error) return true;
  if (p.notices?.error) return true;
  return false;
}

/** 처리 대기 — 확인 불가 항목은 이전 숫자 유지. */
export function mergeAdminDashboardPending(
  prev: AdminDashboardPendingPayload | null | undefined,
  next: AdminDashboardPendingPayload
): AdminDashboardPendingPayload {
  if (next.error && prev) return { ...prev, error: next.error };
  const byKey = new Map((prev?.items ?? []).map((i) => [i.key, i]));
  return {
    ...next,
    items: next.items.map((i) => {
      if (i.status === "ok") return i;
      const p = byKey.get(i.key);
      return p && p.count !== null ? { ...i, count: p.count } : i;
    }),
  };
}

export function formatAdminDashboardValue(value: number | null, unit: AdminMetricUnit): string {
  if (value === null) return "—";
  return unit === "php_minor" ? formatAdminPhpMinor(value) : formatAdminNumber(value);
}

/** 숫자 뒤 단위 — 건 · 명 · 곳 (₱ 는 값 앞에 이미 붙는다). */
export const ADMIN_DASHBOARD_UNIT_SUFFIX: Readonly<Record<AdminMetricUnit, { ko: string; en: string }>> = {
  count: { ko: "건", en: "" },
  people: { ko: "명", en: "" },
  stores: { ko: "곳", en: "" },
  php_minor: { ko: "", en: "" },
};
