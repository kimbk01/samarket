/**
 * 샘플 검증용 계정 (실서비스 Auth 교체 전 고정값)
 * — profiles / auth.users 와 매핑할 때 이 객체를 단일 소스로 삼으면 됨.
 */

export type MockSampleRole = "member" | "owner" | "admin";

export const SAMPLE_PASSWORD = "1234";

/** 기본 회원 (주문·채팅 시드 연동) */
export const SAMPLE_MEMBER_LOGIN = "qqqq";
export const SAMPLE_MEMBER_USER_ID = "qqqq";
export const SAMPLE_MEMBER_DISPLAY = "qqqq";

/** 추가 회원 (동일 member 역할, 로그인 검증용 — 시드 주문은 qqqq 기준) */
export const SAMPLE_MEMBER_ALT_LOGIN = "zzzz";
export const SAMPLE_MEMBER_ALT_USER_ID = "zzzz";
export const SAMPLE_MEMBER_ALT_DISPLAY = "zzzz";

export const SAMPLE_OWNER_LOGIN = "wwww";
/** 매장(오너) 사용자 ID — 주문·채팅·알림의 owner_user_id 와 동일 */
export const SAMPLE_OWNER_USER_ID = "wwww";
export const SAMPLE_OWNER_DISPLAY = "서울한식당 사장님";

export const SAMPLE_ADMIN_LOGIN = "aaaa";
/** 로그인 ID·표시용. DB test_users 의 id 는 마이그레이션 시드 UUID(1111…1111)이며 /api/test-login 이 반환 */
export const SAMPLE_ADMIN_USER_ID = "aaaa";
export const SAMPLE_ADMIN_DISPLAY = "관리자";

export const SAMPLE_STORE_NAME = "서울한식당";

export interface MockSampleAccount {
  loginId: string;
  password: string;
  role: MockSampleRole;
  userId: string;
  displayName: string;
  description: string;
}

export const MOCK_SAMPLE_ACCOUNTS: MockSampleAccount[] = [
  {
    loginId: SAMPLE_MEMBER_LOGIN,
    password: SAMPLE_PASSWORD,
    role: "member",
    userId: SAMPLE_MEMBER_USER_ID,
    displayName: SAMPLE_MEMBER_DISPLAY,
    description: "주문 생성 / 주문내역 / 주문채팅 / 취소요청 / 알림 확인용 회원 샘플 계정",
  },
  {
    loginId: SAMPLE_MEMBER_ALT_LOGIN,
    password: SAMPLE_PASSWORD,
    role: "member",
    userId: SAMPLE_MEMBER_ALT_USER_ID,
    displayName: SAMPLE_MEMBER_ALT_DISPLAY,
    description: "추가 회원 샘플 계정 (시드 주문 없음 · 역할 전환/로그인 검증용)",
  },
  {
    loginId: SAMPLE_OWNER_LOGIN,
    password: SAMPLE_PASSWORD,
    role: "owner",
    userId: SAMPLE_OWNER_USER_ID,
    displayName: SAMPLE_OWNER_DISPLAY,
    description: "주문 접수 / 조리중 / 배달중 / 완료 / 채팅 응답 / 알림 확인용 매장 샘플 계정",
  },
  {
    loginId: SAMPLE_ADMIN_LOGIN,
    password: SAMPLE_PASSWORD,
    role: "admin",
    userId: SAMPLE_ADMIN_USER_ID,
    displayName: SAMPLE_ADMIN_DISPLAY,
    description: "주문 강제 변경 / 신고 확인 / 채팅 제한 / 정산 보류 / 알림 확인용 샘플 관리자 계정",
  },
];

export function findMockSampleAccount(
  loginId: string,
  password: string
): MockSampleAccount | undefined {
  const id = loginId.trim().toLowerCase();
  return MOCK_SAMPLE_ACCOUNTS.find(
    (a) => a.loginId.toLowerCase() === id && a.password === password
  );
}

export function mockAccountByRole(role: MockSampleRole): MockSampleAccount {
  const a = MOCK_SAMPLE_ACCOUNTS.find((x) => x.role === role);
  if (!a) throw new Error(`No mock account for role ${role}`);
  return a;
}
