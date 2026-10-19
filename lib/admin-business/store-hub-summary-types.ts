/**
 * 매장 허브 요약 (§3) — 화면·서버 공용 타입 (클라이언트 안전, 서버 모듈 import 없음).
 * 로더: load-store-hub-summary.ts · API: GET /api/admin/stores/[id]/hub-summary
 */

export type StoreHubAuditEntry = {
  id: string;
  action: string;
  actorType: string;
  actorLabel: string | null;
  reason: string | null;
  createdAt: string;
};

export type StoreHubSummary = {
  owner: {
    status: string | null;
    sanctionCount: number | null;
    lastSanction: { action: string; createdAt: string } | null;
  } | null;
  ads: { active: number; pending: number } | null;
  cash: { balanceMinor: number | null; pendingCharges: number | null } | null;
  coin: { balance: number | null } | null;
  commission: {
    monthFeeDueMinor: number;
    outstandingMinor: number;
    outstandingCount: number;
    reviewRequired: number;
  } | null;
  inquiries: { open: number; total: number } | null;
  recentAudit: StoreHubAuditEntry[] | null;
};
