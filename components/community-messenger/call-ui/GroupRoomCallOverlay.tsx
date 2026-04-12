"use client";

/* eslint-disable react-hooks/refs -- `CommunityMessengerGroupCallHandle`는 훅 반환 객체이며 ref가 아님; `.call*`·`panel` 등 접근이 오탐으로 걸립니다. */

import type { CommunityMessengerCallParticipant } from "@/lib/community-messenger/types";
import type { CommunityMessengerGroupCallHandle } from "@/lib/community-messenger/use-community-messenger-group-call";
import type { MessageKey } from "@/lib/i18n/messages";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { CallPrimaryButton } from "./CallButtons";

type PermissionGuide = ReturnType<typeof getCommunityMessengerPermissionGuide>;

export type GroupRoomCallOverlayProps = {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
  isGroupRoom: boolean;
  groupPrefix: string;
  groupCall: CommunityMessengerGroupCallHandle;
  permissionGuide: PermissionGuide | null;
  formatDuration: (seconds: number) => string;
  formatParticipantStatus: (status: CommunityMessengerCallParticipant["status"]) => string;
  onOpenCallPermissionHelp: () => void;
  onRetryCallDevicePermission: () => void | Promise<void>;
  onAcceptIncomingCall: () => void | Promise<unknown>;
};

