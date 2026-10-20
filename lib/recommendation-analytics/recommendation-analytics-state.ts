/**
 * 추천 분석·보고서 — 섹션 헬스·운영 보고서 저장소 (admin_settings recommendation_analytics_v1).
 * 노출/클릭/전환 기록은 여기 없다 — 테이블 recommendation_impressions + 요약 RPC (R7 후속,
 * 예전 MAX_IMPRESSIONS 500 메모리 링버퍼 제거). 요약은 recommendation-records-summary-state.
 */
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { RecommendationSectionHealth, HealthStatus } from "@/lib/types/recommendation-monitoring";
import type {
  RecommendationReport,
  ReportType,
  ReportSurface,
  RecommendationReportKpis,
  RecommendationReportSection,
  SectionHealthStatus,
  RecommendationReportVersion,
  RecommendationRegionAnalytics,
  RecommendationReasonAnalytics,
  RecommendationCategoryAnalytics,
  RecommendationBriefingBoard,
} from "@/lib/types/recommendation-report";

export type SurfaceMetrics = {
  successRate: number;
  emptyFeedRate: number;
  avgCtr: number;
  avgConversionRate: number;
};

function isoNow() {
  return new Date().toISOString();
}

function defaultSurfaceMetrics(): Record<RecommendationSurface, SurfaceMetrics> {
  return {
    home: { successRate: 0.98, emptyFeedRate: 0.02, avgCtr: 0.04, avgConversionRate: 0.07 },
    search: {
      successRate: 0.96,
      emptyFeedRate: 0.03,
      avgCtr: 0.035,
      avgConversionRate: 0.06,
    },
    shop: {
      successRate: 0.97,
      emptyFeedRate: 0.025,
      avgCtr: 0.038,
      avgConversionRate: 0.065,
    },
  };
}

function defaultSectionHealth(): RecommendationSectionHealth[] {
  const now = isoNow();
  const sections: { surface: RecommendationSurface; sectionKey: string }[] = [];
  (["home", "search", "shop"] as RecommendationSurface[]).forEach((surface) => {
    [
      "recommended",
      "local_latest",
      "bumped",
      "sponsored",
      "premium_shops",
      "recent_based",
    ].forEach((sectionKey) => {
      sections.push({ surface, sectionKey });
    });
  });
  return sections.map((s, i) => ({
    id: `rsh-${s.surface}-${s.sectionKey}`,
    surface: s.surface,
    sectionKey: s.sectionKey,
    status: "healthy" as HealthStatus,
    impressionCount: 1000 + i * 100,
    clickCount: 40 + i * 5,
    ctr: 0.03 + i * 0.002,
    emptyRate: 0.01,
    dedupeDropRate: 0.05,
    updatedAt: now,
  }));
}

/**
 * 보고서·보고서 KPI 는 관리자가 「보고서 생성」으로 만든 것만 둔다 (생성 시 KPI = DB 추천 기록 집계).
 * 예전 예시 보고서(rr-1·rr-2)와 고정 KPI(노출 125,000 등)는 실제 데이터가 아니어서 두지 않는다 (R7 실측).
 */
const SECTION_HEALTH: RecommendationSectionHealth[] = defaultSectionHealth();
const REPORTS: RecommendationReport[] = [];
const REPORT_KPIS: RecommendationReportKpis[] = [];
const REPORT_SECTIONS: RecommendationReportSection[] = [];
const REPORT_VERSIONS: RecommendationReportVersion[] = [];
const REGION_ANALYTICS: RecommendationRegionAnalytics[] = [];
const REASON_ANALYTICS: RecommendationReasonAnalytics[] = [];
const CATEGORY_ANALYTICS: RecommendationCategoryAnalytics[] = [];
const BRIEFING_BOARDS: RecommendationBriefingBoard[] = [];
const SURFACE_METRICS: Record<RecommendationSurface, SurfaceMetrics> = defaultSurfaceMetrics();

