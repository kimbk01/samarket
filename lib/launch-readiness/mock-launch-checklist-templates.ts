/**
 * 46단계: 런칭 체크리스트 템플릿 mock
 */

import type {
  LaunchChecklistTemplate,
  LaunchReadinessArea,
} from "@/lib/types/launch-readiness";

const AREAS: LaunchReadinessArea[] = [
  "user_app",
  "admin_console",
  "recommendation",
  "moderation",
  "points_payment",
  "ads_business",
  "docs_sop",
  "monitoring_automation",
  "security",
  "deployment",
];

const now = new Date().toISOString();

const TEMPLATES: LaunchChecklistTemplate[] = [
  {
    id: "lct-1",
    area: "user_app",
    title: "회원가입/로그인 E2E 검증",
    description: "소셜·이메일 로그인 및 회원가입 플로우 검증 완료",
    gateType: "must_have",
    defaultPriority: "critical",
    sortOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-2",
    area: "user_app",
    title: "상품 등록/수정/삭제 검증",
    description: "상품 CRUD 및 이미지 업로드 동작 검증",
    gateType: "must_have",
    defaultPriority: "high",
    sortOrder: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-3",
    area: "admin_console",
    title: "관리자 로그인 및 권한 검증",
    description: "역할별 메뉴·기능 접근 제어 검증",
    gateType: "must_have",
    defaultPriority: "critical",
    sortOrder: 3,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-4",
    area: "recommendation",
    title: "홈 피드·추천 API 정상 응답",
    description: "피드 엔진·fallback 동작 검증",
    gateType: "must_have",
    defaultPriority: "high",
    sortOrder: 4,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-5",
    area: "moderation",
    title: "신고 접수·제재 플로우 검증",
    description: "신고 처리 및 제재 적용 플로우",
    gateType: "must_have",
    defaultPriority: "high",
    sortOrder: 5,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-6",
    area: "points_payment",
    title: "포인트 충전·사용 검증",
    description: "충전·차감·만료 플로우 검증",
    gateType: "must_have",
    defaultPriority: "high",
    sortOrder: 6,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-7",
    area: "ads_business",
    title: "광고 신청·노출 검증",
    description: "광고 결제 및 유료 노출 검증",
    gateType: "should_have",
    defaultPriority: "medium",
    sortOrder: 7,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-8",
    area: "docs_sop",
    title: "운영 SOP·플레이북 최신화",
    description: "주요 장애 대응 문서 검토 완료",
    gateType: "must_have",
    defaultPriority: "high",
    sortOrder: 8,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-9",
    area: "monitoring_automation",
    title: "모니터링·알림 연동 검증",
    description: "헬스체크·알림 채널 동작 검증",
    gateType: "must_have",
    defaultPriority: "critical",
    sortOrder: 9,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-10",
    area: "security",
    title: "보안 점검 placeholder",
    description: "인증·권한·노출 데이터 점검",
    gateType: "must_have",
    defaultPriority: "critical",
    sortOrder: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-11",
    area: "deployment",
    title: "배포/릴리즈 절차 placeholder",
    description: "배포 파이프라인·롤백 절차 검증",
    gateType: "must_have",
    defaultPriority: "critical",
    sortOrder: 11,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "lct-12",
    area: "user_app",
    title: "채팅·알림 동작 검증",
    description: "실시간 채팅 및 푸시 알림",
    gateType: "should_have",
    defaultPriority: "medium",
    sortOrder: 12,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

export function getLaunchChecklistTemplates(filters?: {
  area?: LaunchReadinessArea;
  isActive?: boolean;
}): LaunchChecklistTemplate[] {
  let list = [...TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.area) list = list.filter((t) => t.area === filters.area);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getLaunchChecklistTemplateById(
  id: string
): LaunchChecklistTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getLaunchReadinessAreas(): LaunchReadinessArea[] {
  return [...AREAS];
}
