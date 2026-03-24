/**
 * 47단계: RLS 정책 점검 mock
 */

import type {
  ProductionRlsCheck,
  ProductionRlsCheckStatus,
} from "@/lib/types/production-migration";

const now = new Date().toISOString();

const CHECKS: ProductionRlsCheck[] = [
  {
    id: "prc-1",
    tableName: "public.profiles",
    policyName: "profiles_select_own",
    policyType: "select",
    roleScope: "authenticated",
    status: "verified",
    note: "",
    updatedAt: now,
  },
  {
    id: "prc-2",
    tableName: "public.profiles",
    policyName: "profiles_update_own",
    policyType: "update",
    roleScope: "authenticated",
    status: "verified",
    note: "",
    updatedAt: now,
  },
  {
    id: "prc-3",
    tableName: "public.products",
    policyName: "products_select_public",
    policyType: "select",
    roleScope: "anon",
    status: "missing",
    note: "미작성",
    updatedAt: now,
  },
  {
    id: "prc-4",
    tableName: "public.products",
    policyName: "products_insert_own",
    policyType: "insert",
    roleScope: "authenticated",
    status: "draft",
    note: "",
    updatedAt: now,
  },
  {
    id: "prc-5",
    tableName: "public.reports",
    policyName: "reports_insert_authenticated",
    policyType: "insert",
    roleScope: "authenticated",
    status: "ready",
    note: "",
    updatedAt: now,
  },
  {
    id: "prc-6",
    tableName: "public.reports",
    policyName: "reports_select_admin",
    policyType: "select",
    roleScope: "admin",
    status: "verified",
    note: "",
    updatedAt: now,
  },
  {
    id: "prc-7",
    tableName: "public.point_ledger",
    policyName: "point_ledger_select_own",
    policyType: "select",
    roleScope: "authenticated",
    status: "missing",
    note: "RLS 미적용",
    updatedAt: now,
  },
  {
    id: "prc-8",
    tableName: "public.ad_applications",
    policyName: "ad_applications_select_own",
    policyType: "select",
    roleScope: "authenticated",
    status: "verified",
    note: "",
    updatedAt: now,
  },
];

export function getProductionRlsChecks(filters?: {
  tableName?: string;
  status?: ProductionRlsCheckStatus;
}): ProductionRlsCheck[] {
  let list = [...CHECKS];
  if (filters?.tableName)
    list = list.filter((c) => c.tableName === filters.tableName);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  return list.sort((a, b) =>
    a.tableName.localeCompare(b.tableName) ||
    a.policyName.localeCompare(b.policyName)
  );
}