export function GroupRoomCallOverlay({
  t,
  tt,
  isGroupRoom,
  groupPrefix,
  groupCall,
  permissionGuide,
  formatDuration,
  formatParticipantStatus,
  onOpenCallPermissionHelp,
  onRetryCallDevicePermission,
  onAcceptIncomingCall,
}: GroupRoomCallOverlayProps) {
  const sessionPanel = groupCall.panel;
  if (!sessionPanel) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(17,16,35,0.45)] px-4 pb-4 backdrop-blur-[2px] sm:items-center sm:pb-0">
      <div
        data-messenger-shell
        className="w-full max-w-[420px] rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-5 pb-5 pt-6 shadow-[var(--messenger-shadow-soft)]"
        style={{ color: "var(--messenger-text)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className="rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{
              backgroundColor: "var(--messenger-primary-soft)",
              color: "var(--messenger-primary)",
            }}
          >
            {isGroupRoom ? groupPrefix : ""}
            {sessionPanel.kind === "video" ? t("nav_video_call_label") : t("nav_voice_call_label")}
          </span>
          {sessionPanel.mode === "active" ? (
            <span className="rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-1 text-[12px] font-semibold text-[color:var(--messenger-text)]">
              {formatDuration(groupCall.elapsedSeconds)}
            </span>
          ) : null}
        </div>

        <div className="mt-5 overflow-hidden rounded-ui-rect bg-black">
          {sessionPanel.kind === "video" ? (
            <div className="relative min-h-[250px] bg-black">
              {groupCall.localStream ? (
                <video ref={groupCall.localVideoRef} autoPlay muted playsInline className="h-[250px] w-full bg-black object-cover" />
              ) : (
                <div className="flex h-[250px] flex-col items-center justify-center gap-3 bg-sam-ink px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-ui-rect border border-sam-surface/12 bg-sam-surface/5 text-[12px] font-semibold text-white">
                    VIDEO
                  </div>
                  <p className="text-[13px] text-white/75">{sessionPanel.mode === "incoming" ? "참여 준비" : "영상 준비"}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-[250px] flex-col items-center justify-center gap-4 bg-sam-ink">
              <div className="flex h-24 w-24 items-center justify-center rounded-ui-rect border border-sam-surface/12 bg-sam-surface/5 text-[26px] font-semibold text-white">
                MIC
              </div>
              <p className="text-[13px] text-white/70">{sessionPanel.mode === "incoming" ? "참여 준비" : "음성 준비"}</p>
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <h2 className="text-[22px] font-semibold sm:text-[24px]" style={{ color: "var(--messenger-text)" }}>
            {sessionPanel.peerLabel}
          </h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {groupCall.callStatusLabel}
          </p>
          {groupCall.connectionBadge ? (
            <p className="mt-3 inline-flex rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-1 text-[12px] font-semibold text-[color:var(--messenger-text)]">
              {groupCall.connectionBadge.label}
            </p>
          ) : null}
          {isGroupRoom && groupCall.participants.length ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {groupCall.participants.map((participant) => (
                <span
                  key={participant.userId}
                  className="rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 py-1 text-[11px] font-semibold text-[color:var(--messenger-text)]"
                >
                  {participant.label} · {tt(formatParticipantStatus(participant.status))}
                </span>
              ))}
            </div>
          ) : null}
          {isGroupRoom && groupCall.remotePeers.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {groupCall.remotePeers.map((peer) => (
                <div key={peer.userId} className="overflow-hidden rounded-ui-rect bg-black">
                  <video
                    ref={(node) => {
                      groupCall.bindRemoteVideo(peer.userId, node);
                    }}
                    autoPlay
                    playsInline
                    className="h-24 w-full bg-black object-cover"
                  />
                  <p className="px-2 py-2 text-[11px] text-white/75">{peer.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {groupCall.errorMessage ? (
          <div className="mt-4 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] p-4 text-left">
            <p className="text-[13px] font-semibold" style={{ color: "var(--messenger-text)" }}>
              {groupCall.errorMessage}
            </p>
            {permissionGuide?.description ? (
              <p className="mt-2 text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
                {permissionGuide.description}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void onRetryCallDevicePermission()}
                disabled={groupCall.busy === "call-start" || groupCall.busy === "call-accept" || groupCall.busy === "device-prepare"}
                className="flex-1 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] font-semibold disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
                style={{ color: "var(--messenger-text)" }}
              >
                {groupCall.busy === "call-start" || groupCall.busy === "call-accept" || groupCall.busy === "device-prepare"
                  ? t("nav_messenger_checking")
                  : permissionGuide?.retryLabel ?? t("nav_messenger_permission_check")}
              </button>
              <button
                type="button"
                onClick={onOpenCallPermissionHelp}
                className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] font-medium active:bg-[color:var(--messenger-primary-soft)]"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                {permissionGuide?.settingsLabel ?? t("nav_messenger_permission_guide")}
              </button>
            </div>
          </div>
        ) : (sessionPanel.mode === "dialing" || sessionPanel.mode === "connecting") && !groupCall.localStream ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void onRetryCallDevicePermission()}
              disabled={groupCall.busy === "call-start" || groupCall.busy === "call-accept" || groupCall.busy === "device-prepare"}
              className="flex-1 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] font-semibold disabled:opacity-40 active:bg-[color:var(--messenger-primary-soft)]"
              style={{ color: "var(--messenger-text)" }}
            >
              {groupCall.busy === "call-start" || groupCall.busy === "call-accept" || groupCall.busy === "device-prepare"
                ? t("nav_messenger_checking")
                : permissionGuide?.retryLabel ?? t("nav_messenger_permission_check")}
            </button>
            <button
              type="button"
              onClick={onOpenCallPermissionHelp}
              className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] font-medium active:bg-[color:var(--messenger-primary-soft)]"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {permissionGuide?.settingsLabel ?? t("nav_messenger_permission_guide")}
            </button>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-[0.02em]" style={{ color: "var(--messenger-text-secondary)" }}>
              통화 제어
            </p>
            <p className="text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
              {sessionPanel.mode === "incoming"
                ? "응답 대기"
                : sessionPanel.mode === "dialing" || sessionPanel.mode === "connecting"
                  ? "연결 준비 중"
                  : "통화 진행 중"}
            </p>
          </div>
          <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] p-3">
            {sessionPanel.mode === "incoming" ? (
              <div className="grid grid-cols-2 gap-2">
                <CallPrimaryButton
                  variant="outline"
                  onClick={() => void groupCall.rejectIncomingCall()}
                  disabled={groupCall.busy === "call-reject"}
                  className="!font-medium"
                >
                  거절
                </CallPrimaryButton>
                <CallPrimaryButton
                  variant="solid"
                  onClick={() => void onAcceptIncomingCall()}
                  disabled={groupCall.busy === "call-accept"}
                >
                  받기
                </CallPrimaryButton>
              </div>
            ) : sessionPanel.mode === "dialing" || sessionPanel.mode === "connecting" ? (
              <div className="grid gap-2">
                <CallPrimaryButton
                  variant="outline"
                  onClick={() => {
                    if (sessionPanel.sessionId) {
                      void groupCall.cancelOutgoingCall();
                      return;
                    }
                    groupCall.dismissPanel();
                  }}
                  disabled={sessionPanel.sessionId ? groupCall.busy === "call-cancel" : false}
                >
                  통화 취소
                </CallPrimaryButton>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className={`grid gap-2 ${groupCall.connectionBadge?.tone === "poor" ? "grid-cols-2" : "grid-cols-1"}`}>
                  <CallPrimaryButton variant="outline" onClick={() => void groupCall.endActiveCall()} disabled={groupCall.busy === "call-end"}>
                    통화 종료
                  </CallPrimaryButton>
                  {groupCall.connectionBadge?.tone === "poor" ? (
                    <CallPrimaryButton variant="outline" onClick={() => void groupCall.retryConnection()} disabled={groupCall.busy === "call-retry"} className="!font-medium">
                      다시 연결
                    </CallPrimaryButton>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
        {sessionPanel.kind !== "video"
          ? groupCall.remotePeers.map((peer) => (
              <audio
                key={`audio:${peer.userId}`}
                ref={(node) => {
                  bindMediaStreamToElement(node, peer.stream);
                }}
                autoPlay
                playsInline
                className="hidden"
              />
            ))
          : null}
      </div>
    </div>
  );
}
