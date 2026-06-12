/**
 * 보안 운영 — 점검·이슈 단일 저장소.
 * 영속화: `security-db` + `/api/admin/security-ops`
 */
import type {
  SecurityCheck,
  SecurityCheckType,
  SecurityStatus,
  SecurityIssue,
  SecurityIssueStatus,
} from "@/lib/types/security";

function isoNow() {
  return new Date().toISOString();
}

function defaultSecurityChecks(): SecurityCheck[] {
  const now = isoNow();
  return [
    {
      id: "sc-1",
      checkType: "rls",
      target: "products",
      status: "safe",
      description: "products 테이블 RLS 정책 점검",
      lastCheckedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "sc-2",
      checkType: "rls",
      target: "users",
      status: "warning",
      description: "users 일부 컬럼 노출 검토 필요",
      lastCheckedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: "sc-3",
      checkType: "api",
      target: "/api/admin/*",
      status: "safe",
      description: "관리자 API 인증·권한 점검",
      lastCheckedAt: now,
    },
    {
      id: "sc-4",
      checkType: "auth",
      target: "jwt/session",
      status: "critical",
      description: "세션 만료 정책·리프레시 토큰 점검",
      lastCheckedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: "sc-5",
      checkType: "admin",
      target: "admin_roles",
      status: "safe",
      description: "관리자 권한 매트릭스 점검",
      lastCheckedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ];
}

function defaultSecurityIssues(): SecurityIssue[] {
  return [
    {
      id: "si-1",
      checkId: "sc-2",
      issueTitle: "users.email 노출 가능성",
      severity: "medium",
      status: "open",
      note: "일부 API에서 마스킹 필요",
    },
    {
      id: "si-2",
      checkId: "sc-4",
      issueTitle: "리프레시 토큰 TTL 과다",
      severity: "critical",
      status: "open",
      note: "90일 → 30일 권장",
    },
    {
      id: "si-3",
      checkId: "sc-1",
      issueTitle: "RLS 정책 누락 (이전)",
      severity: "high",
      status: "fixed",
      note: "배포로 해결",
    },
  ];
}

const CHECKS: SecurityCheck[] = defaultSecurityChecks();
const ISSUES: SecurityIssue[] = defaultSecurityIssues();

export type SecurityOpsBundleV1 = {
  version: 1;
  checks: SecurityCheck[];
  issues: SecurityIssue[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultSecurityOpsBundle(): SecurityOpsBundleV1 {
  return {
    version: 1,
    checks: defaultSecurityChecks().map((c) => ({ ...c })),
    issues: defaultSecurityIssues().map((i) => ({ ...i })),
  };
}

export function importSecurityOpsBundle(bundle: SecurityOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(CHECKS, (bundle.checks ?? []).map((c) => ({ ...c })));
  replaceArray(ISSUES, (bundle.issues ?? []).map((i) => ({ ...i })));
  if (!CHECKS.length) replaceArray(CHECKS, defaultSecurityChecks());
  if (!ISSUES.length) replaceArray(ISSUES, defaultSecurityIssues());
}

export function exportSecurityOpsBundle(): SecurityOpsBundleV1 {
  return {
    version: 1,
    checks: CHECKS.map((c) => ({ ...c })),
    issues: ISSUES.map((i) => ({ ...i })),
  };
}

export function getSecurityChecks(filters?: {
  checkType?: SecurityCheckType;
  status?: SecurityStatus;
}): SecurityCheck[] {
  let list = [...CHECKS];
  if (filters?.checkType)
    list = list.filter((c) => c.checkType === filters.checkType);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  return list;
}

export function getSecurityCheckById(id: string): SecurityCheck | undefined {
  return CHECKS.find((c) => c.id === id);
}

export function getSecurityIssues(filters?: {
  checkId?: string;
  status?: SecurityIssueStatus;
}): SecurityIssue[] {
  let list = [...ISSUES];
  if (filters?.checkId)
    list = list.filter((i) => i.checkId === filters.checkId);
  if (filters?.status)
    list = list.filter((i) => i.status === filters.status);
  return list;
}
