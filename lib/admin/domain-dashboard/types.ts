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
};
