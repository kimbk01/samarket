/**
 * 60단계: 시스템 헬스 mock
 */

import type { SystemHealth, SystemHealthStatus } from "@/lib/types/system";

const now = new Date().toISOString();

const HEALTH: SystemHealth[] = [
  { id: "sh-1", serviceName: "API", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
  { id: "sh-2", serviceName: "DB", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
  { id: "sh-3", serviceName: "Storage", status: "warning" as SystemHealthStatus, lastCheckedAt: new Date(Date.now() - 300000).toISOString() },
  { id: "sh-4", serviceName: "Auth", status: "healthy" as SystemHealthStatus, lastCheckedAt: now },
];

export function getSystemHealth(): SystemHealth[] {
  return [...HEALTH];
}
