/**
 * QA 보드 — 스위트·케이스·파일럿·이슈 단일 저장소.
 * 영속화: `qa-board-db` + `/api/admin/qa-board`
 */
import type {
  QaTestSuite,
  QaTestDomain,
  QaTestCase,
  QaTestCaseStatus,
  QaTestEnvironment,
  QaPilotCheck,
  QaPilotCategory,
  QaPilotCheckStatus,
  QaIssueLog,
  QaIssueStatus,
  QaIssueSeverity,
} from "@/lib/types/qa-board";

function isoNow() {
  return new Date().toISOString();
}

function defaultTestSuites(): QaTestSuite[] {
  const now = isoNow();
  return [
    {
      id: "qts-1",
      domain: "auth",
      title: "회원가입/로그인",
      description: "소셜·이메일 로그인, 회원가입 플로우",
      isCritical: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-2",
      domain: "product",
      title: "상품 등록/수정/삭제",
      description: "상품 CRUD 및 이미지 업로드",
      isCritical: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-3",
      domain: "feed",
      title: "홈/검색/추천",
      description: "피드 노출, 검색, 추천 슬롯",
      isCritical: true,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-4",
      domain: "chat",
      title: "채팅/거래상태",
      description: "채팅 송수신, 거래 상태 변경",
      isCritical: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-5",
      domain: "moderation",
      title: "신고/제재",
      description: "신고 접수, 제재 적용",
      isCritical: true,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-6",
      domain: "point_payment",
      title: "포인트/결제",
      description: "포인트 충전·사용·만료",
      isCritical: true,
      sortOrder: 6,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-7",
      domain: "ads_business",
      title: "광고/상점",
      description: "광고 신청, 상점 노출",
      isCritical: false,
      sortOrder: 7,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-8",
      domain: "admin_console",
      title: "관리자 콘솔",
      description: "관리자 로그인, 권한, 주요 메뉴",
      isCritical: true,
      sortOrder: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-9",
      domain: "ops",
      title: "운영 도구",
      description: "모니터링, 런북, 문서",
      isCritical: false,
      sortOrder: 9,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "qts-10",
      domain: "security",
      title: "보안/RLS placeholder",
      description: "인증·RLS 검증 placeholder",
      isCritical: true,
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function defaultTestCases(): QaTestCase[] {
  const now = isoNow();
  return [
    {
      id: "qtc-1",
      suiteId: "qts-1",
      title: "이메일 로그인 성공",
      description: "유효한 이메일/비밀번호로 로그인",
      area: "auth",
      status: "passed",
      priority: "critical",
      isMustPass: true,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      executedAt: now,
      environment: "staging",
      linkedType: null,
      linkedId: null,
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-2",
      suiteId: "qts-1",
      title: "회원가입 후 프로필 생성",
      description: "가입 시 profiles 레코드 생성",
      area: "auth",
      status: "passed",
      priority: "high",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: new Date(Date.now() - 86400000).toISOString(),
      environment: "staging",
      linkedType: "migration_table",
      linkedId: "pmt-2",
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-3",
      suiteId: "qts-2",
      title: "상품 등록 E2E",
      description: "이미지 업로드 포함 상품 등록",
      area: "product",
      status: "failed",
      priority: "critical",
      isMustPass: true,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      executedAt: now,
      environment: "staging",
      linkedType: null,
      linkedId: null,
      failureNote: "이미지 업로드 500 에러",
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-4",
      suiteId: "qts-3",
      title: "홈 피드 로드",
      description: "비로그인/로그인 피드 노출",
      area: "feed",
      status: "passed",
      priority: "high",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: now,
      environment: "local",
      linkedType: "deployment",
      linkedId: "rd-1",
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-5",
      suiteId: "qts-4",
      title: "채팅 메시지 송수신",
      description: "실시간 채팅 동작",
      area: "chat",
      status: "blocked",
      priority: "high",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: null,
      environment: "staging",
      linkedType: "readiness_item",
      linkedId: "lri-12",
      failureNote: null,
      blockerReason: "채팅 API 미연동",
      updatedAt: now,
    },
    {
      id: "qtc-6",
      suiteId: "qts-5",
      title: "신고 접수 플로우",
      description: "신고 제출 후 관리자 노출",
      area: "moderation",
      status: "passed",
      priority: "high",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: now,
      environment: "staging",
      linkedType: null,
      linkedId: null,
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-7",
      suiteId: "qts-6",
      title: "포인트 충전·차감",
      description: "충전 후 상품 구매 시 차감",
      area: "point_payment",
      status: "not_started",
      priority: "critical",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: null,
      environment: "staging",
      linkedType: "readiness_item",
      linkedId: "lri-6",
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-8",
      suiteId: "qts-8",
      title: "관리자 로그인·메뉴",
      description: "역할별 메뉴 접근",
      area: "admin_console",
      status: "in_progress",
      priority: "critical",
      isMustPass: true,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      executedAt: null,
      environment: "staging",
      linkedType: null,
      linkedId: null,
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
    {
      id: "qtc-9",
      suiteId: "qts-10",
      title: "RLS 정책 검증 placeholder",
      description: "주요 테이블 RLS 동작",
      area: "security",
      status: "not_started",
      priority: "critical",
      isMustPass: true,
      ownerAdminId: null,
      ownerAdminNickname: null,
      executedAt: null,
      environment: "production_candidate",
      linkedType: null,
      linkedId: null,
      failureNote: null,
      blockerReason: null,
      updatedAt: now,
    },
  ];
}

function defaultPilotChecks(): QaPilotCheck[] {
  const now = isoNow();
  return [
    {
      id: "qpc-1",
      title: "파일럿 사용자 온보딩 완료",
      category: "onboarding",
      status: "done",
      assignedAdminId: "admin1",
      assignedAdminNickname: "관리자",
      note: "",
      updatedAt: now,
    },
    {
      id: "qpc-2",
      title: "홈/검색 체험 피드백 수집",
      category: "browsing",
      status: "in_progress",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "파일럿 5명 대상",
      updatedAt: now,
    },
    {
      id: "qpc-3",
      title: "상품 등록 체험 피드백",
      category: "posting",
      status: "todo",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "qpc-4",
      title: "채팅 체험 피드백",
      category: "chat",
      status: "blocked",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "채팅 연동 후 진행",
      updatedAt: now,
    },
    {
      id: "qpc-5",
      title: "신고 플로우 피드백",
      category: "reporting",
      status: "todo",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "qpc-6",
      title: "포인트 사용 피드백",
      category: "points",
      status: "todo",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "",
      updatedAt: now,
    },
    {
      id: "qpc-7",
      title: "관리자 응답 만족도 placeholder",
      category: "admin_response",
      status: "todo",
      assignedAdminId: null,
      assignedAdminNickname: null,
      note: "파일럿 피드백 목록 placeholder",
      updatedAt: now,
    },
  ];
}

function defaultIssueLogs(): QaIssueLog[] {
  const now = isoNow();
  return [
    {
      id: "qil-1",
      title: "상품 이미지 업로드 500 에러",
      severity: "critical",
      status: "open",
      relatedTestCaseId: "qtc-3",
      linkedType: "product",
      linkedId: null,
      reproduced: true,
      createdAt: now,
      updatedAt: now,
      ownerAdminId: "admin1",
      ownerAdminNickname: "관리자",
      note: "스토리지 bucket 정책 확인 필요",
    },
    {
      id: "qil-2",
      title: "채팅 메시지 지연",
      severity: "high",
      status: "in_progress",
      relatedTestCaseId: "qtc-5",
      linkedType: "chat",
      linkedId: null,
      reproduced: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now,
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "",
    },
    {
      id: "qil-3",
      title: "관리자 메뉴 권한 표시 오류",
      severity: "medium",
      status: "fixed",
      relatedTestCaseId: null,
      linkedType: "admin",
      linkedId: null,
      reproduced: true,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: now,
      ownerAdminId: null,
      ownerAdminNickname: null,
      note: "검증 대기",
    },
  ];
}

const TEST_SUITES: QaTestSuite[] = defaultTestSuites();
const TEST_CASES: QaTestCase[] = defaultTestCases();
const PILOT_CHECKS: QaPilotCheck[] = defaultPilotChecks();
const ISSUE_LOGS: QaIssueLog[] = defaultIssueLogs();

export type QaBoardBundleV1 = {
  version: 1;
  testSuites: QaTestSuite[];
  testCases: QaTestCase[];
  pilotChecks: QaPilotCheck[];
  issueLogs: QaIssueLog[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultQaBoardBundle(): QaBoardBundleV1 {
  return {
    version: 1,
    testSuites: defaultTestSuites().map((s) => ({ ...s })),
    testCases: defaultTestCases().map((c) => ({ ...c })),
    pilotChecks: defaultPilotChecks().map((c) => ({ ...c })),
    issueLogs: defaultIssueLogs().map((l) => ({ ...l })),
  };
}

export function importQaBoardBundle(bundle: QaBoardBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    TEST_SUITES,
    (bundle.testSuites ?? []).map((s) => ({ ...s }))
  );
  replaceArray(
    TEST_CASES,
    (bundle.testCases ?? []).map((c) => ({ ...c }))
  );
  replaceArray(
    PILOT_CHECKS,
    (bundle.pilotChecks ?? []).map((c) => ({ ...c }))
  );
  replaceArray(
    ISSUE_LOGS,
    (bundle.issueLogs ?? []).map((l) => ({ ...l }))
  );
  if (!TEST_SUITES.length) replaceArray(TEST_SUITES, defaultTestSuites());
  if (!TEST_CASES.length) replaceArray(TEST_CASES, defaultTestCases());
  if (!PILOT_CHECKS.length) replaceArray(PILOT_CHECKS, defaultPilotChecks());
  if (!ISSUE_LOGS.length) replaceArray(ISSUE_LOGS, defaultIssueLogs());
}

export function exportQaBoardBundle(): QaBoardBundleV1 {
  return {
    version: 1,
    testSuites: TEST_SUITES.map((s) => ({ ...s })),
    testCases: TEST_CASES.map((c) => ({ ...c })),
    pilotChecks: PILOT_CHECKS.map((c) => ({ ...c })),
    issueLogs: ISSUE_LOGS.map((l) => ({ ...l })),
  };
}

/* ─── test suites ───────────────────────────────────────────── */

export function getQaTestSuites(filters?: {
  domain?: QaTestDomain;
  isCritical?: boolean;
}): QaTestSuite[] {
  let list = [...TEST_SUITES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.domain) list = list.filter((s) => s.domain === filters.domain);
  if (filters?.isCritical !== undefined)
    list = list.filter((s) => s.isCritical === filters.isCritical);
  return list;
}

export function getQaTestSuiteById(id: string): QaTestSuite | undefined {
  return TEST_SUITES.find((s) => s.id === id);
}

/* ─── test cases ────────────────────────────────────────────── */

export function getQaTestCases(filters?: {
  suiteId?: string;
  status?: QaTestCaseStatus;
  environment?: QaTestEnvironment;
  isMustPass?: boolean;
}): QaTestCase[] {
  let list = [...TEST_CASES];
  if (filters?.suiteId) list = list.filter((c) => c.suiteId === filters.suiteId);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  if (filters?.environment)
    list = list.filter((c) => c.environment === filters.environment);
  if (filters?.isMustPass !== undefined)
    list = list.filter((c) => c.isMustPass === filters.isMustPass);
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

export function getQaTestCaseById(id: string): QaTestCase | undefined {
  return TEST_CASES.find((c) => c.id === id);
}

export function getBlockedOrFailedTestCases(): QaTestCase[] {
  return TEST_CASES.filter(
    (c) => (c.status === "blocked" && c.blockerReason) || c.status === "failed"
  );
}

/* ─── pilot checks ──────────────────────────────────────────── */

export function getQaPilotChecks(filters?: {
  category?: QaPilotCategory;
  status?: QaPilotCheckStatus;
}): QaPilotCheck[] {
  let list = [...PILOT_CHECKS];
  if (filters?.category)
    list = list.filter((c) => c.category === filters.category);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  return list;
}

/* ─── issue logs ────────────────────────────────────────────── */

export function getQaIssueLogs(filters?: {
  status?: QaIssueStatus;
  severity?: QaIssueSeverity;
  relatedTestCaseId?: string;
}): QaIssueLog[] {
  let list = [...ISSUE_LOGS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status)
    list = list.filter((l) => l.status === filters.status);
  if (filters?.severity)
    list = list.filter((l) => l.severity === filters.severity);
  if (filters?.relatedTestCaseId)
    list = list.filter((l) => l.relatedTestCaseId === filters.relatedTestCaseId);
  return list;
}

export function getOpenCriticalIssues(): QaIssueLog[] {
  return ISSUE_LOGS.filter(
    (l) => l.severity === "critical" && !["fixed", "verified", "wont_fix"].includes(l.status)
  );
}
