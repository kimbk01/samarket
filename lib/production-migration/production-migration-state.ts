/**
 * 프로덕션 전환 — 테이블·RLS·인프라·런치 체크리스트 단일 저장소.
 * 영속화: `production-migration-db` + `/api/admin/production-migration`
 */
import type {
  ProductionMigrationTable,
  ProductionMigrationDomain,
  ProductionTableStatus,
  ProductionRlsCheck,
  ProductionRlsCheckStatus,
  ProductionInfraCheck,
  ProductionInfraCategory,
  ProductionInfraCheckStatus,
  ProductionLaunchCheck,
  ProductionLaunchPhase,
  ProductionLaunchCheckStatus,
} from "@/lib/types/production-migration";

function isoNow() {
  return new Date().toISOString();
}

function defaultMigrationTables(): ProductionMigrationTable[] {
  const now = isoNow();
  return [
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
}

function defaultRlsChecks(): ProductionRlsCheck[] {
  const now = isoNow();
  return [
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
}

function defaultInfraChecks(): ProductionInfraCheck[] {
  const now = isoNow();
  return [
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
}

function defaultLaunchChecks(): ProductionLaunchCheck[] {
  const now = isoNow();
  return [
    {
      id: "plc-1",
      phase: "before_cutover",
      title: "핵심 테이블 production_ready 확인",
      area: "db",
      priority: "critical",
      status: "in_progress",
      linkedType: "table",
      linkedId: "pmt-2",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-2",
      phase: "before_cutover",
      title: "RLS 정책 검증 완료",
      area: "db",
      priority: "critical",
      status: "todo",
      linkedType: "rls",
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-3",
      phase: "before_cutover",
      title: "스토리지 bucket 정책 점검",
      area: "storage",
      priority: "high",
      status: "done",
      linkedType: "infra",
      linkedId: "pic-1",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "plc-4",
      phase: "before_cutover",
      title: "env/secret 배포 환경 반영",
      area: "app",
      priority: "critical",
      status: "blocked",
      linkedType: "infra",
      linkedId: "pic-5",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: "webhook 미설정",
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-5",
      phase: "cutover",
      title: "DB 마이그레이션 실행 placeholder",
      area: "db",
      priority: "critical",
      status: "todo",
      linkedType: null,
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "SQL 적용 체크리스트 placeholder",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-6",
      phase: "cutover",
      title: "앱 배포 및 헬스체크",
      area: "app",
      priority: "critical",
      status: "todo",
      linkedType: "deployment",
      linkedId: "rd-1",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-7",
      phase: "after_cutover",
      title: "모니터링·알림 확인",
      area: "monitoring",
      priority: "high",
      status: "todo",
      linkedType: null,
      linkedId: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "plc-8",
      phase: "after_cutover",
      title: "백업/롤백 절차 확인",
      area: "rollback",
      priority: "critical",
      status: "todo",
      linkedType: "action_item",
      linkedId: "oai-1",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
  ];
}

const TABLES: ProductionMigrationTable[] = defaultMigrationTables();
const RLS_CHECKS: ProductionRlsCheck[] = defaultRlsChecks();
const INFRA_CHECKS: ProductionInfraCheck[] = defaultInfraChecks();
const LAUNCH_CHECKS: ProductionLaunchCheck[] = defaultLaunchChecks();

export type ProductionMigrationBundleV1 = {
  version: 1;
  tables: ProductionMigrationTable[];
  rlsChecks: ProductionRlsCheck[];
  infraChecks: ProductionInfraCheck[];
  launchChecks: ProductionLaunchCheck[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultProductionMigrationBundle(): ProductionMigrationBundleV1 {
  return {
    version: 1,
    tables: defaultMigrationTables().map((t) => ({ ...t })),
    rlsChecks: defaultRlsChecks().map((c) => ({ ...c })),
    infraChecks: defaultInfraChecks().map((c) => ({ ...c })),
    launchChecks: defaultLaunchChecks().map((c) => ({ ...c })),
  };
}

export function importProductionMigrationBundle(
  bundle: ProductionMigrationBundleV1
): void {
  if (bundle.version !== 1) return;
  replaceArray(TABLES, (bundle.tables ?? []).map((t) => ({ ...t })));
  replaceArray(RLS_CHECKS, (bundle.rlsChecks ?? []).map((c) => ({ ...c })));
  replaceArray(INFRA_CHECKS, (bundle.infraChecks ?? []).map((c) => ({ ...c })));
  replaceArray(LAUNCH_CHECKS, (bundle.launchChecks ?? []).map((c) => ({ ...c })));
  if (!TABLES.length) replaceArray(TABLES, defaultMigrationTables());
  if (!RLS_CHECKS.length) replaceArray(RLS_CHECKS, defaultRlsChecks());
  if (!INFRA_CHECKS.length) replaceArray(INFRA_CHECKS, defaultInfraChecks());
  if (!LAUNCH_CHECKS.length) replaceArray(LAUNCH_CHECKS, defaultLaunchChecks());
}

export function exportProductionMigrationBundle(): ProductionMigrationBundleV1 {
  return {
    version: 1,
    tables: TABLES.map((t) => ({ ...t })),
    rlsChecks: RLS_CHECKS.map((c) => ({ ...c })),
    infraChecks: INFRA_CHECKS.map((c) => ({ ...c })),
    launchChecks: LAUNCH_CHECKS.map((c) => ({ ...c })),
  };
}

/* ─── migration tables ──────────────────────────────────────── */

export function getProductionMigrationTables(filters?: {
  domain?: ProductionMigrationDomain;
  status?: ProductionTableStatus;
}): ProductionMigrationTable[] {
  let list = [...TABLES];
  if (filters?.domain) list = list.filter((t) => t.domain === filters.domain);
  if (filters?.status) list = list.filter((t) => t.status === filters.status);
  return list.sort((a, b) => a.tableName.localeCompare(b.tableName));
}

export function getProductionMigrationTableById(
  id: string
): ProductionMigrationTable | undefined {
  return TABLES.find((t) => t.id === id);
}

export function getBlockedMigrationTables(): ProductionMigrationTable[] {
  return TABLES.filter((t) => t.blockerReason);
}

/* ─── RLS checks ────────────────────────────────────────────── */

export function getProductionRlsChecks(filters?: {
  tableName?: string;
  status?: ProductionRlsCheckStatus;
}): ProductionRlsCheck[] {
  let list = [...RLS_CHECKS];
  if (filters?.tableName)
    list = list.filter((c) => c.tableName === filters.tableName);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  return list.sort(
    (a, b) =>
      a.tableName.localeCompare(b.tableName) ||
      a.policyName.localeCompare(b.policyName)
  );
}

/* ─── infra checks ──────────────────────────────────────────── */

export function getProductionInfraChecks(filters?: {
  category?: ProductionInfraCategory;
  status?: ProductionInfraCheckStatus;
}): ProductionInfraCheck[] {
  let list = [...INFRA_CHECKS];
  if (filters?.category)
    list = list.filter((c) => c.category === filters.category);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  return list.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.targetName.localeCompare(b.targetName)
  );
}

/* ─── launch checks ─────────────────────────────────────────── */

export function getProductionLaunchChecks(filters?: {
  phase?: ProductionLaunchPhase;
  status?: ProductionLaunchCheckStatus;
  area?: string;
}): ProductionLaunchCheck[] {
  let list = [...LAUNCH_CHECKS];
  if (filters?.phase) list = list.filter((c) => c.phase === filters.phase);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  if (filters?.area) list = list.filter((c) => c.area === filters.area);
  return list.sort((a, b) => {
    const phaseOrder = ["before_cutover", "cutover", "after_cutover"];
    const pa = phaseOrder.indexOf(a.phase);
    const pb = phaseOrder.indexOf(b.phase);
    if (pa !== pb) return pa - pb;
    const pri = ["critical", "high", "medium", "low"];
    return pri.indexOf(b.priority) - pri.indexOf(a.priority);
  });
}

export function getBlockedLaunchChecks(): ProductionLaunchCheck[] {
  return LAUNCH_CHECKS.filter((c) => c.status === "blocked" && c.blockerReason);
}
