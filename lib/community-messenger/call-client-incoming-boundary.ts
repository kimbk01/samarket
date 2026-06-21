/**
 * CallClient ↔ 수신 UI 경계 (SSOT).
 *
 * | 영역 | 소유 | 금지 |
 * |------|------|------|
 * | 앱 안 ringing 수신 UI | `CommunityMessengerIncomingCallUi` + `IncomingCallBanner` | CallClient 에 IncomingCallView·벨 UI 금지 |
 * | 수락 후 통화 화면 | `CommunityMessengerCallClient` | 수신 배너·native pill 정책을 CallClient 에 섞지 않음 |
 *
 * DO NOT: 수신 UI 수정 시 Agora·join·terminal 로직을 건드리지 않는다.
 * DO NOT: 통화 화면 수정 시 `incoming-ui-ssot.ts`·Global 배너를 덮어쓰지 않는다.
 */

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CalleeAcceptUiInput = {
  isMineInitiator: boolean;
  status: CommunityMessengerCallSession["status"];
  requestedAction: string | null;
  busy: string | null;
  calleeVideoConnectingShell: boolean;
  nativeAcceptOwnedRoute: boolean;
  joined: boolean;
};

/** 수락 PATCH/조인 in-flight — Surface 는 벨 UI 대신 connecting 만 */
export function isCalleeAcceptInFlightUi(input: CalleeAcceptUiInput): boolean {
  if (input.isMineInitiator) return false;
  if (
    !input.joined &&
    input.status === "active" &&
    (input.calleeVideoConnectingShell ||
      input.requestedAction === "accept" ||
      input.nativeAcceptOwnedRoute)
  ) {
    return true;
  }
  if (
    input.status === "ringing" &&
    (input.requestedAction === "accept" ||
      input.busy === "accept" ||
      input.busy === "join" ||
      input.calleeVideoConnectingShell)
  ) {
    return true;
  }
  return false;
}

/** accept route 진입 직후 ringing → connecting 브릿지 (IncomingCallView 재등장 방지) */
export function isCalleeAcceptBridgeLayout(input: CalleeAcceptUiInput): boolean {
  return (
    !input.isMineInitiator &&
    input.status === "ringing" &&
    (input.requestedAction === "accept" ||
      input.busy === "accept" ||
      input.calleeVideoConnectingShell)
  );
}

export function shouldClaimCallScreenSurfaceForCalleeAccept(args: {
  isMineInitiator: boolean;
  status: CommunityMessengerCallSession["status"];
  requestedAction: string | null;
  calleeVideoConnectingShell: boolean;
}): boolean {
  if (args.isMineInitiator) return false;
  return (
    args.requestedAction === "accept" &&
    (args.status === "ringing" ||
      args.status === "active" ||
      args.calleeVideoConnectingShell)
  );
}

/**
 * 수락 전 `/calls/:id` ringing callee — Global 배너만. IncomingCallView 전체화면 금지.
 */
export function shouldEjectCalleeFromRingingCallRoute(args: {
  isMineInitiator: boolean;
  status: CommunityMessengerCallSession["status"];
  requestedAction: string | null;
  busyAccept: boolean;
  calleeVideoConnectingShell: boolean;
}): boolean {
  if (args.isMineInitiator) return false;
  if (args.status !== "ringing") return false;
  if (args.requestedAction === "accept") return false;
  if (args.busyAccept || args.calleeVideoConnectingShell) return false;
  return true;
}
