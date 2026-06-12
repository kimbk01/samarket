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

const TABLES: ProductionMigrationTable[] = [];
const RLS_CHECKS: ProductionRlsCheck[] = [];
const INFRA_CHECKS: ProductionInfraCheck[] = [];
const LAUNCH_CHECKS: ProductionLaunchCheck[] = [];

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
    tables: [],
    rlsChecks: [],
    infraChecks: [],
    launchChecks: [],
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
