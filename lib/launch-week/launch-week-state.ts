/**
 * 첫 주 관제 — 체크리스트·이슈·KPI·일일 메모 단일 저장소.
 * 영속화: `launch-week-db` + `/api/admin/launch-week`
 */
import type {
  LaunchWeekChecklistItem,
  LaunchWeekDayNumber,
  LaunchWeekChecklistStatus,
  LaunchWeekDailyNote,
  LaunchWeekIssue,
  LaunchWeekIssueStatus,
  LaunchWeekKpis,
} from "@/lib/types/launch-week";

function isoNow() {
  return new Date().toISOString();
}

function defaultChecklistItems(): LaunchWeekChecklistItem[] {
  const now = isoNow();
  return [
    {
      id: "lwci-1",
      dayNumber: 1,
      area: "auth",
      title: "회원가입 오류 모니터링",
      description: "Must watch: 가입 실패율·에러 로그",
      status: "done",
      priority: "critical",
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      blockerReason: null,
      note: "",
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lwci-2",
      dayNumber: 1,
      area: "product",
      title: "상품등록 실패 모니터링",
      description: "Must watch: 등록 실패 건수",
      status: "done",
      priority: "critical",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lwci-3",
      dayNumber: 1,
      area: "image_upload",
      title: "이미지 업로드 실패 모니터링",
      description: "Must watch: 스토리지·업로드 에러",
      status: "in_progress",
      priority: "high",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "일부 500 확인 중",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lwci-4",
      dayNumber: 2,
      area: "chat",
      title: "채팅 생성 실패 모니터링",
      description: "Must watch: 채팅방 생성·메시지 전송",
      status: "blocked",
      priority: "critical",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: "채팅 API 지연 이슈",
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lwci-5",
      dayNumber: 2,
      area: "recommendation",
      title: "추천 피드 비정상 모니터링",
      description: "Must watch: 빈 피드·fallback 발생",
      status: "done",
      priority: "high",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: now,
      updatedAt: now,
    },
    {
      id: "lwci-6",
      dayNumber: 3,
      area: "moderation",
      title: "신고 급증 모니터링",
      description: "Must watch: 신고 건수·처리 지연",
      status: "todo",
      priority: "high",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lwci-7",
      dayNumber: 4,
      area: "point_payment",
      title: "포인트/광고 신청 누락 모니터링",
      description: "Must watch: 결제·신청 실패",
      status: "todo",
      priority: "medium",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
    {
      id: "lwci-8",
      dayNumber: 5,
      area: "admin_ops",
      title: "Daily check / shift handoff placeholder",
      description: "일일 점검·인수인계 메모",
      status: "todo",
      priority: "medium",
      ownerAdminId: null,
      ownerAdminNickname: null,
      blockerReason: null,
      note: "",
      checkedAt: null,
      updatedAt: now,
    },
  ];
}

function defaultDailyNotes(): LaunchWeekDailyNote[] {
  return [
    {
      id: "lwdn-1",
      dayNumber: 1,
      summary: "오픈 Day1. 가입·상품 등록 양호. 이미지 업로드 일부 500 확인됨.",
      topIssues: "이미지 업로드 500, 관리자 메뉴 권한 표시",
      topWins: "가입/등록 플로우 안정",
      handoffNote:
        "Day2 팀에 이미지 이슈 인수인계. Daily check / shift handoff placeholder.",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "lwdn-2",
      dayNumber: 2,
      summary: "Day2. 채팅 API 지연 발생. 피드 fallback 1회 후 복구.",
      topIssues: "채팅 지연, fallback 발생",
      topWins: "자동 복구 정상 동작",
      handoffNote: "채팅 담당자와 협의 예정.",
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

function defaultIssues(): LaunchWeekIssue[] {
  const now = isoNow();
  return [
    {
      id: "lwi-1",
      title: "이미지 업로드 500 에러",
      category: "image_upload",
      severity: "critical",
      status: "investigating",
      linkedType: "qa_issue",
      linkedId: "qil-1",
      dayNumber: 1,
      openedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      resolvedAt: null,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      note: "스토리지 정책 점검 중",
    },
    {
      id: "lwi-2",
      title: "채팅 API 지연",
      category: "chat",
      severity: "high",
      status: "open",
      linkedType: "incident",
      linkedId: "inc-1",
      dayNumber: 2,
      openedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      resolvedAt: null,
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "",
    },
    {
      id: "lwi-3",
      title: "피드 fallback 1회 발생",
      category: "recommendation",
      severity: "medium",
      status: "mitigated",
      linkedType: "alert_event",
      linkedId: null,
      dayNumber: 2,
      openedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      resolvedAt: now,
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "자동 복구됨",
    },
    {
      id: "lwi-4",
      title: "관리자 메뉴 권한 표시 오류",
      category: "admin_ops",
      severity: "low",
      status: "resolved",
      linkedType: "qa_issue",
      linkedId: "qil-3",
      dayNumber: 1,
      openedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      resolvedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "",
    },
  ];
}

function defaultKpis(): LaunchWeekKpis[] {
  const base = new Date();
  const now = isoNow();
  const offsets = [6, 5, 4, 3, 2, 1, 0];
  const rows: Omit<LaunchWeekKpis, "id" | "observedDate" | "createdAt">[] = [
    {
      signUpCount: 42,
      productCreatedCount: 128,
      chatStartedCount: 35,
      transactionCompletedCount: 12,
      reportCreatedCount: 2,
      incidentCount: 1,
      fallbackCount: 0,
      killSwitchCount: 0,
      pointChargeRequestCount: 5,
      adApplicationCount: 1,
    },
    {
      signUpCount: 58,
      productCreatedCount: 165,
      chatStartedCount: 48,
      transactionCompletedCount: 18,
      reportCreatedCount: 3,
      incidentCount: 0,
      fallbackCount: 1,
      killSwitchCount: 0,
      pointChargeRequestCount: 8,
      adApplicationCount: 2,
    },
    {
      signUpCount: 71,
      productCreatedCount: 192,
      chatStartedCount: 62,
      transactionCompletedCount: 22,
      reportCreatedCount: 5,
      incidentCount: 2,
      fallbackCount: 2,
      killSwitchCount: 0,
      pointChargeRequestCount: 12,
      adApplicationCount: 3,
    },
    {
      signUpCount: 65,
      productCreatedCount: 178,
      chatStartedCount: 55,
      transactionCompletedCount: 25,
      reportCreatedCount: 4,
      incidentCount: 0,
      fallbackCount: 0,
      killSwitchCount: 1,
      pointChargeRequestCount: 10,
      adApplicationCount: 2,
    },
    {
      signUpCount: 82,
      productCreatedCount: 210,
      chatStartedCount: 70,
      transactionCompletedCount: 30,
      reportCreatedCount: 6,
      incidentCount: 1,
      fallbackCount: 0,
      killSwitchCount: 0,
      pointChargeRequestCount: 15,
      adApplicationCount: 4,
    },
    {
      signUpCount: 90,
      productCreatedCount: 225,
      chatStartedCount: 78,
      transactionCompletedCount: 35,
      reportCreatedCount: 7,
      incidentCount: 0,
      fallbackCount: 0,
      killSwitchCount: 0,
      pointChargeRequestCount: 18,
      adApplicationCount: 5,
    },
    {
      signUpCount: 45,
      productCreatedCount: 95,
      chatStartedCount: 32,
      transactionCompletedCount: 8,
      reportCreatedCount: 2,
      incidentCount: 0,
      fallbackCount: 0,
      killSwitchCount: 0,
      pointChargeRequestCount: 6,
      adApplicationCount: 1,
    },
  ];

  return offsets.map((offset, i) => ({
    id: `lwk-${i + 1}`,
    observedDate: new Date(base.getTime() - offset * 86400000)
      .toISOString()
      .slice(0, 10),
    ...rows[i],
    createdAt: now,
  }));
}

const CHECKLIST_ITEMS: LaunchWeekChecklistItem[] = defaultChecklistItems();
const DAILY_NOTES: LaunchWeekDailyNote[] = defaultDailyNotes();
const ISSUES: LaunchWeekIssue[] = defaultIssues();
const KPIS: LaunchWeekKpis[] = defaultKpis();

export type LaunchWeekBundleV1 = {
  version: 1;
  checklistItems: LaunchWeekChecklistItem[];
  dailyNotes: LaunchWeekDailyNote[];
  issues: LaunchWeekIssue[];
  kpis: LaunchWeekKpis[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultLaunchWeekBundle(): LaunchWeekBundleV1 {
  return {
    version: 1,
    checklistItems: defaultChecklistItems().map((c) => ({ ...c })),
    dailyNotes: defaultDailyNotes().map((n) => ({ ...n })),
    issues: defaultIssues().map((i) => ({ ...i })),
    kpis: defaultKpis().map((k) => ({ ...k })),
  };
}

export function importLaunchWeekBundle(bundle: LaunchWeekBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    CHECKLIST_ITEMS,
    (bundle.checklistItems ?? []).map((c) => ({ ...c }))
  );
  replaceArray(DAILY_NOTES, (bundle.dailyNotes ?? []).map((n) => ({ ...n })));
  replaceArray(ISSUES, (bundle.issues ?? []).map((i) => ({ ...i })));
  replaceArray(KPIS, (bundle.kpis ?? []).map((k) => ({ ...k })));
  if (!CHECKLIST_ITEMS.length)
    replaceArray(CHECKLIST_ITEMS, defaultChecklistItems());
  if (!DAILY_NOTES.length) replaceArray(DAILY_NOTES, defaultDailyNotes());
  if (!ISSUES.length) replaceArray(ISSUES, defaultIssues());
  if (!KPIS.length) replaceArray(KPIS, defaultKpis());
}

export function exportLaunchWeekBundle(): LaunchWeekBundleV1 {
  return {
    version: 1,
    checklistItems: CHECKLIST_ITEMS.map((c) => ({ ...c })),
    dailyNotes: DAILY_NOTES.map((n) => ({ ...n })),
    issues: ISSUES.map((i) => ({ ...i })),
    kpis: KPIS.map((k) => ({ ...k })),
  };
}

/* ─── checklist ─────────────────────────────────────────────── */

export function getLaunchWeekChecklistItems(filters?: {
  dayNumber?: LaunchWeekDayNumber;
  status?: LaunchWeekChecklistStatus;
  area?: string;
}): LaunchWeekChecklistItem[] {
  let list = [...CHECKLIST_ITEMS];
  if (filters?.dayNumber)
    list = list.filter((c) => c.dayNumber === filters.dayNumber);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  if (filters?.area) list = list.filter((c) => c.area === filters.area);
  return list.sort(
    (a, b) => a.dayNumber - b.dayNumber || a.id.localeCompare(b.id)
  );
}

export function getBlockedChecklistItems(): LaunchWeekChecklistItem[] {
  return CHECKLIST_ITEMS.filter((c) => c.status === "blocked" && c.blockerReason);
}

/* ─── daily notes ───────────────────────────────────────────── */

export function getLaunchWeekDailyNotes(filters?: {
  dayNumber?: LaunchWeekDayNumber;
}): LaunchWeekDailyNote[] {
  let list = [...DAILY_NOTES].sort(
    (a, b) =>
      b.dayNumber - a.dayNumber ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.dayNumber)
    list = list.filter((n) => n.dayNumber === filters.dayNumber);
  return list;
}

export function getLaunchWeekDailyNoteByDay(
  dayNumber: LaunchWeekDayNumber
): LaunchWeekDailyNote | undefined {
  return DAILY_NOTES.filter((n) => n.dayNumber === dayNumber).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

/* ─── issues ────────────────────────────────────────────────── */

export function getLaunchWeekIssues(filters?: {
  dayNumber?: LaunchWeekDayNumber;
  status?: LaunchWeekIssueStatus;
  severity?: string;
}): LaunchWeekIssue[] {
  let list = [...ISSUES].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
  );
  if (filters?.dayNumber)
    list = list.filter((i) => i.dayNumber === filters.dayNumber);
  if (filters?.status)
    list = list.filter((i) => i.status === filters.status);
  if (filters?.severity)
    list = list.filter((i) => i.severity === filters.severity);
  return list;
}

export function getOpenCriticalIssues(): LaunchWeekIssue[] {
  return ISSUES.filter(
    (i) =>
      i.severity === "critical" &&
      !["resolved", "mitigated"].includes(i.status)
  );
}

/* ─── kpis ──────────────────────────────────────────────────── */

export function getLaunchWeekKpis(filters?: {
  observedDate?: string;
  fromDate?: string;
  toDate?: string;
}): LaunchWeekKpis[] {
  let list = [...KPIS].sort(
    (a, b) =>
      new Date(b.observedDate).getTime() - new Date(a.observedDate).getTime()
  );
  if (filters?.observedDate)
    list = list.filter((k) => k.observedDate === filters.observedDate);
  if (filters?.fromDate)
    list = list.filter((k) => k.observedDate >= filters!.fromDate!);
  if (filters?.toDate)
    list = list.filter((k) => k.observedDate <= filters!.toDate!);
  return list;
}

export function getLaunchWeekKpiByDate(
  observedDate: string
): LaunchWeekKpis | undefined {
  return KPIS.find((k) => k.observedDate === observedDate);
}
