/**
 * 47단계: 스토리지/인프라 점검 mock (bucket, env, webhook 등)
 */

import type {
  ProductionInfraCheck,
  ProductionInfraCategory,
  ProductionInfraCheckStatus,
} from "@/lib/types/production-migration";

const now = new Date().toISOString();

const CHECKS: ProductionInfraCheck[] = [
  {
    id: "pic-1",
    category: "storage_bucket",
    targetName: "product-images",
    status: "verified",
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pic-2",
    category: "storage_bucket",
    targetName: "avatars",
    status: "pending",
    blockerReason: null,
    note: "퍼블릭 읽기 설정 예정",
    updatedAt: now,
  },
  {
    id: "pic-3",
    category: "env_secret",
    targetName: "SUPABASE_SERVICE_ROLE_KEY",
    status: "ready",
    blockerReason: null,
    note: "배포 env에만 주입",
    updatedAt: now,
  },
  {
    id: "pic-4",
    category: "env_secret",
    targetName: "NEXT_PUBLIC_SUPABASE_URL",
    status: "verified",
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pic-5",
    category: "webhook",
    targetName: "payment-webhook",
    status: "missing",
    blockerReason: "PG 연동 후 설정",
    note: "",
    updatedAt: now,
  },
  {
    id: "pic-6",
    category: "rpc",
    targetName: "deduct_point",
    status: "ready",
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pic-7",
    category: "trigger",
    targetName: "profiles_after_insert",
    status: "verified",
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
];

export function getProductionInfraChecks(filters?: {
  category?: ProductionInfraCategory;
  status?: ProductionInfraCheckStatus;
}): ProductionInfraCheck[] {
  let list = [...CHECKS];
  if (filters?.category)
    list = list.filter((c) => c.category === filters.category);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  return list.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.targetName.localeCompare(b.targetName)
  );
}
