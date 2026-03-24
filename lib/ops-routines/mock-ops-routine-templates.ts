/**
 * 50단계: 주간/월간/분기 운영 루틴 템플릿 mock
 */

import type {
  OpsRoutineTemplate,
  OpsRoutineCategory,
} from "@/lib/types/ops-routines";

const now = new Date().toISOString();

const TEMPLATES: OpsRoutineTemplate[] = [
  {
    id: "ort-1",
    title: "추천 모니터링 헬스체크",
    category: "monitoring",
    cadence: "weekly",
    defaultPriority: "high",
    defaultOwnerRole: "ops",
    slaDays: 1,
    isActive: true,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-2",
    title: "신고/제재 처리 현황 점검",
    category: "moderation",
    cadence: "weekly",
    defaultPriority: "high",
    defaultOwnerRole: "moderation",
    slaDays: 1,
    isActive: true,
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-3",
    title: "일간 운영 보고서 검토",
    category: "reporting",
    cadence: "weekly",
    defaultPriority: "medium",
    defaultOwnerRole: "ops",
    slaDays: 2,
    isActive: true,
    sortOrder: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-4",
    title: "월간 추천 성과 리포트 검토",
    category: "reporting",
    cadence: "monthly",
    defaultPriority: "high",
    defaultOwnerRole: "ops",
    slaDays: 5,
    isActive: true,
    sortOrder: 4,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-5",
    title: "포인트/충전 정책 점검",
    category: "points",
    cadence: "monthly",
    defaultPriority: "medium",
    defaultOwnerRole: "ops",
    slaDays: null,
    isActive: true,
    sortOrder: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-6",
    title: "운영 문서/SOP 최신화 확인",
    category: "docs",
    cadence: "monthly",
    defaultPriority: "medium",
    defaultOwnerRole: "ops",
    slaDays: 7,
    isActive: true,
    sortOrder: 6,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-7",
    title: "성숙도/벤치마크 점검",
    category: "reporting",
    cadence: "monthly",
    defaultPriority: "high",
    defaultOwnerRole: "ops",
    slaDays: 5,
    isActive: true,
    sortOrder: 7,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-8",
    title: "분기 운영 회의 아젠다 placeholder",
    category: "reporting",
    cadence: "quarterly",
    defaultPriority: "critical",
    defaultOwnerRole: "ops",
    slaDays: null,
    isActive: true,
    sortOrder: 8,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-9",
    title: "자동화 규칙·알림 점검",
    category: "automation",
    cadence: "monthly",
    defaultPriority: "medium",
    defaultOwnerRole: "ops",
    slaDays: null,
    isActive: true,
    sortOrder: 9,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ort-10",
    title: "보안/권한 점검 placeholder",
    category: "security",
    cadence: "quarterly",
    defaultPriority: "high",
    defaultOwnerRole: "ops",
    slaDays: null,
    isActive: true,
    sortOrder: 10,
    createdAt: now,
    updatedAt: now,
  },
];

export function getOpsRoutineTemplates(filters?: {
  category?: OpsRoutineCategory;
  cadence?: "weekly" | "monthly" | "quarterly";
  isActive?: boolean;
}): OpsRoutineTemplate[] {
  let list = [...TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.category)
    list = list.filter((t) => t.category === filters.category);
  if (filters?.cadence)
    list = list.filter((t) => t.cadence === filters.cadence);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getOpsRoutineTemplateById(
  id: string
): OpsRoutineTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
