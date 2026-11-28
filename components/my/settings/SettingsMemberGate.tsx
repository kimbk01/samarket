"use client";

import type { ReactNode } from "react";
import { MembershipCheckFailedPanel } from "@/components/auth/MembershipCheckFailedPanel";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { useClientMemberId, useClientMembershipRecoveryFailed } from "@/hooks/use-client-membership-state";

/**
 * 설정 화면 공통 문 — 회원 상태 SSOT 가 회원 id 를 알 때만 설정 화면을 그린다(관심이웃 전체 수정 설계 v2 §6).
 * 그 전엔 뼈대, 회원 확인 재시도가 다 실패하면 오류 + [다시 시도] (무한 뼈대 금지).
 * 예전: 회원을 모르면 "me" 대체 키 — 주소로 바로 열면 "me" 키로 설정을 읽고 저장·동기화했다.
 */
export function SettingsMemberGate({ source, children }: { source: string; children: (userId: string) => ReactNode }) {
  const userId = useClientMemberId(source);
  const recoveryFailed = useClientMembershipRecoveryFailed();
  if (userId) return <>{children(userId)}</>;
  if (recoveryFailed) return <MembershipCheckFailedPanel source={source} />;
  return <MyStateSkeleton template="settings" />;
}
