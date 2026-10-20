/**
 * 통합 대시보드 API 응답 계약 (`GET /api/admin/dashboard/overview`) + 화면 병합 규칙.
 * 오류 시 0 대신 이전 값 + 「불러오기 실패」(설계 v4 §3-3). 클라이언트 안전.
 */
import type { AdminActionQueueCategory, AdminActionQueuePriority } from "@/lib/admin/admin-action-queue-registry";
import type {
  AdminDashboardTabId,
  AdminDashboardTrendId,
  AdminMetricUnit,
} from "@/lib/admin/metrics/registry";

export const ADMIN_DASHBOARD_PARTS = ["band", "metrics", "trend", "pending"] as const;
export type AdminDashboardPart = (typeof ADMIN_DASHBOARD_PARTS)[number];

/** `parts=band,pending` → 집합. 비었거나 모르는 값만 있으면 전부. */
export function parseAdminDashboardParts(raw: string | null | undefined): ReadonlySet<AdminDashboardPart> {
  const wanted = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AdminDashboardPart => (ADMIN_DASHBOARD_PARTS as readonly string[]).includes(s));
  return new Set(wanted.length ? wanted : ADMIN_DASHBOARD_PARTS);
}

/** 추세 기간 — 7 또는 30 (그 밖 = 7). */
export function parseAdminDashboardRange(raw: string | null | undefined): 7 | 30 {
  return String(raw ?? "").trim() === "30" ? 30 : 7;
}

export type AdminDashboardMetricValue = {
  id: string;
  labelKo: string;
  labelEn: string;
  shortKo?: string;
  shortEn?: string;
  unit: AdminMetricUnit;
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

export type AdminDashboardDomainCard = {
  domain: "community" | "trade" | "delivery" | "chat";
  labelKo: string;
  labelEn: string;
  href: string;
  kpis: AdminDashboardMetricValue[];
  /** 처리 대기 합 (action 구역) — null = 일부 확인 불가 */
  pending: number | null;
  /** 운영 위험 신호 수 (risk 구역) */
  risk: number | null;
  error?: string;
};

export type AdminDashboardTrendPoint = { key: string; values: Record<string, number> };

export type AdminDashboardTrendPayload = {
  id: AdminDashboardTrendId;
  labelKo: string;
  labelEn: string;
  bucket: "daily" | "hourly";
  range: 7 | 30;
  ranges: readonly (7 | 30)[];
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
};

export type AdminDashboardPendingPayload = {
  items: AdminDashboardPendingItem[];
  /** false = 보이는 카테고리 중 확인 불가가 있음 */
  complete: boolean;
  error?: string;
};

export type AdminDashboardOverviewPayload = {
  ok: true;
  tab: AdminDashboardTabId;
  generatedAt: string;
  todayPht: string;
  band?: AdminDashboardBandTile[];
  metrics?: AdminDashboardMetricValue[];
  domainCards?: AdminDashboardDomainCard[];
  trend?: AdminDashboardTrendPayload;
  pending?: AdminDashboardPendingPayload;
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

/** ₱ 표시 — 캐시 minor(센타보) → 페소, en-PH 천 단위. */
export function formatAdminPhpMinor(minor: number): string {
  const php = Math.trunc(minor) / 100;
  return `₱${php.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export function formatAdminDashboardValue(value: number | null, unit: AdminMetricUnit): string {
  if (value === null) return "—";
  return unit === "php_minor" ? formatAdminPhpMinor(value) : Math.trunc(value).toLocaleString("en-PH");
}
