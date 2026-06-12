/**
 * 런칭 readiness — 템플릿·항목·승인·blocker 로그 단일 저장소.
 * 영속화: `launch-readiness-db` + `/api/admin/launch-readiness`
 */
import type {
  LaunchChecklistTemplate,
  LaunchReadinessItem,
  LaunchApproval,
  LaunchBlockerLog,
  LaunchReadinessArea,
  LaunchReadinessPhase,
  LaunchReadinessStatus,
} from "@/lib/types/launch-readiness";

function isoNow() {
  return new Date().toISOString();
}

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

function defaultChecklistTemplates(): LaunchChecklistTemplate[] {
  const now = isoNow();
  return [
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
}

function defaultReadinessItems(): LaunchReadinessItem[] {
  const now = isoNow();
  return [
    {
      id: "lri-1",
      templateId: "lct-1",
      phase: "pre_launch",
      area: "user_app",
      title: "회원가입/로그인 E2E 검증",
      gateType: "must_have",
      status: "ready",
      priority: "critical",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      dueDate: now.slice(0, 10),
      blockerReason: null,
      note: "",
      linkedType: null,
      linkedId: null,
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lri-2",
      templateId: "lct-2",
      phase: "pre_launch",
      area: "user_app",
      title: "상품 등록/수정/삭제 검증",
      gateType: "must_have",
      status: "ready",
      priority: "high",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: null,
      linkedId: null,
      checkedAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now,
    },
    {
      id: "lri-3",
      templateId: "lct-3",
      phase: "pre_launch",
      area: "admin_console",
      title: "관리자 로그인 및 권한 검증",
      gateType: "must_have",
      status: "in_progress",
      priority: "critical",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      blockerReason: null,
      note: "역할 2종 추가 검증 중",
      linkedType: null,
      linkedId: null,
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lri-4",
      templateId: "lct-4",
      phase: "pre_launch",
      area: "recommendation",
      title: "홈 피드·추천 API 정상 응답",
      gateType: "must_have",
      status: "ready",
      priority: "high",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: "deployment",
      linkedId: "rd-1",
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lri-5",
      templateId: "lct-5",
      phase: "pre_launch",
      area: "moderation",
      title: "신고 접수·제재 플로우 검증",
      gateType: "must_have",
      status: "ready",
      priority: "high",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: null,
      linkedId: null,
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lri-6",
      templateId: "lct-6",
      phase: "pre_launch",
      area: "points_payment",
      title: "포인트 충전·사용 검증",
      gateType: "must_have",
      status: "blocked",
      priority: "high",
      ownerAdminId: "admin2",
      ownerAdminNickname: "운영B",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      blockerReason: "결제 PG 샌드박스 이슈 대기 중",
      note: "",
      linkedType: "action_item",
      linkedId: "oai-1",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lri-7",
      templateId: "lct-8",
      phase: "pre_launch",
      area: "docs_sop",
      title: "운영 SOP·플레이북 최신화",
      gateType: "must_have",
      status: "in_progress",
      priority: "high",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: "document",
      linkedId: "od-1",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lri-8",
      templateId: "lct-9",
      phase: "pre_launch",
      area: "monitoring_automation",
      title: "모니터링·알림 연동 검증",
      gateType: "must_have",
      status: "ready",
      priority: "critical",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: null,
      linkedId: null,
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lri-9",
      templateId: "lct-10",
      phase: "pre_launch",
      area: "security",
      title: "보안 점검 placeholder",
      gateType: "must_have",
      status: "not_ready",
      priority: "critical",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      blockerReason: null,
      note: "점검 예정",
      linkedType: null,
      linkedId: null,
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lri-10",
      templateId: "lct-11",
      phase: "pre_launch",
      area: "deployment",
      title: "배포/릴리즈 절차 placeholder",
      gateType: "must_have",
      status: "in_progress",
      priority: "critical",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: "deployment",
      linkedId: "rd-2",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lri-11",
      templateId: "lct-7",
      phase: "pre_launch",
      area: "ads_business",
      title: "광고 신청·노출 검증",
      gateType: "should_have",
      status: "ready",
      priority: "medium",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: null,
      blockerReason: null,
      note: "",
      linkedType: null,
      linkedId: null,
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lri-12",
      templateId: "lct-12",
      phase: "launch_day",
      area: "user_app",
      title: "채팅·알림 동작 검증",
      gateType: "should_have",
      status: "not_ready",
      priority: "medium",
      ownerAdminId: null,
      ownerAdminNickname: null,
      dueDate: null,
      blockerReason: null,
      note: "런칭 당일 체크",
      linkedType: null,
      linkedId: null,
      checkedAt: null,
      updatedAt: now,
    },
  ];
}

function defaultApprovals(): LaunchApproval[] {
  const now = isoNow();
  return [
    {
      id: "la-1",
      phase: "pre_launch",
      approverRole: "product_owner",
      approverAdminId: "admin1",
      approverAdminNickname: "관리자",
      decision: "conditional",
      note: "must_have 전부 완료 후 최종 승인 예정",
      createdAt: now,
    },
    {
      id: "la-2",
      phase: "pre_launch",
      approverRole: "ops_owner",
      approverAdminId: null,
      approverAdminNickname: null,
      decision: "conditional",
      note: "승인자 placeholder",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "la-3",
      phase: "pre_launch",
      approverRole: "tech_owner",
      approverAdminId: null,
      approverAdminNickname: null,
      decision: "approved",
      note: "",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "la-4",
      phase: "launch_day",
      approverRole: "admin",
      approverAdminId: null,
      approverAdminNickname: null,
      decision: "conditional",
      note: "런칭 당일 체크리스트 완료 후 승인",
      createdAt: now,
    },
  ];
}

function defaultBlockerLogs(): LaunchBlockerLog[] {
  return [
    {
      id: "lbl-1",
      readinessItemId: "lri-6",
      actionType: "create_blocker",
      actorType: "admin",
      actorId: "admin2",
      actorNickname: "운영B",
      note: "결제 PG 샌드박스 이슈 대기 중",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "lbl-2",
      readinessItemId: "lri-6",
      actionType: "update_blocker",
      actorType: "admin",
      actorId: "admin2",
      actorNickname: "운영B",
      note: "PG사 응답 대기로 사유 보강",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

const CHECKLIST_TEMPLATES: LaunchChecklistTemplate[] = defaultChecklistTemplates();
const READINESS_ITEMS: LaunchReadinessItem[] = defaultReadinessItems();
const APPROVALS: LaunchApproval[] = defaultApprovals();
const BLOCKER_LOGS: LaunchBlockerLog[] = defaultBlockerLogs();

export type LaunchReadinessBundleV1 = {
  version: 1;
  checklistTemplates: LaunchChecklistTemplate[];
  readinessItems: LaunchReadinessItem[];
  approvals: LaunchApproval[];
  blockerLogs: LaunchBlockerLog[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultLaunchReadinessBundle(): LaunchReadinessBundleV1 {
  return {
    version: 1,
    checklistTemplates: defaultChecklistTemplates().map((t) => ({ ...t })),
    readinessItems: defaultReadinessItems().map((i) => ({ ...i })),
    approvals: defaultApprovals().map((a) => ({ ...a })),
    blockerLogs: defaultBlockerLogs().map((l) => ({ ...l })),
  };
}

export function importLaunchReadinessBundle(bundle: LaunchReadinessBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    CHECKLIST_TEMPLATES,
    (bundle.checklistTemplates ?? []).map((t) => ({ ...t }))
  );
  replaceArray(
    READINESS_ITEMS,
    (bundle.readinessItems ?? []).map((i) => ({ ...i }))
  );
  replaceArray(APPROVALS, (bundle.approvals ?? []).map((a) => ({ ...a })));
  replaceArray(BLOCKER_LOGS, (bundle.blockerLogs ?? []).map((l) => ({ ...l })));
  if (!CHECKLIST_TEMPLATES.length)
    replaceArray(CHECKLIST_TEMPLATES, defaultChecklistTemplates());
  if (!READINESS_ITEMS.length)
    replaceArray(READINESS_ITEMS, defaultReadinessItems());
}

export function exportLaunchReadinessBundle(): LaunchReadinessBundleV1 {
  return {
    version: 1,
    checklistTemplates: CHECKLIST_TEMPLATES.map((t) => ({ ...t })),
    readinessItems: READINESS_ITEMS.map((i) => ({ ...i })),
    approvals: APPROVALS.map((a) => ({ ...a })),
    blockerLogs: BLOCKER_LOGS.map((l) => ({ ...l })),
  };
}

/* ─── checklist templates ───────────────────────────────────── */

export function getLaunchChecklistTemplates(filters?: {
  area?: LaunchReadinessArea;
  isActive?: boolean;
}): LaunchChecklistTemplate[] {
  let list = [...CHECKLIST_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.area) list = list.filter((t) => t.area === filters.area);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getLaunchChecklistTemplateById(
  id: string
): LaunchChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.id === id);
}

export function getLaunchReadinessAreas(): LaunchReadinessArea[] {
  return [...AREAS];
}

/* ─── readiness items ───────────────────────────────────────── */

export function getLaunchReadinessItems(filters?: {
  phase?: LaunchReadinessPhase;
  area?: LaunchReadinessArea;
  status?: LaunchReadinessStatus;
}): LaunchReadinessItem[] {
  let list = [...READINESS_ITEMS];
  if (filters?.phase) list = list.filter((i) => i.phase === filters.phase);
  if (filters?.area) list = list.filter((i) => i.area === filters.area);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  return list.sort(
    (a, b) =>
      ["critical", "high", "medium", "low"].indexOf(a.priority) -
      ["critical", "high", "medium", "low"].indexOf(b.priority)
  );
}

export function getLaunchReadinessItemById(
  id: string
): LaunchReadinessItem | undefined {
  return READINESS_ITEMS.find((i) => i.id === id);
}

export function getBlockedReadinessItems(): LaunchReadinessItem[] {
  return READINESS_ITEMS.filter((i) => i.status === "blocked" && i.blockerReason);
}

/* ─── approvals ─────────────────────────────────────────────── */

export function getLaunchApprovals(filters?: {
  phase?: LaunchReadinessPhase;
}): LaunchApproval[] {
  let list = [...APPROVALS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.phase) list = list.filter((a) => a.phase === filters.phase);
  return list;
}

export function getLaunchApprovalById(id: string): LaunchApproval | undefined {
  return APPROVALS.find((a) => a.id === id);
}

/* ─── blocker logs ──────────────────────────────────────────── */

export function getLaunchBlockerLogs(filters?: {
  readinessItemId?: string;
}): LaunchBlockerLog[] {
  let list = [...BLOCKER_LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.readinessItemId)
    list = list.filter((l) => l.readinessItemId === filters.readinessItemId);
  return list;
}
