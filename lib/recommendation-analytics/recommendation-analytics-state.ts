/**
 * 추천 분석·보고서 — 노출/클릭/전환·섹션 헬스·운영 보고서 단일 저장소.
 */
import type {
  RecommendationImpression,
  RecommendationSurface,
  RecommendationCandidateType,
} from "@/lib/types/recommendation";
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

const MAX_IMPRESSIONS = 500;

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

function defaultImpressions(): RecommendationImpression[] {
  return [
    {
      id: "ri-1",
      userId: "me",
      surface: "home",
      sectionKey: "recommended",
      candidateId: "1",
      candidateType: "product",
      impressionAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      clicked: true,
      clickedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
      converted: true,
      convertedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      reasonLabel: "추천",
      score: 12.5,
    },
    {
      id: "ri-2",
      userId: "me",
      surface: "home",
      sectionKey: "recent_view_based",
      candidateId: "3",
      candidateType: "product",
      impressionAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      clicked: true,
      clickedAt: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
      converted: false,
      convertedAt: null,
      reasonLabel: "최근 본 상품과 비슷해요",
      score: 8.2,
    },
    {
      id: "ri-3",
      userId: "me",
      surface: "home",
      sectionKey: "local_latest",
      candidateId: "2",
      candidateType: "product",
      impressionAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      clicked: false,
      clickedAt: null,
      converted: false,
      convertedAt: null,
      reasonLabel: "우리동네 최신",
      score: 5,
    },
  ];
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

function defaultReports(): RecommendationReport[] {
  return [
    {
      id: "rr-1",
      reportType: "daily",
      surface: "all",
      dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      generatedBy: "admin1",
      reportStatus: "ready",
      title: "일간 추천 성과 리포트",
      summaryNote: "전체 surface 일간 집계",
    },
    {
      id: "rr-2",
      reportType: "weekly",
      surface: "all",
      dateFrom: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      dateTo: new Date().toISOString().slice(0, 10),
      generatedAt: new Date(Date.now() - 86400000).toISOString(),
      generatedBy: "admin1",
      reportStatus: "ready",
      title: "주간 추천 성과 리포트",
      summaryNote: "전체 surface 주간 집계",
    },
  ];
}

function defaultReportKpis(): RecommendationReportKpis[] {
  return [
    {
      reportId: "rr-1",
      impressionCount: 125000,
      clickCount: 5120,
      ctr: 0.04096,
      conversionCount: 980,
      conversionRate: 0.00784,
      avgScore: 0.72,
      fallbackCount: 0,
      killSwitchCount: 0,
      rollbackCount: 0,
      incidentCount: 0,
    },
    {
      reportId: "rr-2",
      impressionCount: 890000,
      clickCount: 35600,
      ctr: 0.04,
      conversionCount: 6230,
      conversionRate: 0.007,
      avgScore: 0.71,
      fallbackCount: 1,
      killSwitchCount: 0,
      rollbackCount: 0,
      incidentCount: 2,
    },
  ];
}

const IMPRESSIONS: RecommendationImpression[] = defaultImpressions();
const SECTION_HEALTH: RecommendationSectionHealth[] = defaultSectionHealth();
const REPORTS: RecommendationReport[] = defaultReports();
const REPORT_KPIS: RecommendationReportKpis[] = defaultReportKpis();
const REPORT_SECTIONS: RecommendationReportSection[] = [];
const REPORT_VERSIONS: RecommendationReportVersion[] = [];
const REGION_ANALYTICS: RecommendationRegionAnalytics[] = [];
const REASON_ANALYTICS: RecommendationReasonAnalytics[] = [];
const CATEGORY_ANALYTICS: RecommendationCategoryAnalytics[] = [];
const BRIEFING_BOARDS: RecommendationBriefingBoard[] = [];
const SURFACE_METRICS: Record<RecommendationSurface, SurfaceMetrics> = defaultSurfaceMetrics();

export type RecommendationAnalyticsBundleV1 = {
  version: 1;
  impressions: RecommendationImpression[];
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

function trimImpressions() {
  if (IMPRESSIONS.length > MAX_IMPRESSIONS) IMPRESSIONS.length = MAX_IMPRESSIONS;
}

export function createDefaultRecommendationAnalyticsBundle(): RecommendationAnalyticsBundleV1 {
  return {
    version: 1,
    impressions: defaultImpressions().map((i) => ({ ...i })),
    sectionHealth: defaultSectionHealth().map((h) => ({ ...h })),
    reports: defaultReports().map((r) => ({ ...r })),
    reportKpis: defaultReportKpis().map((k) => ({ ...k })),
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
    IMPRESSIONS,
    (bundle.impressions ?? []).map((i) => ({ ...i })).slice(0, MAX_IMPRESSIONS)
  );
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
  if (!IMPRESSIONS.length) replaceArray(IMPRESSIONS, defaultImpressions());
  if (!SECTION_HEALTH.length) replaceArray(SECTION_HEALTH, defaultSectionHealth());
  if (!REPORTS.length) replaceArray(REPORTS, defaultReports());
  if (!REPORT_KPIS.length) replaceArray(REPORT_KPIS, defaultReportKpis());
}

export function exportRecommendationAnalyticsBundle(): RecommendationAnalyticsBundleV1 {
  return {
    version: 1,
    impressions: IMPRESSIONS.map((i) => ({ ...i })),
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

export interface RecordImpressionPayload {
  userId: string;
  surface: RecommendationSurface;
  sectionKey: string;
  candidateId: string;
  candidateType: RecommendationCandidateType;
  reasonLabel: string;
  score: number;
}

export function recordImpression(payload: RecordImpressionPayload): RecommendationImpression {
  const imp: RecommendationImpression = {
    id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId: payload.userId,
    surface: payload.surface,
    sectionKey: payload.sectionKey,
    candidateId: payload.candidateId,
    candidateType: payload.candidateType,
    impressionAt: isoNow(),
    clicked: false,
    clickedAt: null,
    converted: false,
    convertedAt: null,
    reasonLabel: payload.reasonLabel,
    score: payload.score,
  };
  IMPRESSIONS.unshift(imp);
  trimImpressions();
  return imp;
}

export function recordRecommendationClick(
  userId: string,
  sectionKey: string,
  candidateId: string
): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.sectionKey === sectionKey &&
      i.candidateId === candidateId &&
      !i.clicked
  );
  if (found) {
    found.clicked = true;
    found.clickedAt = isoNow();
  }
}

export function recordRecommendationConversion(
  userId: string,
  sectionKey: string,
  candidateId: string
): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.sectionKey === sectionKey &&
      i.candidateId === candidateId &&
      i.clicked &&
      !i.converted
  );
  if (found) {
    found.converted = true;
    found.convertedAt = isoNow();
  }
}

export function recordConversionByProduct(userId: string, productId: string): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.candidateId === productId &&
      i.clicked &&
      !i.converted
  );
  if (found) {
    found.converted = true;
    found.convertedAt = isoNow();
  }
}

export function getImpressions(userId?: string): RecommendationImpression[] {
  if (userId) return IMPRESSIONS.filter((i) => i.userId === userId);
  return [...IMPRESSIONS];
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
  limit?: number;
}): RecommendationReport[] {
  let list = [...REPORTS].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
  if (filters?.reportType) list = list.filter((r) => r.reportType === filters.reportType);
  if (filters?.surface) list = list.filter((r) => r.surface === filters.surface);
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
