/**
 * 통합 대시보드 응답 조립 (설계 v4 §3) — 지표 레지스트리 + 출처(sources) → 탭별 응답.
 * 출처는 주입한다(테스트는 가짜 출처, 서버는 `createAdminDashboardSources`). 출처 키마다 1회만 읽는다.
 * 실패 = value null + error (0 금지). 권한: 접근표로 열 수 없는 지표·링크·카테고리는 숨긴다.
 */
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { canAccessAdminRoute, type AdminRouteAccessActor } from "@/lib/admin/access/admin-route-access";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import {
  ADMIN_DASHBOARD_BAND,
  ADMIN_DASHBOARD_TRENDS,
  ADMIN_QUEUE_PRIORITY_RANK,
  getAdminDashboardTab,
  getAdminMetricDefinition,
  resolveAdminMetricHref,
  type AdminDashboardDomainCardDef,
  type AdminDashboardTabDef,
  type AdminDashboardTabId,
  type AdminDashboardTrendId,
  type AdminMetricDefinition,
  type AdminMetricHrefParams,
  type AdminMetricSourceKey,
} from "@/lib/admin/metrics/registry";
import type {
  AdminDashboardBandTile,
  AdminDashboardDomainCard,
  AdminDashboardMetricValue,
  AdminDashboardOverviewPayload,
  AdminDashboardPart,
  AdminDashboardPendingItem,
  AdminDashboardPendingPayload,
  AdminDashboardTrendPayload,
  AdminDashboardTrendPoint,
} from "@/lib/admin/metrics/dashboard-overview-contract";

export type AdminDashboardMetricEntry = {
  value: number | null;
  /** 권한 범위 밖 — 표시하지 않는다 */
  forbidden?: boolean;
  /** 도메인 지표 구역 (action·risk·state …) — 도메인 카드 합계용 */
  section?: string;
};

export type AdminDashboardMetricMap = ReadonlyMap<string, AdminDashboardMetricEntry>;

export type AdminDashboardSources = {
  /** 출처 키 → 지표 id 별 값. 실패는 throw. */
  metrics: (key: Exclude<AdminMetricSourceKey, "queue">) => Promise<AdminDashboardMetricMap>;
  /** 처리 대기 레지스트리 결과 (호출 관리자 권한 범위). 실패는 throw. */
  queue: () => Promise<readonly AdminActionQueueCategoryResult[]>;
  /** 추세 점 (PHT 버킷). 실패는 throw. */
  trend: (id: AdminDashboardTrendId, range: 7 | 30) => Promise<AdminDashboardTrendPoint[]>;
};

