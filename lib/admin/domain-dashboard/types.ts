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
  primaryEntries: AdminDomainEntry[];
  contextEntries: AdminDomainEntry[];
  recent: AdminDomainRecentItem[];
  /** Partial load failures — surface, do not collapse whole board */
  sectionErrors: string[];
};
