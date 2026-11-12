/**
 * 어드민 회원 「로그인 계정」 표시 — 단일 정의 (Owner 「설계안 진행」 2026-11-08, 설계안 ③④).
 *
 * 기준: SNS 계정은 `user_auth_identities`(제공자·고유번호·계정 이메일)가 유일한 근거
 * (`lib/auth/provider-identity/profile-identity-metadata-contract.ts`).
 * profiles.provider_user_id 는 미러 — identity 행이 없을 때만 보조로 쓴다.
 *
 * 내부 로그인 주소(`*.native.dibay.internal`, `@manual.local`)는 연락 이메일로 쓰지 않는다.
 * 관리자 생성 회원은 `@manual.local` 앞부분이 실제 로그인 아이디다.
 *
 * 클라이언트·서버 공용 (서버 전용 import 없음).
 */

import { MANUAL_MEMBER_EMAIL_SUFFIX } from "@/lib/auth/manual-member-email";
import type { AdminAuthProvider } from "@/lib/types/admin-user";
import type { AdminLinkedIdentity } from "@/lib/admin-users/resolve-admin-user-display";

export type AdminMemberLoginAccount = {
  provider: AdminAuthProvider;
  /** SNS 고유번호 (Apple sub · 카카오 회원번호 · Google id) */
  providerUserId: string | null;
  /** SNS 가 준 계정 이메일 (릴레이 포함) */
  email: string | null;
  emailIsPrivateRelay: boolean;
  /** 관리자 생성 회원 실제 로그인 아이디 */
  manualLoginId: string | null;
  linkedAt: string | null;
};

const SNS = new Set<AdminAuthProvider>(["google", "kakao", "apple", "naver"]);

function pick(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** `xxx@manual.local` → `xxx` (관리자 생성 회원 로그인 아이디) */
export function manualLoginIdFromAuthEmail(email: string | null | undefined): string | null {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX)) return null;
  return pick(normalized.slice(0, -MANUAL_MEMBER_EMAIL_SUFFIX.length));
}

export function resolveAdminMemberLoginAccount(input: {
  provider: AdminAuthProvider;
  linkedIdentities?: readonly AdminLinkedIdentity[] | null;
  profileProviderUserId?: string | null;
  authLoginEmail?: string | null;
}): AdminMemberLoginAccount | null {
  const manualLoginId = manualLoginIdFromAuthEmail(input.authLoginEmail);
  if (input.provider === "manual" || (manualLoginId && !SNS.has(input.provider))) {
    return {
      provider: "manual",
      providerUserId: null,
      email: null,
      emailIsPrivateRelay: false,
      manualLoginId,
      linkedAt: null,
    };
  }
  if (!SNS.has(input.provider)) return null;
  const linked =
    (input.linkedIdentities ?? []).find((row) => String(row.provider).toLowerCase() === input.provider) ?? null;
  const providerUserId = pick(linked?.providerUserId) ?? pick(input.profileProviderUserId);
  return {
    provider: input.provider,
    providerUserId,
    email: pick(linked?.email),
    emailIsPrivateRelay: linked?.emailIsPrivateRelay === true || /@privaterelay\.appleid\.com$/i.test(pick(linked?.email) ?? ""),
    manualLoginId: null,
    linkedAt: pick(linked?.linkedAt),
  };
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 12)}…` : id;
}

/** 목록 「회원」 칸 둘째 줄 — 누구의 어떤 계정인지 한 줄로 */
export function adminMemberLoginAccountLabelKo(account: AdminMemberLoginAccount | null | undefined): string | null {
  if (!account) return null;
  if (account.provider === "manual") {
    return account.manualLoginId ? `로그인 ${account.manualLoginId}` : null;
  }
  if (account.provider === "kakao") {
    const base = account.providerUserId ? `카카오 ${account.providerUserId}` : "카카오";
    return account.email ? `${base} · ${account.email}` : base;
  }
  if (account.provider === "apple") {
    if (account.email && !account.emailIsPrivateRelay) return `Apple ${account.email}`;
    const sub = account.providerUserId ? ` · ${shortId(account.providerUserId)}` : "";
    return `Apple · 이메일 가리기${sub}`;
  }
  if (account.provider === "google") {
    return account.email ? `Google ${account.email}` : account.providerUserId ? `Google ${account.providerUserId}` : "Google";
  }
  const label = "네이버";
  return account.email ? `${label} ${account.email}` : account.providerUserId ? `${label} ${account.providerUserId}` : label;
}

/** 복사 값 — 운영자가 검색·문의 대조에 쓰는 값 */
export function adminMemberLoginAccountCopyValue(account: AdminMemberLoginAccount | null | undefined): string | null {
  if (!account) return null;
  if (account.provider === "manual") return account.manualLoginId;
  if (account.provider === "kakao") return account.providerUserId ?? account.email;
  if (account.provider === "apple") return account.emailIsPrivateRelay ? account.providerUserId : account.email ?? account.providerUserId;
  return account.email ?? account.providerUserId;
}

/** 연락 이메일이 없을 때 이유 (내부 주소를 대신 보여주지 않는다) */
export function adminContactEmailEmptyReasonKo(account: AdminMemberLoginAccount | null | undefined): string | null {
  if (!account) return null;
  if (account.provider === "manual") return "관리자 생성 계정";
  if (account.provider === "kakao") return "카카오 이메일 미동의";
  if (account.provider === "apple") return "Apple 이메일 가리기";
  return null;
}
