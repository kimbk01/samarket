/**
 * 47단계: 프로덕션 전환 요약 (critical blocked → no_go)
 */

import { getProductionMigrationTables } from "./mock-production-migration-tables";
import { getProductionRlsChecks } from "./mock-production-rls-checks";
import { getProductionInfraChecks } from "./mock-production-infra-checks";
import { getProductionLaunchChecks } from "./mock-production-launch-checks";
import type {
  ProductionMigrationSummary,
  ProductionGoLiveRecommendation,
} from "@/lib/types/production-migration";

export function getProductionMigrationSummary(): ProductionMigrationSummary {
  const tables = getProductionMigrationTables();
  const productionReadyTables = tables.filter(
    (t) => t.status === "production_ready"
  ).length;

  const rlsChecks = getProductionRlsChecks();
  const verifiedRlsChecks = rlsChecks.filter(
    (c) => c.status === "verified"
  ).length;

  const infraChecks = getProductionInfraChecks();
  const readyInfraChecks = infraChecks.filter(
    (c) => c.status === "ready" || c.status === "verified"
  ).length;

  const launchChecks = getProductionLaunchChecks();
  const doneLaunchChecks = launchChecks.filter((c) => c.status === "done").length;
  const blockedChecks = launchChecks.filter((c) => c.status === "blocked").length;
  const hasCriticalBlocked = launchChecks.some(
    (c) => c.status === "blocked" && c.priority === "critical"
  );

  let goLiveRecommendation: ProductionGoLiveRecommendation = "no_go";
  if (hasCriticalBlocked) goLiveRecommendation = "no_go";
  else if (blockedChecks > 0) goLiveRecommendation = "conditional_go";
  else if (
    productionReadyTables === tables.length &&
    verifiedRlsChecks === rlsChecks.length &&
    doneLaunchChecks === launchChecks.length
  )
    goLiveRecommendation = "go";
  else goLiveRecommendation = "conditional_go";

  const allUpdated = [
    ...tables.map((t) => t.updatedAt),
    ...rlsChecks.map((c) => c.updatedAt),
    ...infraChecks.map((c) => c.updatedAt),
    ...launchChecks.map((c) => c.updatedAt),
  ];
  const latestUpdatedAt =
    allUpdated.length > 0
      ? allUpdated.reduce((max, d) => (d > max ? d : max), allUpdated[0])
      : null;

  return {
    totalTables: tables.length,
    productionReadyTables,
    totalRlsChecks: rlsChecks.length,
    verifiedRlsChecks,
    totalInfraChecks: infraChecks.length,
    readyInfraChecks,
    totalLaunchChecks: launchChecks.length,
    doneLaunchChecks,
    blockedChecks,
    goLiveRecommendation,
    latestUpdatedAt,
  };
}
