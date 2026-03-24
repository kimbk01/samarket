/**
 * 47단계: 프로덕션 전환 준비 / Supabase 스키마·RLS·최종 배포 체크리스트 타입
 */

export type ProductionMigrationDomain =
  | "auth"
  | "user"
  | "product"
  | "chat"
  | "report"
  | "point"
  | "ad"
  | "ops"
  | "recommendation";

export type ProductionTableStatus =
  | "mock_only"
  | "schema_ready"
  | "query_ready"
  | "rls_ready"
  | "production_ready";

export interface ProductionMigrationTable {
  id: string;
  domain: ProductionMigrationDomain;
  tableName: string;
  status: ProductionTableStatus;
  hasRls: boolean;
  hasIndexes: boolean;
  hasTriggers: boolean;
  hasViews: boolean;
  hasRpc: boolean;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  blockerReason: string | null;
  note: string;
  updatedAt: string;
}

export type ProductionRlsPolicyType = "select" | "insert" | "update" | "delete";

export type ProductionRlsRoleScope =
  | "anon"
  | "authenticated"
  | "admin"
  | "service_role";

export type ProductionRlsCheckStatus = "missing" | "draft" | "ready" | "verified";

export interface ProductionRlsCheck {
  id: string;
  tableName: string;
  policyName: string;
  policyType: ProductionRlsPolicyType;
  roleScope: ProductionRlsRoleScope;
  status: ProductionRlsCheckStatus;
  note: string;
  updatedAt: string;
}

export type ProductionInfraCategory =
  | "storage_bucket"
  | "env_secret"
  | "webhook"
  | "cron"
  | "edge_function"
  | "rpc"
  | "trigger";

export type ProductionInfraCheckStatus =
  | "missing"
  | "pending"
  | "ready"
  | "verified";

export interface ProductionInfraCheck {
  id: string;
  category: ProductionInfraCategory;
  targetName: string;
  status: ProductionInfraCheckStatus;
  blockerReason: string | null;
  note: string;
  updatedAt: string;
}

export type ProductionLaunchPhase =
  | "before_cutover"
  | "cutover"
  | "after_cutover";

export type ProductionLaunchArea =
  | "db"
  | "auth"
  | "storage"
  | "app"
  | "admin"
  | "monitoring"
  | "backup"
  | "rollback";

export type ProductionLaunchCheckStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "blocked";

export type ProductionLaunchLinkedType =
  | "table"
  | "rls"
  | "infra"
  | "deployment"
  | "action_item"
  | null;

export type ProductionLaunchPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface ProductionLaunchCheck {
  id: string;
  phase: ProductionLaunchPhase;
  title: string;
  area: ProductionLaunchArea;
  priority: ProductionLaunchPriority;
  status: ProductionLaunchCheckStatus;
  linkedType: ProductionLaunchLinkedType;
  linkedId: string | null;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  blockerReason: string | null;
  note: string;
  checkedAt: string | null;
  updatedAt: string;
}

export type ProductionGoLiveRecommendation =
  | "go"
  | "conditional_go"
  | "no_go";

export interface ProductionMigrationSummary {
  totalTables: number;
  productionReadyTables: number;
  totalRlsChecks: number;
  verifiedRlsChecks: number;
  totalInfraChecks: number;
  readyInfraChecks: number;
  totalLaunchChecks: number;
  doneLaunchChecks: number;
  blockedChecks: number;
  goLiveRecommendation: ProductionGoLiveRecommendation;
  latestUpdatedAt: string | null;
}
