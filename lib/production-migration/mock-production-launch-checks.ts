/**
 * 47단계: 최종 배포 전환 체크리스트 mock (46단계 readiness 연계)
 */

import type {
  ProductionLaunchCheck,
  ProductionLaunchPhase,
  ProductionLaunchCheckStatus,
} from "@/lib/types/production-migration";

const now = new Date().toISOString();

const CHECKS: ProductionLaunchCheck[] = [
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

export function getProductionLaunchChecks(filters?: {
  phase?: ProductionLaunchPhase;
  status?: ProductionLaunchCheckStatus;
  area?: string;
}): ProductionLaunchCheck[] {
  let list = [...CHECKS];
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
  return CHECKS.filter((c) => c.status === "blocked" && c.blockerReason);
}
