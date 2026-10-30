/**
 * 내정보 「필수 정보」 3행 상태 모델 (real-screen-redesign §11 · 11-1 · 11-2 · 11-3, Owner 승인 2026-10-20).
 *
 * - 아이디 · 전화번호 인증 · 대표 주소 3행을 **완료 여부와 관계없이 항상** 만든다 (홈·계정 S03 공통).
 * - 순수 함수 — 네트워크 없음. 입력은 화면이 이미 가진 프로필 1건 + 주소 기본값 스냅샷 결과뿐.
 * - 판정 SSOT 재사용: 아이디 `evaluatePublicIdProfileView`, 전화 `resolveMemberPhoneState`(→ `hasVerifiedPhone`),
 *   주소 `is_default_master` 존재(`activeCount` 는 같은 응답의 활성 주소 수).
 * - 오류·확인 불가는 회색 「확인 불가」 + [다시 시도] — **절대 완료(그린)로 그리지 않는다.**
 * - 「주소 인증」 상태는 DB 에 없으므로 만들지 않는다. 배달 가능 여부도 여기서 다루지 않는다.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { ProfileRow } from "@/lib/profile/types";
import type { RequiredInfoStatus } from "@/lib/mypage/mypage-home-snapshot";
import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import { resolveMemberPhoneState, type MemberPhoneStateKind } from "@/lib/profile/member-account-status";
import { formatAtUsername } from "@/lib/users/user-label";

export type MypageRequiredRowKey = "handle" | "phone" | "address";

/** §11 상태 → 색 대응: missing=빨강 · progress=주황 테두리 · complete=그린 · action=주황 채움 · error=회색 */
export type MypageRequiredRowTone = "missing" | "progress" | "complete" | "action" | "error";

export type MypageRequiredHandleState = "missing" | "draft" | "complete_auto" | "complete_locked" | "error";
export type MypageRequiredPhoneState = MemberPhoneStateKind | "error";
export type MypageRequiredAddressState = "missing" | "complete" | "needs_master" | "error";

export type MypageRequiredRow = {
  key: MypageRequiredRowKey;
  state: MypageRequiredHandleState | MypageRequiredPhoneState | MypageRequiredAddressState;
  tone: MypageRequiredRowTone;
  /** 현재 값 — 원문(@id·마스킹 번호·동네) 또는 문구 키. 없음 = null */
  value: { text: string } | { key: MessageKey } | null;
  badgeKey: MessageKey;
  /** 배지 아래 보조 문구 (1회 변경 가능 · 변경 완료 · 관리자 확인으로 인증됨) */
  subKey: MessageKey | null;
  /** CTA 버튼 문구 — null = 버튼 없음(행 탭은 조회만) */
  ctaKey: MessageKey | null;
  ctaVariant: "primary" | "secondary" | null;
  /** 행·CTA 탭 동작 — open = 시트/화면 이동, retry = 다시 조회 */
  action: "open" | "retry";
};

export type MypageRequiredInfoInput = {
  /** 프로필 1건 — 아직 없으면 null */
  profile: ProfileRow | null;
  /** 프로필 조회 실패(재시도 대상) */
  profileFailed: boolean;
  address: {
    status: RequiredInfoStatus;
    /** 대표 주소 공개 라벨(동네) */
    label: string | null;
    /** 활성 주소 수 — 모름 = null/undefined */
    activeCount?: number | null;
    /** 주소 조회 실패(재시도 대상) */
    failed: boolean;
  };
  nowMs?: number;
  otpTtlSeconds?: number;
};

export type MypageRequiredInfoResult =
  | { settled: false }
  | { settled: true; rows: [MypageRequiredRow, MypageRequiredRow, MypageRequiredRow] };

function errorRow(key: MypageRequiredRowKey): MypageRequiredRow {
  return {
    key,
    state: "error",
    tone: "error",
    value: null,
    badgeKey: "mypage_req_badge_unknown",
    subKey: null,
    ctaKey: "common_retry",
    ctaVariant: "secondary",
    action: "retry",
  };
}

function pickTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** 11-1 회원 아이디 */
export function resolveHandleRow(profile: ProfileRow): MypageRequiredRow {
  const view = evaluatePublicIdProfileView(profile);
  const raw = pickTrimmed(profile.dibay_id) ?? pickTrimmed(view.atDisplay)?.replace(/^@/, "") ?? null;
  const base = { key: "handle" as const, action: "open" as const };
  if (!raw) {
    return {
      ...base,
      state: "missing",
      tone: "missing",
      value: { key: "mypage_req_value_handle_none" },
      badgeKey: "mypage_req_badge_setup_needed",
      subKey: null,
      ctaKey: "mypage_req_cta_setup",
      ctaVariant: "primary",
    };
  }
  const at = { text: formatAtUsername(raw) || `@${raw}` };
  if (view.canChangeOnce || view.autoAssigned) {
    return {
      ...base,
      state: "complete_auto",
      tone: "complete",
      value: at,
      badgeKey: "mypage_req_badge_setup_done",
      subKey: "mypage_req_sub_change_once",
      ctaKey: "mypage_req_cta_change",
      ctaVariant: "secondary",
    };
  }
  if (view.setupComplete || view.changeComplete || profile.dibay_id_locked === true) {
    return {
      ...base,
      state: "complete_locked",
      tone: "complete",
      value: at,
      badgeKey: "mypage_req_badge_setup_done",
      subKey: "mypage_req_sub_change_done",
      ctaKey: null,
      ctaVariant: null,
    };
  }
  // 값은 있으나 미잠금·자동 아님 — 확정 안 된 초안
  return {
    ...base,
    state: "draft",
    tone: "action",
    value: at,
    badgeKey: "mypage_req_badge_confirm_needed",
    subKey: null,
    ctaKey: "mypage_req_cta_confirm",
    ctaVariant: "primary",
  };
}

