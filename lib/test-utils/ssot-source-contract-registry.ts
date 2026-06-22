/**
 * SSOT 소스 계약 마커 — 구현 문자열 대신 의도적 주석을 검증한다.
 * 리팩터 시 마커만 갱신; call-site 시그니처 grep 금지.
 *
 * 규칙: `.cursor/rules/samarket-ci-stability-regulation.mdc`
 */

export type SsotSourceContractEntry = {
  id: string;
  file: string;
  /** 소스에 그대로 존재해야 하는 SSOT_CONTRACT 주석 한 줄 */
  marker: string;
  /** 마커 외 추가로 유지할 문자열 (선택) */
  also?: readonly string[];
};

export const SSOT_SOURCE_CONTRACT_REGISTRY: readonly SsotSourceContractEntry[] = [
  {
    id: "messenger-direct-call-start-gate",
    file: "lib/community-messenger/service.ts",
    marker:
      "SSOT_CONTRACT: messenger-direct-call-start-gate canStartDirectCallBetweenUsers",
  },
  {
    id: "messenger-call-push-block-gate",
    file: "lib/community-messenger/service.ts",
    marker: "SSOT_CONTRACT: messenger-call-push-block ensureNoBlockedEitherWay",
    also: ["ensureNoBlockedEitherWay(recipient, callerId)"],
  },
  {
    id: "messenger-call-accept-block-gate",
    file: "lib/community-messenger/service.ts",
    marker: "SSOT_CONTRACT: messenger-call-accept-block ensureNoBlockedEitherWay",
    also: ['error: "blocked_target"', "ensureNoBlockedEitherWay(initiator, recipient)"],
  },
  {
    id: "messenger-call-terminal-nav",
    file: "components/community-messenger/CommunityMessengerCallClient.tsx",
    marker:
      "SSOT_CONTRACT: messenger-call-terminal-nav finalizeCommunityMessengerCallTerminalExit",
    also: ["beginRingingCallDismiss", "closeTerminalView"],
  },
  {
    id: "messenger-call-init-route",
    file: "app/api/community-messenger/rooms/[roomId]/calls/route.ts",
    marker: "SSOT_CONTRACT: messenger-call-init-route startCommunityMessengerCallSession",
    also: ["startCommunityMessengerCallSession"],
  },
  {
    id: "cm-deep-route-navigation-lock",
    file: "lib/navigation/cm-deep-route-navigation-lock.ts",
    marker:
      "SSOT_CONTRACT: cm-deep-route-navigation-lock beginRoomDeepRouteNavigationLock beginCallDeepRouteNavigationLock",
  },
  {
    id: "cm-call-accept-gateway-patch-owner",
    file: "lib/community-messenger/incoming-call-accept-gateway.ts",
    marker: "SSOT_CONTRACT: cm-call-accept-gateway-patch-owner runIncomingCallAccept acceptIncomingCallOnce",
    also: ["acceptIncomingCallOnce"],
  },
  {
    id: "cm-call-lifecycle-local-release",
    file: "lib/call/release-local-call-lifecycle.ts",
    marker: "SSOT — 통화 종료·취소·언마운트 시 클라 잔류 상태 제거",
    also: ["releaseLocalCallLifecycleForTerminal", "releaseLocalCallLifecycleForTerminalSync"],
  },
  {
    id: "cm-call-lifecycle-local-release-active",
    file: "lib/call/active-call-session.ts",
    marker: "SSOT_CONTRACT: cm-call-lifecycle-local-release releaseLocalCallSession peer PATCH 금지",
    also: ["releaseLocalCallSession", "hardClearActiveCallSession"],
  },
  {
    id: "dibay-signup-consent-only-gate",
    file: "lib/auth/dibay-signup-status.ts",
    marker: "SSOT_CONTRACT: dibay-signup-consent-only-gate signupComplete consentComplete",
    also: ["const signupComplete = consentComplete"],
  },
] as const;
