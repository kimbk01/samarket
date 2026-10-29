/**
 * 통합 대시보드 응답 조립 (설계 v4 §3) — 지표 레지스트리 + 출처(sources) → 탭별 응답.
 * 출처는 주입한다(테스트는 가짜 출처, 서버는 `createAdminDashboardSources`). 출처 키마다 1회만 읽는다.
 * 실패 = value null + error (0 금지). 권한: 접근표로 열 수 없는 지표·링크·카테고리는 숨긴다.
 * 기간: 선택 기간(오늘·어제·7일·30일, PHT)은 출처 생성 시 넘기고, 링크에도 같은 날짜를 싣는다.
 */
import {
  ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { canAccessAdminRoute, type AdminRouteAccessActor } from "@/lib/admin/access/admin-route-access";
import type { AdminDashboardPeriodRange, AdminDashboardTrendWindow } from "@/lib/admin/metrics/dashboard-period";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import {
  ADMIN_DASHBOARD_ADMIN_QUEUE_CATEGORIES,
  ADMIN_DASHBOARD_BAND,
  ADMIN_DASHBOARD_TRENDS,
  ADMIN_QUEUE_PRIORITY_RANK,
  getAdminDashboardTab,
  getAdminMetricDefinition,
  resolveAdminMetricHref,
  type AdminDashboardTabDef,
  type AdminDashboardTabId,
  type AdminDashboardTrendId,
  type AdminMetricDefinition,
  type AdminMetricHrefParams,
  type AdminMetricSourceKey,
} from "@/lib/admin/metrics/registry";
import type {
  AdminDashboardBandTile,
  AdminDashboardMetricValue,
  AdminDashboardNoticeItem,
  AdminDashboardNoticesPayload,
  AdminDashboardOverviewPayload,
  AdminDashboardPart,
  AdminDashboardPendingItem,
  AdminDashboardPendingPayload,
  AdminDashboardRecentGroup,
  AdminDashboardRecentPayload,
  AdminDashboardTrendPayload,
  AdminDashboardTrendPoint,
} from "@/lib/admin/metrics/dashboard-overview-contract";

export type AdminDashboardMetricEntry = {
  value: number | null;
  /** 권한 범위 밖 — 표시하지 않는다 */
  forbidden?: boolean;
};

export type AdminDashboardMetricMap = ReadonlyMap<string, AdminDashboardMetricEntry>;

export type AdminDashboardSources = {
  /** 출처 키 → 지표 id 별 값. 실패는 throw. */
  metrics: (key: Exclude<AdminMetricSourceKey, "queue">) => Promise<AdminDashboardMetricMap>;
  /** 처리 대기 레지스트리 결과 (호출 관리자 권한 범위). 실패는 throw. */
  queue: () => Promise<readonly AdminActionQueueCategoryResult[]>;
  /** 추세 점 (PHT 일별, 선택 기간이 끝나는 날까지 window.days 일). 실패는 throw. */
  trend: (id: AdminDashboardTrendId, window: AdminDashboardTrendWindow) => Promise<AdminDashboardTrendPoint[]>;
  /** 최근 활동 (종류별 최신 5건). 실패는 throw. */
  recent: () => Promise<readonly AdminDashboardRecentGroup[]>;
  /** 공지 최신 5건 (고객센터 콘텐츠). 실패는 throw. 없으면 공지 블록 생략. */
  notices?: () => Promise<readonly AdminDashboardNoticeItem[]>;
};

/** 공지 전체 목록 (관리자 「공지·고객센터」 화면) */
export const ADMIN_DASHBOARD_NOTICES_HREF = "/admin/app/notices";

/** 처리 대기 항목의 세는 단위가 행 수가 아닐 때 (지표와 같은 단위 — 레지스트리 sourceDetail 참고) */
const PENDING_UNIT_NOTE: Partial<Record<AdminActionQueueCategory, { ko: string; en: string }>> = {
  community_reports: { ko: "신고 대상 기준 (같은 대상 = 1건)", en: "Per reported target" },
};

export type BuildAdminDashboardOverviewInput = {
  tab: AdminDashboardTabId;
  parts: ReadonlySet<AdminDashboardPart>;
  /** 선택 기간 — 출처(`sources`)도 같은 기간으로 만들어져 있어야 한다 */
  range: AdminDashboardPeriodRange;
  actor: AdminRouteAccessActor;
  sources: AdminDashboardSources;
  now?: Date;
};

function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "error");
  return msg.slice(0, 120) || "error";
}

type Settled<T> = { ok: true; data: T } | { ok: false; error: string };

function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => ({ ok: false as const, error: errorCode(e) })
  );
}

