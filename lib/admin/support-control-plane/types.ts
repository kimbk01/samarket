/**
 * ARO-OPS-UX-002-B6 — Support / Notification Control Plane read-model contract.
 * Composition only — no new support/notification SSOT.
 */

export type SupportRequesterType = "MEMBER" | "OWNER";

export type SupportActionRow = {
  id: string;
  publicCaseNo: string;
  requesterType: SupportRequesterType;
  requesterUserId: string;
  storeId: string | null;
  subject: string;
  category: string;
  issueType: string | null;
  referenceType: string | null;
  referenceId: string | null;
  status: string;
  priority: string;
  assignedAdminId: string | null;
  lastMessageAt: string;
  createdAt: string;
  ageHours: number | null;
  ageLabelKo: string;
  ageLabelEn: string;
  adminUnread: number;
  href: string;
  contextHref: string | null;
  contextLabelKo: string | null;
  contextLabelEn: string | null;
  statementHref: string | null;
  financeHref: string | null;
  adsHref: string | null;
  source: string;
};

export type SupportQueueBucket = {
  count: number | null;
  unavailable: boolean;
  href: string;
  source: string;
};

export type SupportControlPlaneModel = {
  generatedAt: string;
  actionRequired: SupportActionRow[];
  queues: {
    actionable: SupportQueueBucket;
    inProgress: SupportQueueBucket;
    overdue: SupportQueueBucket;
    member: SupportQueueBucket;
    owner: SupportQueueBucket;
    finance: SupportQueueBucket;
    ads: SupportQueueBucket;
    order: SupportQueueBucket;
    waitingUser: SupportQueueBucket;
    resolved: SupportQueueBucket;
  };
  memberInquiries: SupportActionRow[];
  ownerInquiries: SupportActionRow[];
  financeInquiries: SupportActionRow[];
  adsInquiries: SupportActionRow[];
  orderInquiries: SupportActionRow[];
  aging: SupportActionRow[];
  recent: SupportActionRow[];
  domainEntries: Array<{
    id: string;
    labelKo: string;
    labelEn: string;
    href: string;
    frequency: string;
  }>;
  sectionErrors: string[];
};
