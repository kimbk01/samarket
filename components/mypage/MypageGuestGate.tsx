"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { buildMypageGuestLoginHref, isMypageGuestPublicPath } from "@/lib/mypage/mypage-ia";

/**
 * 내정보 비로그인 규칙 1개 (분류 설계 S3, Owner 승인 2026-11-02).
 * 비로그인 확정 + 공개 아닌 `/mypage/**` → `/mypage?next=<원래 주소>` (내정보 로그인 화면, 하단 탭 유지).
 * 서버가 막는 경로(주문내역 등)는 `proxy.ts` 가 같은 목적지로 보낸다.
 */
export function MypageGuestGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const membership = useClientMembershipState("mypage-guest-gate");
  const sessionMember = Boolean(getCurrentUser()?.id) || membership.status === "member";
  const memberOnly = !sessionMember && !isMypageGuestPublicPath(pathname);
  const blocked = memberOnly && membership.status === "guest";
  const search = searchParams.toString();

  useEffect(() => {
    if (!blocked) return;
    router.replace(buildMypageGuestLoginHref(search ? `${pathname}?${search}` : pathname));
  }, [blocked, pathname, router, search]);

  /**
   * 비로그인 확정 → 이동 중에는 회원 화면을 그리지 않는다.
   * 확인 중(서버 렌더 포함)에는 그린다 — 로그인 회원의 첫 화면을 비우지 않기 위해 (내정보 첫 화면 계약).
   */
  if (blocked) return null;
  return <>{children}</>;
}
