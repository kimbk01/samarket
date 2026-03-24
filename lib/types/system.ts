/**
 * 60단계: 최종 안정화 운영 체계 타입
 */

export type SystemHealthStatus = "healthy" | "warning" | "critical";

export interface SystemHealth {
  id: string;
  serviceName: string;
  status: SystemHealthStatus;
  lastCheckedAt: string;
}

export interface OperationStatus {
  id: string;
  uptime: number;
  activeUsers: number;
  errorRate: number;
  lastUpdatedAt: string;
}