export type RecommendationAnalyticsBundleV1 = {
  version: 1;
  sectionHealth: RecommendationSectionHealth[];
  reports: RecommendationReport[];
  reportKpis: RecommendationReportKpis[];
  reportSections: RecommendationReportSection[];
  reportVersions: RecommendationReportVersion[];
  regionAnalytics: RecommendationRegionAnalytics[];
  reasonAnalytics: RecommendationReasonAnalytics[];
  categoryAnalytics: RecommendationCategoryAnalytics[];
  briefingBoards: RecommendationBriefingBoard[];
  surfaceMetrics: Record<RecommendationSurface, SurfaceMetrics>;
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultRecommendationAnalyticsBundle(): RecommendationAnalyticsBundleV1 {
  return {
    version: 1,
    sectionHealth: defaultSectionHealth().map((h) => ({ ...h })),
    reports: [],
    reportKpis: [],
    reportSections: [],
    reportVersions: [],
    regionAnalytics: [],
    reasonAnalytics: [],
    categoryAnalytics: [],
    briefingBoards: [],
    surfaceMetrics: defaultSurfaceMetrics(),
  };
}

export function importRecommendationAnalyticsBundle(
  bundle: RecommendationAnalyticsBundleV1
): void {
  if (bundle.version !== 1) return;
  replaceArray(
    SECTION_HEALTH,
    (bundle.sectionHealth ?? []).map((h) => ({ ...h }))
  );
  replaceArray(REPORTS, (bundle.reports ?? []).map((r) => ({ ...r })));
  replaceArray(REPORT_KPIS, (bundle.reportKpis ?? []).map((k) => ({ ...k })));
  replaceArray(
    REPORT_SECTIONS,
    (bundle.reportSections ?? []).map((s) => ({ ...s }))
  );
  replaceArray(
    REPORT_VERSIONS,
    (bundle.reportVersions ?? []).map((v) => ({ ...v }))
  );
  replaceArray(
    REGION_ANALYTICS,
    (bundle.regionAnalytics ?? []).map((r) => ({ ...r }))
  );
  replaceArray(
    REASON_ANALYTICS,
    (bundle.reasonAnalytics ?? []).map((r) => ({ ...r }))
  );
  replaceArray(
    CATEGORY_ANALYTICS,
    (bundle.categoryAnalytics ?? []).map((c) => ({ ...c }))
  );
  replaceArray(
    BRIEFING_BOARDS,
    (bundle.briefingBoards ?? []).map((b) => ({ ...b }))
  );
  const metrics = bundle.surfaceMetrics ?? defaultSurfaceMetrics();
  for (const surface of ["home", "search", "shop"] as RecommendationSurface[]) {
    SURFACE_METRICS[surface] = { ...metrics[surface] };
  }
  if (!SECTION_HEALTH.length) replaceArray(SECTION_HEALTH, defaultSectionHealth());
}

export function exportRecommendationAnalyticsBundle(): RecommendationAnalyticsBundleV1 {
  return {
    version: 1,
    sectionHealth: SECTION_HEALTH.map((h) => ({ ...h })),
    reports: REPORTS.map((r) => ({ ...r })),
    reportKpis: REPORT_KPIS.map((k) => ({ ...k })),
    reportSections: REPORT_SECTIONS.map((s) => ({ ...s })),
    reportVersions: REPORT_VERSIONS.map((v) => ({ ...v })),
    regionAnalytics: REGION_ANALYTICS.map((r) => ({ ...r })),
    reasonAnalytics: REASON_ANALYTICS.map((r) => ({ ...r })),
    categoryAnalytics: CATEGORY_ANALYTICS.map((c) => ({ ...c })),
    briefingBoards: BRIEFING_BOARDS.map((b) => ({ ...b })),
    surfaceMetrics: {
      home: { ...SURFACE_METRICS.home },
      search: { ...SURFACE_METRICS.search },
      shop: { ...SURFACE_METRICS.shop },
    },
  };
}

/* ─── surface metrics ───────────────────────────────────────── */

export function getSurfaceMetrics(): Record<RecommendationSurface, SurfaceMetrics> {
  return {
    home: { ...SURFACE_METRICS.home },
    search: { ...SURFACE_METRICS.search },
    shop: { ...SURFACE_METRICS.shop },
  };
}

export function setSurfaceMetrics(
  metrics: Partial<Record<RecommendationSurface, Partial<SurfaceMetrics>>>
): void {
  for (const surface of ["home", "search", "shop"] as RecommendationSurface[]) {
    const patch = metrics[surface];
    if (patch) Object.assign(SURFACE_METRICS[surface], patch);
  }
}

/* ─── impressions ───────────────────────────────────────────── */

/**
 * 회원 앱(찜 → 전환) 호출 지점 호환용. 노출·전환 기록원은 아직 없다 (범위 밖 — 테이블 recommendation_impressions 에 쓰는
 * 서버 경로가 생기면 그쪽으로 옮긴다). 예전에도 회원 브라우저 메모리의 예시 노출 3건만 바꾸고 저장하지 않아 효과가 없었다.
 */
export function recordConversionByProduct(_userId: string, _productId: string): void {
  /* 기록원 미구현 — 저장하지 않음 (예전과 동일하게 영속 효과 없음). */
}

/* ─── section health ────────────────────────────────────────── */

export function getRecommendationSectionHealth(
  surface?: RecommendationSurface
): RecommendationSectionHealth[] {
  let list = [...SECTION_HEALTH];
  if (surface) list = list.filter((h) => h.surface === surface);
  return list;
}

/* ─── reports ───────────────────────────────────────────────── */

export function getRecommendationReports(filters?: {
  reportType?: ReportType;
  surface?: ReportSurface;
  /** `null` = 보관된 전체 (관리자 표가 화면에서 쪽 나눔 — R7). 생략 시 50. */
  limit?: number | null;
}): RecommendationReport[] {
  let list = [...REPORTS].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
  if (filters?.reportType) list = list.filter((r) => r.reportType === filters.reportType);
  if (filters?.surface) list = list.filter((r) => r.surface === filters.surface);
  if (filters?.limit === null) return list;
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getRecommendationReportById(id: string): RecommendationReport | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function addRecommendationReport(
  input: Omit<RecommendationReport, "id">
): RecommendationReport {
  const report: RecommendationReport = {
    ...input,
    id: `rr-${Date.now()}`,
  };
  REPORTS.unshift(report);
  return { ...report };
}

/* ─── report KPIs ───────────────────────────────────────────── */

export function getRecommendationReportKpis(
  reportId: string
): RecommendationReportKpis | undefined {
  return REPORT_KPIS.find((k) => k.reportId === reportId);
}

export function setRecommendationReportKpis(kpis: RecommendationReportKpis): void {
  const i = REPORT_KPIS.findIndex((k) => k.reportId === kpis.reportId);
  if (i !== -1) REPORT_KPIS[i] = kpis;
  else REPORT_KPIS.push(kpis);
}

/* ─── report sections ───────────────────────────────────────── */

function makeSection(
  reportId: string,
  surface: RecommendationSurface,
  sectionKey: string,
  impressionCount: number,
  clickCount: number,
  conversionCount: number,
  avgScore: number,
  status: SectionHealthStatus
): RecommendationReportSection {
  return {
    id: `rrs-${reportId}-${surface}-${sectionKey}`,
    reportId,
    surface,
    sectionKey,
    impressionCount,
    clickCount,
    ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
    conversionCount,
    conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
    avgScore,
    status,
  };
}

export function getRecommendationReportSections(
  reportId: string
): RecommendationReportSection[] {
  const list = REPORT_SECTIONS.filter((s) => s.reportId === reportId);
  if (list.length > 0) return list;
  const surfaces: RecommendationSurface[] = ["home", "search", "shop"];
  const sectionKeys = ["recommended", "local_latest", "bumped", "sponsored"];
  const out: RecommendationReportSection[] = [];
  for (const surface of surfaces) {
    for (const sectionKey of sectionKeys) {
      out.push(
        makeSection(
          reportId,
          surface,
          sectionKey,
          10000 + Math.floor(Math.random() * 20000),
          400 + Math.floor(Math.random() * 800),
          80 + Math.floor(Math.random() * 120),
          0.65 + Math.random() * 0.2,
          "healthy"
        )
      );
    }
  }
  out.forEach((s) => REPORT_SECTIONS.push(s));
  return out;
}

export function setRecommendationReportSections(
  reportId: string,
  sections: Omit<RecommendationReportSection, "id" | "reportId">[]
): void {
  const toRemove = REPORT_SECTIONS.filter((s) => s.reportId === reportId);
  toRemove.forEach((s) => {
    const i = REPORT_SECTIONS.indexOf(s);
    if (i !== -1) REPORT_SECTIONS.splice(i, 1);
  });
  sections.forEach((s) => {
    REPORT_SECTIONS.push({
      ...s,
      id: `rrs-${reportId}-${s.surface}-${s.sectionKey}`,
      reportId,
    });
  });
}

/* ─── report versions ─────────────────────────────────────────── */

export function getRecommendationReportVersions(
  reportId: string
): RecommendationReportVersion[] {
  const list = REPORT_VERSIONS.filter((v) => v.reportId === reportId);
  if (list.length > 0) return list;
  const surfaces: RecommendationSurface[] = ["home", "search", "shop"];
  const out: RecommendationReportVersion[] = [];
  surfaces.forEach((surface, i) => {
    out.push({
      id: `rrv-${reportId}-${surface}-control`,
      reportId,
      versionId: "fv-control-home",
      surface,
      impressionCount: 40000 + i * 5000,
      clickCount: 1600 + i * 200,
      ctr: 0.04,
      conversionCount: 320 + i * 40,
      conversionRate: 0.008,
      deploymentStatus: "success",
      isLiveVersion: true,
    });
    out.push({
      id: `rrv-${reportId}-${surface}-variant`,
      reportId,
      versionId: "fv-variant-a-home",
      surface,
      impressionCount: 12000 + i * 2000,
      clickCount: 520 + i * 80,
      ctr: 0.043,
      conversionCount: 96 + i * 12,
      conversionRate: 0.008,
      deploymentStatus: "success",
      isLiveVersion: false,
    });
  });
  out.forEach((v) => REPORT_VERSIONS.push(v));
  return out;
}

export function setRecommendationReportVersions(
  reportId: string,
  versions: Omit<RecommendationReportVersion, "id" | "reportId">[]
): void {
  const toRemove = REPORT_VERSIONS.filter((v) => v.reportId === reportId);
  toRemove.forEach((v) => {
    const i = REPORT_VERSIONS.indexOf(v);
    if (i !== -1) REPORT_VERSIONS.splice(i, 1);
  });
  versions.forEach((v, idx) => {
    REPORT_VERSIONS.push({
      ...v,
      id: `rrv-${reportId}-${idx}`,
      reportId,
    });
  });
}

/* ─── region analytics ──────────────────────────────────────── */

const DEFAULT_REGIONS: { region: string; city: string; barangay: string | null }[] = [
  { region: "서울", city: "강남구", barangay: null },
  { region: "서울", city: "서초구", barangay: null },
  { region: "경기", city: "성남시", barangay: null },
  { region: "인천", city: "남동구", barangay: null },
];

export function getRecommendationRegionAnalytics(
  reportId: string
): RecommendationRegionAnalytics[] {
  const list = REGION_ANALYTICS.filter((r) => r.reportId === reportId);
  if (list.length > 0) return list;
  const out: RecommendationRegionAnalytics[] = DEFAULT_REGIONS.map((r, i) => {
    const impressionCount = 10000 + i * 5000;
    const clickCount = Math.floor(impressionCount * 0.038);
    const conversionCount = Math.floor(clickCount * 0.1);
    const row: RecommendationRegionAnalytics = {
      id: `rrg-${reportId}-${i}`,
      reportId,
      region: r.region,
      city: r.city,
      barangay: r.barangay,
      impressionCount,
      clickCount,
      ctr: 0.038,
      conversionCount,
      conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
    };
    REGION_ANALYTICS.push(row);
    return row;
  });
  return out;
}

/* ─── reason analytics ──────────────────────────────────────── */

const DEFAULT_REASON_LABELS = [
  "추천",
  "광고",
  "끌올",
  "우리동네 최신",
  "특별회원/상점",
  "최근 본 기반",
  "카테고리 기반",
  "관심 기반",
];

export function getRecommendationReasonAnalytics(
  reportId: string,
  limit = 20
): RecommendationReasonAnalytics[] {
  const list = REASON_ANALYTICS.filter((r) => r.reportId === reportId);
  if (list.length > 0) return list.slice(0, limit);
  const out: RecommendationReasonAnalytics[] = DEFAULT_REASON_LABELS.map(
    (reasonLabel, i) => {
      const impressionCount = 5000 + (DEFAULT_REASON_LABELS.length - i) * 2000;
      const clickCount = Math.floor(impressionCount * (0.03 + Math.random() * 0.02));
      const conversionCount = Math.floor(clickCount * 0.15);
      const row: RecommendationReasonAnalytics = {
        id: `rra-${reportId}-${i}`,
        reportId,
        reasonLabel,
        impressionCount,
        clickCount,
        ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
        conversionCount,
        rank: i + 1,
      };
      REASON_ANALYTICS.push(row);
      return row;
    }
  );
  return out.slice(0, limit);
}

/* ─── category analytics ────────────────────────────────────── */

const DEFAULT_CATEGORIES = ["디지털기기", "가구", "의류", "생활용품", "기타"];

export function getRecommendationCategoryAnalytics(
  reportId: string
): RecommendationCategoryAnalytics[] {
  const list = CATEGORY_ANALYTICS.filter((c) => c.reportId === reportId);
  if (list.length > 0) return list;
  const out: RecommendationCategoryAnalytics[] = DEFAULT_CATEGORIES.map(
    (category, i) => {
      const impressionCount = 8000 + i * 3000;
      const clickCount = Math.floor(impressionCount * 0.04);
      const conversionCount = Math.floor(clickCount * 0.12);
      const row: RecommendationCategoryAnalytics = {
        id: `rca-${reportId}-${i}`,
        reportId,
        category,
        impressionCount,
        clickCount,
        ctr: 0.04,
        conversionCount,
        conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
      };
      CATEGORY_ANALYTICS.push(row);
      return row;
    }
  );
  return out;
}

/* ─── briefing board ────────────────────────────────────────── */

export function getRecommendationBriefingBoard(
  reportId: string
): RecommendationBriefingBoard | undefined {
  const existing = BRIEFING_BOARDS.find((b) => b.reportId === reportId);
  if (existing) return existing;
  const board: RecommendationBriefingBoard = {
    id: `rbb-${reportId}`,
    reportId,
    topHighlights: ["홈 추천 섹션 CTR 전일 대비 +2%p", "전환율 0.78% 유지"],
    topRisks: ["검색 surface 빈피드율 3% 주의"],
    topWinningSections: ["recommended", "local_latest"],
    topDroppedSections: ["sponsored"],
    deploymentSummary: "홈 fv-control-home 운영 중. 최근 배포 1건 성공.",
    rollbackSummary: "최근 롤백 없음.",
    automationSummary: "오늘 자동 Fallback 0건, 킬스위치 0건, 롤백 0건.",
    createdAt: isoNow(),
  };
  BRIEFING_BOARDS.push(board);
  return board;
}

export function setRecommendationBriefingBoard(board: RecommendationBriefingBoard): void {
  const i = BRIEFING_BOARDS.findIndex((b) => b.reportId === board.reportId);
  if (i !== -1) BRIEFING_BOARDS[i] = board;
  else BRIEFING_BOARDS.push(board);
}