export function createAdminDashboardResolver(input: {
  actor: AdminRouteAccessActor;
  sources: AdminDashboardSources;
  hrefParams: AdminMetricHrefParams;
}) {
  const { actor, sources, hrefParams } = input;
  const memo = new Map<string, Promise<Settled<AdminDashboardMetricMap>>>();
  let queueMemo: Promise<Settled<readonly AdminActionQueueCategoryResult[]>> | null = null;

  const source = (key: Exclude<AdminMetricSourceKey, "queue">) => {
    let p = memo.get(key);
    if (!p) {
      p = settle(Promise.resolve().then(() => sources.metrics(key)));
      memo.set(key, p);
    }
    return p;
  };
  const queue = () => (queueMemo ??= settle(Promise.resolve().then(() => sources.queue())));

  const base = (def: AdminMetricDefinition, href: string): Omit<AdminDashboardMetricValue, "value"> => ({
    id: def.id,
    labelKo: def.labelKo,
    labelEn: def.labelEn,
    ...(def.shortKo ? { shortKo: def.shortKo } : {}),
    ...(def.shortEn ? { shortEn: def.shortEn } : {}),
    unit: def.unit,
    period: def.period,
    href,
  });

  /** null = 숨김 (권한 밖). */
  async function resolveMetric(id: string): Promise<AdminDashboardMetricValue | null> {
    const def = getAdminMetricDefinition(id);
    const href = resolveAdminMetricHref(def, hrefParams);
    if (!canAccessAdminRoute(href, actor)) return null;

    if (def.queueCategories) {
      const q = await queue();
      if (!q.ok) return { ...base(def, href), value: null, error: `queue:${q.error}` };
      const wanted = new Set<AdminActionQueueCategory>(def.queueCategories);
      // 처리 대기 목록과 같은 규칙 — 권한 밖 카테고리와 목록 화면을 열 수 없는 카테고리는 뺀다 (합계 = 목록 합계).
      const rows = q.data.filter((c) => {
        if (!wanted.has(c.key) || c.status === "forbidden") return false;
        const listHref = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key)?.listHref;
        return !listHref || canAccessAdminRoute(listHref, actor);
      });
      if (rows.length === 0) return null;
      if (rows.some((c) => c.status !== "ok" || c.count === null)) {
        return { ...base(def, href), value: null, error: "queue_unavailable" };
      }
      return { ...base(def, href), value: rows.reduce((s, c) => s + (c.count ?? 0), 0) };
    }

    const src = await source(def.source as Exclude<AdminMetricSourceKey, "queue">);
    if (!src.ok) return { ...base(def, href), value: null, error: `${def.source}:${src.error}` };
    const entry = src.data.get(def.id);
    if (!entry) return { ...base(def, href), value: null, error: `${def.source}:not_provided` };
    if (entry.forbidden) return null;
    if (entry.value === null) return { ...base(def, href), value: null, error: `${def.source}:unavailable` };
    return { ...base(def, href), value: entry.value };
  }

  async function resolvePending(tab: AdminDashboardTabDef): Promise<AdminDashboardPendingPayload> {
    const q = await queue();
    if (!q.ok) return { items: [], total: null, complete: false, error: `queue:${q.error}` };
    const byKey = new Map(q.data.map((c) => [c.key, c]));
    const keys: readonly AdminActionQueueCategory[] =
      tab.pending.kind === "categories" ? tab.pending.categories : ADMIN_DASHBOARD_ADMIN_QUEUE_CATEGORIES;

    const items: AdminDashboardPendingItem[] = [];
    let complete = true;
    for (const key of keys) {
      const def = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(key);
      const row = byKey.get(key);
      if (!def || !row || row.status === "forbidden") continue;
      if (def.listHref && !canAccessAdminRoute(def.listHref, actor)) continue;
      const unavailable = row.status !== "ok" || row.count === null;
      if (unavailable) complete = false;
      if (!unavailable && (row.count ?? 0) <= 0) continue;
      items.push({
        key,
        titleKo: def.titleKo,
        titleEn: def.titleEn,
        domainKo: def.domainKo,
        domainEn: def.domainEn,
        priority: def.priority,
        count: unavailable ? null : row.count,
        status: unavailable ? "unavailable" : "ok",
        href: def.listHref,
        ...(PENDING_UNIT_NOTE[key]
          ? { unitNoteKo: PENDING_UNIT_NOTE[key]!.ko, unitNoteEn: PENDING_UNIT_NOTE[key]!.en }
          : {}),
      });
    }
    items.sort(
      (a, b) =>
        ADMIN_QUEUE_PRIORITY_RANK[a.priority] - ADMIN_QUEUE_PRIORITY_RANK[b.priority] ||
        (b.count ?? Number.MAX_SAFE_INTEGER) - (a.count ?? Number.MAX_SAFE_INTEGER)
    );
    const total = complete ? items.reduce((n, i) => n + (i.count ?? 0), 0) : null;
    return { items, total, complete };
  }

  async function resolveBand(): Promise<AdminDashboardBandTile[]> {
    const tiles = await Promise.all(
      ADMIN_DASHBOARD_BAND.map(async (t): Promise<AdminDashboardBandTile | null> => {
        const [primary, secondary] = await Promise.all([
          resolveMetric(t.primaryMetricId),
          t.secondaryMetricId ? resolveMetric(t.secondaryMetricId) : Promise.resolve(null),
        ]);
        if (!primary) return null;
        return {
          id: t.id,
          labelKo: t.labelKo,
          labelEn: t.labelEn,
          shortKo: t.shortKo,
          shortEn: t.shortEn,
          tab: t.tab ?? null,
          href: primary.href,
          primary,
          secondary,
        };
      })
    );
    return tiles.filter((t): t is AdminDashboardBandTile => t !== null);
  }

  async function resolveTrend(
    tab: AdminDashboardTabDef,
    window: AdminDashboardTrendWindow
  ): Promise<AdminDashboardTrendPayload | null> {
    const def = ADMIN_DASHBOARD_TRENDS[tab.trend];
    if (!canAccessAdminRoute(def.href, actor)) return null;
    const res = await settle(Promise.resolve().then(() => sources.trend(def.id, window)));
    return {
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      days: window.days,
      fromDay: window.fromDay,
      toDay: window.toDay,
      ...(def.definitionKo ? { definitionKo: def.definitionKo } : {}),
      ...(def.definitionEn ? { definitionEn: def.definitionEn } : {}),
      unit: def.unit,
      series: def.series.map((s) => ({ key: s.key, labelKo: s.labelKo, labelEn: s.labelEn })),
      points: res.ok ? res.data : [],
      href: def.href,
      ...(res.ok ? {} : { error: res.error }),
    };
  }

  /** 최근 활동 — 전체 목록 화면을 열 수 있는 종류만. */
  async function resolveRecent(): Promise<AdminDashboardRecentPayload> {
    const res = await settle(Promise.resolve().then(() => sources.recent()));
    if (!res.ok) return { groups: [], error: res.error };
    return { groups: res.data.filter((g) => canAccessAdminRoute(g.href, actor)).map((g) => ({ ...g })) };
  }

  /** 공지 — 공지 화면을 열 수 있을 때만. */
  async function resolveNotices(): Promise<AdminDashboardNoticesPayload | null> {
    if (!sources.notices || !canAccessAdminRoute(ADMIN_DASHBOARD_NOTICES_HREF, actor)) return null;
    const load = sources.notices;
    const res = await settle(Promise.resolve().then(() => load()));
    if (!res.ok) return { items: [], href: ADMIN_DASHBOARD_NOTICES_HREF, error: res.error };
    return { items: res.data.map((n) => ({ ...n })), href: ADMIN_DASHBOARD_NOTICES_HREF };
  }

  return { resolveMetric, resolvePending, resolveBand, resolveTrend, resolveRecent, resolveNotices };
}

