/**
 * ARO-OPS-UX-002-B2 — Domain Dashboard Control Plane shared contract.
 * Read-only composition only. No new aggregate DB / mutation owner.
 */

export type AdminDomainId = "delivery" | "trade" | "community" | "messenger";

export type AdminDomainMetric = {
  id: string;
  labelKo: string;
  labelEn: string;
  /** null = source unavailable (must not fake as 0) */
  value: number | null;
  href?: string;
  source: string;
};

export type AdminDomainActionItem = {
  id: string;
  labelKo: string;
  labelEn: string;
  count: number | null;
  /** 빈 값 = 같은 조건을 읽는 목록이 아직 없음 → 링크 없이 숫자 + 「목록 준비 중」 */
  href: string;
  source: string;
  owner: string;
  filter?: string;
};

export type AdminDomainEntry = {
  id: string;
  labelKo: string;
  labelEn: string;
  href: string;
  /** W1 frequency class hint for section grouping */
  frequency: "DAILY_CRITICAL" | "FREQUENT" | "OCCASIONAL" | "CONFIGURATION" | "ARCHIVE";
};

export type AdminDomainRecentItem = {
  id: string;
  title: string;
  metaKo?: string;
  metaEn?: string;
  href?: string;
  at?: string | null;
};

export type AdminDomainDashboardModel = {
  domain: AdminDomainId;
  titleKo: string;
  titleEn: string;
  descriptionKo: string;
  descriptionEn: string;
  currentState: AdminDomainMetric[];
  actionRequired: AdminDomainActionItem[];
  /** Order / secondary state strip (optional) */
  domainHealth: AdminDomainMetric[];
  issues: AdminDomainActionItem[];
  /** 「지금 처리할 일」 카드 CTA 문구 (기본 「검토하기」) */
  actionCta?: { ko: string; en: string };
  /** 「문제」 섹션 카드 CTA 문구 (기본 「신고 검토」) */
  issuesCta?: { ko: string; en: string };
  primaryEntries: AdminDomainEntry[];
  contextEntries: AdminDomainEntry[];
  recent: AdminDomainRecentItem[];
  /** Partial load failures — surface, do not collapse whole board */
  sectionErrors: string[];
  /** 집계 시각 (UTC ISO) — 화면은 PHT 로 표시 */
  lastUpdatedAt?: string | null;
  /** 기간 통계 기준 (마닐라 날짜, 포함) — 「기간 통계」 구역이 있는 대시보드만 */
  periodRange?: { period: string; from: string | null; to: string | null; timezone: "Asia/Manila" } | null;
  /** 기간 통계 지표 (선택 기간) */
  periodStats?: AdminDomainMetric[];
  /** 최근 신고 (최근 처리 아래 영역) */
  recentReports?: AdminDomainRecentItem[];
  /**
   * 지표 레지스트리 원값 (id·구역·라벨 키·권한 숨김) — 재설계 화면이 직접 읽는다.
   * value null = 확인 불가.
   */
  metricValues?: {
    id: string;
    section: string;
    labelKey: string;
    labelKo: string;
    labelEn: string;
    value: number | null;
    href: string;
    forbidden: boolean;
    showWhenZero: boolean;
  }[];
};
