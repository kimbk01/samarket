/**
 * 56단계: 보안 점검 mock
 */

import type {
  SecurityCheck,
  SecurityCheckType,
  SecurityStatus,
} from "@/lib/types/security";

const now = new Date().toISOString();

const CHECKS: SecurityCheck[] = [
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
