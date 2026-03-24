/**
 * 47단계: 프로덕션 전환 대상 테이블 mock (Supabase 스키마 대응)
 */

import type {
  ProductionMigrationTable,
  ProductionMigrationDomain,
  ProductionTableStatus,
} from "@/lib/types/production-migration";

const now = new Date().toISOString();

const TABLES: ProductionMigrationTable[] = [
  {
    id: "pmt-1",
    domain: "auth",
    tableName: "auth.users",
    status: "production_ready",
    hasRls: true,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "Supabase 기본",
    updatedAt: now,
  },
  {
    id: "pmt-2",
    domain: "user",
    tableName: "public.profiles",
    status: "rls_ready",
    hasRls: true,
    hasIndexes: true,
    hasTriggers: true,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    blockerReason: null,
    note: "query 검증 대기",
    updatedAt: now,
  },
  {
    id: "pmt-3",
    domain: "product",
    tableName: "public.products",
    status: "schema_ready",
    hasRls: false,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: "RLS 정책 미작성",
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-4",
    domain: "product",
    tableName: "public.product_images",
    status: "schema_ready",
    hasRls: false,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-5",
    domain: "chat",
    tableName: "public.chat_rooms",
    status: "mock_only",
    hasRls: false,
    hasIndexes: false,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "스키마 설계 예정",
    updatedAt: now,
  },
  {
    id: "pmt-6",
    domain: "chat",
    tableName: "public.chat_messages",
    status: "mock_only",
    hasRls: false,
    hasIndexes: false,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-7",
    domain: "report",
    tableName: "public.reports",
    status: "query_ready",
    hasRls: true,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "RLS 검증 대기",
    updatedAt: now,
  },
  {
    id: "pmt-8",
    domain: "point",
    tableName: "public.point_ledger",
    status: "schema_ready",
    hasRls: false,
    hasIndexes: true,
    hasTriggers: true,
    hasViews: false,
    hasRpc: true,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: "RLS 미적용",
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-9",
    domain: "ad",
    tableName: "public.ad_applications",
    status: "rls_ready",
    hasRls: true,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-10",
    domain: "user",
    tableName: "public.business_profiles",
    status: "schema_ready",
    hasRls: false,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
  {
    id: "pmt-11",
    domain: "ops",
    tableName: "public.ops_action_items",
    status: "mock_only",
    hasRls: false,
    hasIndexes: false,
    hasTriggers: false,
    hasViews: false,
    hasRpc: false,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "운영 보드 전용 mock",
    updatedAt: now,
  },
  {
    id: "pmt-12",
    domain: "recommendation",
    tableName: "public.recommendation_events",
    status: "schema_ready",
    hasRls: false,
    hasIndexes: true,
    hasTriggers: false,
    hasViews: true,
    hasRpc: true,
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    updatedAt: now,
  },
];

export function getProductionMigrationTables(filters?: {
  domain?: ProductionMigrationDomain;
  status?: ProductionTableStatus;
}): ProductionMigrationTable[] {
  let list = [...TABLES];
  if (filters?.domain) list = list.filter((t) => t.domain === filters.domain);
  if (filters?.status) list = list.filter((t) => t.status === filters.status);
  return list.sort((a, b) =>
    a.tableName.localeCompare(b.tableName)
  );
}

export function getProductionMigrationTableById(
  id: string
): ProductionMigrationTable | undefined {
  return TABLES.find((t) => t.id === id);
}

export function getBlockedMigrationTables(): ProductionMigrationTable[] {
  return TABLES.filter((t) => t.blockerReason);
}
