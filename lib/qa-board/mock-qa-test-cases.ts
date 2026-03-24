/**
 * 48단계: QA 테스트 케이스 mock (46/47/38/33 연계)
 */

import type {
  QaTestCase,
  QaTestCaseStatus,
  QaTestEnvironment,
} from "@/lib/types/qa-board";

const now = new Date().toISOString();

const CASES: QaTestCase[] = [
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

export function getQaTestCases(filters?: {
  suiteId?: string;
  status?: QaTestCaseStatus;
  environment?: QaTestEnvironment;
  isMustPass?: boolean;
}): QaTestCase[] {
  let list = [...CASES];
  if (filters?.suiteId) list = list.filter((c) => c.suiteId === filters.suiteId);
  if (filters?.status) list = list.filter((c) => c.status === filters.status);
  if (filters?.environment)
    list = list.filter((c) => c.environment === filters.environment);
  if (filters?.isMustPass !== undefined)
    list = list.filter((c) => c.isMustPass === filters.isMustPass);
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

export function getQaTestCaseById(id: string): QaTestCase | undefined {
  return CASES.find((c) => c.id === id);
}

export function getBlockedOrFailedTestCases(): QaTestCase[] {
  return CASES.filter(
    (c) => (c.status === "blocked" && c.blockerReason) || c.status === "failed"
  );
}