/** 11-2 전화번호 인증 — 판정은 `resolveMemberPhoneState` (홈·S03·S05 공통) */
export function resolvePhoneRow(
  profile: ProfileRow,
  opts?: { nowMs?: number; otpTtlSeconds?: number },
): MypageRequiredRow {
  const phone = resolveMemberPhoneState(profile, opts);
  const masked = phone.masked ? { text: phone.masked } : null;
  const none = { key: "mypage_req_value_phone_none" as MessageKey };
  const base = { key: "phone" as const, state: phone.kind, action: "open" as const };
  switch (phone.kind) {
    case "verified":
      // 인증 = 권한 계약 — 번호가 없어도(과거 관리자 수동 인증) 「인증 완료」. 번호 없음은 값·보조 CTA 로만 표시.
      return {
        ...base,
        tone: "complete",
        value: masked ?? none,
        badgeKey: "mypage_req_badge_verify_done",
        subKey: null,
        ctaKey: masked ? "mypage_req_cta_change_number" : "mypage_req_cta_register_number",
        ctaVariant: "secondary",
      };
    case "pending":
      return {
        ...base,
        tone: "progress",
        value: masked ?? none,
        badgeKey: "mypage_req_badge_verify_pending",
        subKey: null,
        ctaKey: "mypage_req_cta_continue_verify",
        ctaVariant: "primary",
      };
    case "pending_expired":
      return {
        ...base,
        tone: "missing",
        value: masked ?? none,
        badgeKey: "mypage_req_badge_verify_expired",
        subKey: null,
        ctaKey: "mypage_req_cta_reverify",
        ctaVariant: "primary",
      };
    case "unverified_with_number":
    case "unverified":
    default:
      return {
        ...base,
        tone: "missing",
        value: masked ?? none,
        badgeKey: "mypage_req_badge_verify_needed",
        subKey: null,
        ctaKey: "mypage_req_cta_verify",
        ctaVariant: "primary",
      };
  }
}

/** 11-3 대표 주소 — 등록 상태만 (주소 인증·배달 가능 여부 없음) */
export function resolveAddressRow(address: MypageRequiredInfoInput["address"]): MypageRequiredRow {
  const base = { key: "address" as const, action: "open" as const };
  if (address.status === "complete") {
    const label = pickTrimmed(address.label);
    return {
      ...base,
      state: "complete",
      tone: "complete",
      value: label ? { text: label } : null,
      badgeKey: "mypage_req_badge_register_done",
      subKey: null,
      ctaKey: "mypage_req_cta_change",
      ctaVariant: "secondary",
    };
  }
  if (address.status === "required") {
    if (typeof address.activeCount === "number" && address.activeCount > 0) {
      return {
        ...base,
        state: "needs_master",
        tone: "action",
        value: { key: "mypage_req_value_address_no_master" },
        badgeKey: "mypage_req_badge_master_needed",
        subKey: null,
        ctaKey: "mypage_req_cta_set_master",
        ctaVariant: "primary",
      };
    }
    return {
      ...base,
      state: "missing",
      tone: "missing",
      value: { key: "mypage_req_value_address_none" },
      badgeKey: "mypage_req_badge_register_needed",
      subKey: null,
      ctaKey: "mypage_req_cta_register_address",
      ctaVariant: "primary",
    };
  }
  return errorRow("address");
}

/**
 * 3행 상태 — 확정 전(`settled:false`)이면 화면은 3행 고정 높이 스켈레톤.
 * 실패한 항목만 「확인 불가」 행으로 바뀐다(나머지는 아는 값 그대로).
 */
export function resolveMypageRequiredInfoRows(input: MypageRequiredInfoInput): MypageRequiredInfoResult {
  const { profile, profileFailed, address } = input;
  const profileKnown = profile != null && Boolean(profile.id?.trim());
  if (!profileKnown && !profileFailed) return { settled: false };
  if (address.status === "unknown" && !address.failed) return { settled: false };
  const opts = { nowMs: input.nowMs, otpTtlSeconds: input.otpTtlSeconds };
  return {
    settled: true,
    rows: [
      profileKnown ? resolveHandleRow(profile) : errorRow("handle"),
      profileKnown ? resolvePhoneRow(profile, opts) : errorRow("phone"),
      resolveAddressRow(address),
    ],
  };
}
