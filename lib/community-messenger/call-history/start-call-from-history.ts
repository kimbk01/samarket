"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { alertOutgoingCallFailure } from "@/lib/community-messenger/call-outgoing-failure-alert";
import {
  guardInstantOutgoingCallStart,
  isOutgoingCallPhoneVerificationRequired,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { resolveCallHistoryRedialRoomClient } from "@/lib/community-messenger/call-history/call-history-redial-room-client";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

/**
 * 통화 기록에서 다시 걸기 — 통화 탭(`MessengerCallLogsPanel`)과 홈 telRING 칸이 **같은 함수**를 쓴다
 * (홈 설계 v2 §3-5·§6, 통화 변경 규정: 동작 변경 없이 통화 탭 안 함수를 옮기기만 함).
 * 순서: 상대·방 확인 → `guardInstantOutgoingCallStart` → `POST /calls/redial-room`(통화 가능 여부·정규 방은 서버가 결정)
 * → `launchOutgoingDirectCall`. 기록 이름·문구·실패 알림은 옮기기 전과 같다.
 */

export function sanitizeCallPeerUserId(peerUserId: string | null | undefined): string | null {
  const raw = peerUserId?.trim() ?? "";
  if (!raw || raw.startsWith("peer:") || raw.startsWith("room:")) return null;
  return raw;
}

export function resolveCallPeerRoomId(peerUserId: string, roomId: string | null | undefined): string | null {
  const direct = roomId?.trim();
  if (direct) return direct;
  const peer = peerUserId.trim();
  if (peer.startsWith("room:")) return peer.slice(5).trim() || null;
  return null;
}

export type StartCallFromHistoryInput = {
  call: CommunityMessengerCallLog;
  kind: "voice" | "video";
  peerLabel: string;
  router: AppRouterInstance;
  /** 통화 탭 상대 상세에서 연 경우의 상대·방 (없으면 null) */
  detailPeerUserId?: string | null;
  detailRoomId?: string | null;
  missingRoomMessage: string;
  networkErrorMessage: string;
  /** 가드 통과 직후(비동기 시작 전) — 통화 탭: 진행 중 표시·시트 닫기 */
  onStart: () => void;
  /** 가드에서 막힘(전화 인증 필요 제외) — 통화 탭: 시트 닫기 */
  onBlocked: () => void;
  /** 비동기 끝(성공·실패 모두) */
  onDone: () => void;
};

/** 다시 걸기 — 시작했으면 true, 상대·방이 없거나 가드에서 막히면 false */
export function startCallFromHistory(input: StartCallFromHistoryInput): boolean {
  const { call, kind, router } = input;
  const vm = presentCallHistoryRow(call);
  const peerUserId =
    sanitizeCallPeerUserId(call.peerUserId) ??
    sanitizeCallPeerUserId(vm.peerUserId) ??
    sanitizeCallPeerUserId(input.detailPeerUserId);
  /** 기록의 방은 "후보"일 뿐 — 통화 가능 여부·canonical 대체는 서버(`/calls/redial-room`)가 결정. */
  const historicRoomId =
    call.roomId?.trim() || resolveCallPeerRoomId(input.detailPeerUserId ?? "", input.detailRoomId) || null;

  if (!peerUserId && !historicRoomId) {
    alertOutgoingCallFailure(input.missingRoomMessage);
    return false;
  }

  const guard = guardInstantOutgoingCallStart({ peerUserId, kind: kind, roomId: historicRoomId });
  if (!guard.ok) {
    if (isOutgoingCallPhoneVerificationRequired(guard)) return false;
    input.onBlocked();
    /** 홈 `startDirectCall` 과 동일 — 진행 중 통화가 있으면 그 통화 화면으로. */
    if (guard.blockedCallId) navigateBlockedOutgoingCall(router, guard.blockedCallId);
    else alertOutgoingCallFailure(guard.userMessage);
    return false;
  }

  input.onStart();

  logCallV4("video_confirm_clicked", {
    kind: kind,
    peerUserId: peerUserId || undefined,
    roomId: historicRoomId || undefined,
  });

  void (async () => {
    try {
      const resolved = await resolveCallHistoryRedialRoomClient({ peerUserId, roomId: historicRoomId });
      if (!resolved.ok) {
        logCallV4("video_confirm_redial_room_failed", {
          kind: kind,
          peerUserId: peerUserId || undefined,
          roomId: historicRoomId || undefined,
          error: resolved.error,
        });
        if (!resolved.phoneVerificationRequired) alertOutgoingCallFailure(resolved.userMessage);
        return;
      }
      logCallV4("video_confirm_launch_with_room", {
        kind: kind,
        peerUserId: peerUserId || undefined,
        roomId: resolved.roomId,
        historicRoomId: historicRoomId || undefined,
        source: resolved.source,
      });
      const result = await launchOutgoingDirectCall(
        {
          kind: kind,
          roomId: resolved.roomId,
          peerUserId: peerUserId || undefined,
          peerLabel: input.peerLabel,
        },
        router
      );
      if (!result.ok) {
        if (isOutgoingCallPhoneVerificationRequired(result)) return;
        alertOutgoingCallFailure(result.userMessage);
      }
    } catch {
      alertOutgoingCallFailure(input.networkErrorMessage);
    } finally {
      input.onDone();
    }
  })();
  return true;
}
