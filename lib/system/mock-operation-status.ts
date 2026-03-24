/**
 * 60단계: 운영 상태 mock
 */

import type { OperationStatus } from "@/lib/types/system";

const now = new Date().toISOString();

const STATUS: OperationStatus = {
  id: "os-1",
  uptime: 99.95,
  activeUsers: 1250,
  errorRate: 0.02,
  lastUpdatedAt: now,
};

export function getOperationStatus(): OperationStatus {
  return { ...STATUS };
}