export async function buildAdminDashboardOverview(
  input: BuildAdminDashboardOverviewInput
): Promise<AdminDashboardOverviewPayload> {
  const now = input.now ?? new Date();
  const todayPht = formatAdminManilaDate(now);
  const tab = getAdminDashboardTab(input.tab);
  const r = createAdminDashboardResolver({
    actor: input.actor,
    sources: input.sources,
    hrefParams: { todayPht, range: input.range },
  });
  const want = (p: AdminDashboardPart) => input.parts.has(p);
  // 탭 접근 거부 — 탭 본문 출처는 읽지 않는다 (요약 띠·최근 활동·공지는 탭과 무관)
  const denied = Boolean(tab.access && !canAccessAdminRoute(tab.access, input.actor));
  const body = (p: AdminDashboardPart) => want(p) && !denied;

  const [band, metrics, trend, pending, recent, notices] = await Promise.all([
    want("band") ? r.resolveBand() : Promise.resolve(undefined),
    body("metrics") ? Promise.all(tab.metricIds.map(r.resolveMetric)) : Promise.resolve(undefined),
    body("trend") ? r.resolveTrend(tab, input.range.trend) : Promise.resolve(undefined),
    body("pending") ? r.resolvePending(tab) : Promise.resolve(undefined),
    want("recent") ? r.resolveRecent() : Promise.resolve(undefined),
    want("notices") ? r.resolveNotices() : Promise.resolve(undefined),
  ]);

  const payload: AdminDashboardOverviewPayload = {
    ok: true,
    tab: tab.id,
    generatedAt: now.toISOString(),
    todayPht,
    period: { id: input.range.period, fromDay: input.range.fromDay, toDay: input.range.toDay },
  };
  if (band) payload.band = band;
  if (denied) {
    payload.denied = true;
    if (want("metrics")) {
      payload.metrics = [];
      payload.shortcuts = [];
    }
  }
  if (metrics) {
    payload.metrics = metrics.filter((m): m is AdminDashboardMetricValue => m !== null);
    payload.shortcuts = tab.shortcuts.filter((s) => canAccessAdminRoute(s.href, input.actor)).map((s) => ({ ...s }));
  }
  if (trend) payload.trend = trend;
  if (pending) payload.pending = pending;
  if (recent) payload.recent = recent;
  if (notices) payload.notices = notices;
  return payload;
}
