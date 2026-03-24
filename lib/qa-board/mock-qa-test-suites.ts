/**
 * 48단계: QA 테스트 스위트 mock
 */

import type { QaTestSuite, QaTestDomain } from "@/lib/types/qa-board";

const now = new Date().toISOString();

const SUITES: QaTestSuite[] = [
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

export function getQaTestSuites(filters?: {
  domain?: QaTestDomain;
  isCritical?: boolean;
}): QaTestSuite[] {
  let list = [...SUITES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.domain) list = list.filter((s) => s.domain === filters.domain);
  if (filters?.isCritical !== undefined)
    list = list.filter((s) => s.isCritical === filters.isCritical);
  return list;
}

export function getQaTestSuiteById(id: string): QaTestSuite | undefined {
  return SUITES.find((s) => s.id === id);
}
