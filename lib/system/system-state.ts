/**
 * 시스템 운영 — 헬스·운영 상태 단일 저장소.
 * 영속화: `system-ops-db` + `/api/admin/system-ops`
 */
import type { OperationStatus, SystemHealth, SystemHealthStatus } from "@/lib/types/system";

function isoNow() {
  return new Date().toISOString();
}

function defaultSystemHealth(): SystemHealth[] {
  const now = isoNow();
  return [
    { id: "sh-1", serviceName: "API", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
    { id: "sh-2", serviceName: "DB", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
    {
      id: "sh-3",
      serviceName: "Storage",
      status: "warning" as SystemHealthStatus,
      lastCheckedAt: new Date(Date.now() - 300000).toISOString(),
    },
    { id: "sh-4", serviceName: "Auth", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
  ];
}

function defaultOperationStatus(): OperationStatus {
  return {
    id: "os-1",
    uptime: 99.95,
    activeUsers: 1250,
    errorRate: 0.02,
    lastUpdatedAt: isoNow(),
  };
}

const HEALTH: SystemHealth[] = defaultSystemHealth();
let OPERATION_STATUS: OperationStatus = defaultOperationStatus();

export type SystemOpsBundleV1 = {
  version: 1;
  systemHealth: SystemHealth[];
  operationStatus: OperationStatus;
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultSystemOpsBundle(): SystemOpsBundleV1 {
  return {
    version: 1,
    systemHealth: defaultSystemHealth().map((h) => ({ ...h })),
    operationStatus: { ...defaultOperationStatus() },
  };
}

export function importSystemOpsBundle(bundle: SystemOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(HEALTH, (bundle.systemHealth ?? []).map((h) => ({ ...h })));
  if (bundle.operationStatus) {
    OPERATION_STATUS = { ...bundle.operationStatus };
  }
  if (!HEALTH.length) replaceArray(HEALTH, defaultSystemHealth());
  if (!OPERATION_STATUS?.id) OPERATION_STATUS = defaultOperationStatus();
}

export function exportSystemOpsBundle(): SystemOpsBundleV1 {
  return {
    version: 1,
    systemHealth: HEALTH.map((h) => ({ ...h })),
    operationStatus: { ...OPERATION_STATUS },
  };
}

export function getSystemHealth(): SystemHealth[] {
  return [...HEALTH];
}

export function getOperationStatus(): OperationStatus {
  return { ...OPERATION_STATUS };
}
