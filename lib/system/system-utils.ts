/**
 * 60단계: 시스템 상태 라벨 유틸
 */

import type { SystemHealthStatus } from "@/lib/types/system";

const STATUS_LABELS: Record<SystemHealthStatus, string> = {
  healthy: "정상",
  warning: "주의",
  critical: "위험",
};

export function getSystemHealthStatusLabel(v: SystemHealthStatus): string {
  return STATUS_LABELS[v] ?? v;
}