export type BuildAdminDashboardOverviewInput = {
  tab: AdminDashboardTabId;
  parts: ReadonlySet<AdminDashboardPart>;
  range: 7 | 30;
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
      const rows = q.data.filter((c) => wanted.has(c.key) && c.status !== "forbidden");
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

  async function resolveDomainCard(card: AdminDashboardDomainCardDef): Promise<AdminDashboardDomainCard | null> {
    if (!canAccessAdminRoute(card.href, actor)) return null;
    const [kpis, src] = await Promise.all([Promise.all(card.kpiMetricIds.map(resolveMetric)), source(card.domain)]);
    const out: AdminDashboardDomainCard = {
      domain: card.domain,
      labelKo: card.labelKo,
      labelEn: card.labelEn,
      href: card.href,
      kpis: kpis.filter((k): k is AdminDashboardMetricValue => k !== null),
      pending: null,
      risk: null,
    };
    if (!src.ok) return { ...out, error: `${card.domain}:${src.error}` };
    const sum = (section: string): number | null => {
      let n = 0;
      for (const e of src.data.values()) {
        if (e.section !== section || e.forbidden) continue;
        if (e.value === null) return null;
        n += e.value;
      }
      return n;
    };
    return { ...out, pending: sum("action"), risk: sum("risk") };
  }

  async function resolvePending(tab: AdminDashboardTabDef): Promise<AdminDashboardPendingPayload> {
    const q = await queue();
    if (!q.ok) return { items: [], complete: false, error: `queue:${q.error}` };
    const byKey = new Map(q.data.map((c) => [c.key, c]));
    const keys: readonly AdminActionQueueCategory[] =
      tab.pending.kind === "categories"
        ? tab.pending.categories
        : ADMIN_ACTION_QUEUE_REGISTRY.filter(
            (d) =>
              d.lifecycle === "active" &&
              d.nextActor === "admin" &&
              (d.priority === "P0_CRITICAL" || d.priority === "P1_ACTION_REQUIRED")
          ).map((d) => d.key);

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
      });
    }
    items.sort(
      (a, b) =>
        ADMIN_QUEUE_PRIORITY_RANK[a.priority] - ADMIN_QUEUE_PRIORITY_RANK[b.priority] ||
        (b.count ?? Number.MAX_SAFE_INTEGER) - (a.count ?? Number.MAX_SAFE_INTEGER)
    );
    const limited = tab.pending.kind === "top_p0_p1" ? items.slice(0, tab.pending.limit) : items;
    return { items: limited, complete };
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

  async function resolveTrend(tab: AdminDashboardTabDef, range: 7 | 30): Promise<AdminDashboardTrendPayload | null> {
    const def = ADMIN_DASHBOARD_TRENDS[tab.trend];
    if (!canAccessAdminRoute(def.href, actor)) return null;
    const r: 7 | 30 = def.ranges.includes(range) ? range : def.ranges[0];
    const res = await settle(Promise.resolve().then(() => sources.trend(def.id, r)));
    return {
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      bucket: def.bucket,
      range: r,
      ranges: def.ranges,
      unit: def.unit,
      series: def.series.map((s) => ({ key: s.key, labelKo: s.labelKo, labelEn: s.labelEn })),
      points: res.ok ? res.data : [],
      href: def.href,
      ...(res.ok ? {} : { error: res.error }),
    };
  }

  return { resolveMetric, resolveDomainCard, resolvePending, resolveBand, resolveTrend };
}

export async function buildAdminDashboardOverview(
  input: BuildAdminDashboardOverviewInput
): Promise<AdminDashboardOverviewPayload> {
  const now = input.now ?? new Date();
  const todayPht = formatAdminManilaDate(now);
  const tab = getAdminDashboardTab(input.tab);
  const r = createAdminDashboardResolver({ actor: input.actor, sources: input.sources, hrefParams: { todayPht } });
  const want = (p: AdminDashboardPart) => input.parts.has(p);

  const [band, metrics, domainCards, trend, pending] = await Promise.all([
    want("band") ? r.resolveBand() : Promise.resolve(undefined),
    want("metrics") ? Promise.all(tab.metricIds.map(r.resolveMetric)) : Promise.resolve(undefined),
    want("metrics") && tab.domainCards ? Promise.all(tab.domainCards.map(r.resolveDomainCard)) : Promise.resolve(undefined),
    want("trend") ? r.resolveTrend(tab, input.range) : Promise.resolve(undefined),
    want("pending") ? r.resolvePending(tab) : Promise.resolve(undefined),
  ]);

  const payload: AdminDashboardOverviewPayload = {
    ok: true,
    tab: tab.id,
    generatedAt: now.toISOString(),
    todayPht,
  };
  if (band) payload.band = band;
  if (metrics) {
    payload.metrics = metrics.filter((m): m is AdminDashboardMetricValue => m !== null);
    payload.shortcuts = tab.shortcuts.filter((s) => canAccessAdminRoute(s.href, input.actor)).map((s) => ({ ...s }));
  }
  if (domainCards) payload.domainCards = domainCards.filter((c): c is AdminDashboardDomainCard => c !== null);
  if (trend) payload.trend = trend;
  if (pending) payload.pending = pending;
  return payload;
}
