"use client";

/**
 * `CommunityMessengerRoomClient` 전용 뷰·포맷·아이콘 — 본 파일은 상태·실시간·전송 오케스트레이션에 집중한다.
 * (신규 UI는 가능하면 여기 또는 `room/` 하위 모듈로 추가.)
 */
import type { ReactNode } from "react";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { parseVoiceWaveformPeaksFromMetadata } from "@/lib/community-messenger/voice-waveform";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";

/** 녹음 경과 시간 — 1/10000초(0.0001s) 단위까지 표시 */
export function formatVoiceRecordTenThousandths(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  let rem = totalSec - m * 60;
  if (rem >= 60) rem = 59.9999;
  let s = Math.floor(rem);
  const frac = rem - s;
  let tenK = Math.round(frac * 10000);
  if (tenK >= 10000) {
    tenK = 0;
    s += 1;
  }
  if (s >= 60) {
    return `${m + 1}:00.0000`;
  }
  return `${m}:${String(s).padStart(2, "0")}.${String(tenK).padStart(4, "0")}`;
}

export function VoiceRecordingLiveWaveform({ peaks, className }: { peaks: number[]; className?: string }) {
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 36 }, () => 0.08);
  return (
    <div
      className={`flex h-7 min-w-0 flex-1 items-end justify-between gap-[1px] px-0.5 ${className ?? ""}`}
    >
      {bars.map((p, i) => {
        const h = 4 + Math.round(Math.min(1, p) * 22);
        return (
          <div
            key={i}
            className="w-[2px] max-w-[2px] shrink-0 rounded-full bg-sam-muted/55"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export function communityMessengerMessageSearchText(m: CommunityMessengerMessage & { pending?: boolean }): string {
  if (m.messageType === "call_stub") return m.callKind === "video" ? "영상 통화" : "음성 통화";
  if (m.messageType === "voice") return "음성 메시지";
  if (m.messageType === "file") return m.fileName?.trim() || "파일";
  if (m.messageType === "image") return m.content.trim() || "사진";
  return m.content;
}

export function looksLikeDirectImageUrl(raw: string): boolean {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i.test(t);
}

export function extractHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi);
  return matches ?? [];
}

export function communityMessengerVoiceAudioSrc(
  roomId: string,
  item: CommunityMessengerMessage & { pending?: boolean }
): string {
  const content = item.content.trim();
  if (item.pending && content.startsWith("blob:")) {
    return content;
  }
  const id = String(item.id ?? "").trim();
  if (!id || id.startsWith("pending:")) {
    return "";
  }
  return `${communityMessengerRoomResourcePath(roomId)}/messages/${encodeURIComponent(id)}/audio`;
}

export function mergeRoomMessages(
  prev: Array<CommunityMessengerMessage & { pending?: boolean }>,
  next: CommunityMessengerMessage[]
): Array<CommunityMessengerMessage & { pending?: boolean }> {
  const mergedConfirmed = new Map<string, CommunityMessengerMessage & { pending?: boolean }>();
  for (const item of prev) {
    if (item.pending) continue;
    mergedConfirmed.set(item.id, item);
  }
  for (const item of next) {
    mergedConfirmed.set(item.id, {
      ...mergedConfirmed.get(item.id),
      ...item,
      pending: false,
    });
  }
  const pending = prev.filter((item) => item.pending);
  const mergedPending = pending.filter((item) => {
    return !next.some((confirmedItem) => {
      if (confirmedItem.senderId !== item.senderId || confirmedItem.messageType !== item.messageType) return false;
      const cidA = typeof confirmedItem.clientMessageId === "string" ? confirmedItem.clientMessageId.trim() : "";
      const cidB = typeof item.clientMessageId === "string" ? item.clientMessageId.trim() : "";
      if (cidA && cidB && cidA === cidB) return true;
      const dt = Math.abs(new Date(confirmedItem.createdAt).getTime() - new Date(item.createdAt).getTime());
      if (item.messageType === "voice" && item.pending) {
        return dt < 15_000;
      }
      if (item.messageType === "file" && item.pending) {
        return confirmedItem.fileName === item.fileName && dt < 15_000;
      }
      return confirmedItem.content === item.content && dt < 15_000;
    });
  });
  return [...mergedConfirmed.values(), ...mergedPending].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    // Stable order for equal timestamps: pending at end, then by id.
    if (Boolean((a as any).pending) !== Boolean((b as any).pending)) return (a as any).pending ? 1 : -1;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

export function getLatestCallStubForSession(
  messages: Array<CommunityMessengerMessage & { pending?: boolean }>,
  sessionId: string
): CommunityMessengerMessage | null {
  let best: CommunityMessengerMessage | null = null;
  for (const m of messages) {
    if (m.pending) continue;
    if (m.messageType !== "call_stub") continue;
    const sid = m.callSessionId?.trim();
    if (!sid || !messengerUserIdsEqual(sid, sessionId)) continue;
    if (!best || new Date(m.createdAt).getTime() > new Date(best.createdAt).getTime()) {
      best = m;
    }
  }
  return best;
}

/** Viber 톤 — 브랜드 보라 발신 / 화이트 수신. `showTail`: 새 덩어리(프로필 옆)만 꼬리 표시 */
export function ViberChatBubble({
  isMine,
  showTail,
  children,
}: {
  isMine: boolean;
  showTail: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`sam-bubble ${isMine ? "sam-bubble--outgoing" : "sam-bubble--incoming"}`}
      style={{
        borderRadius: "var(--cm-room-radius-bubble)",
      }}
    >
      {showTail ? (
        !isMine ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -left-[8px] top-[8px] z-[1] h-0 w-0 border-y-[9px] border-y-transparent border-r-[11px]"
            style={{ borderRightColor: "var(--cm-room-bubble-incoming)" }}
          />
        ) : (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-[8px] top-[8px] z-[1] h-0 w-0 border-y-[9px] border-y-transparent border-l-[11px]"
            style={{ borderLeftColor: "var(--cm-room-bubble-outgoing)" }}
          />
        )
      ) : null}
      {children}
    </div>
  );
}

export function communityMessengerMemberAvatar(
  members: CommunityMessengerProfileLite[],
  senderId: string | null | undefined
): { avatarUrl: string | null; initials: string } | null {
  if (!senderId) return null;
  const member = members.find((m) => m.id === senderId);
  if (!member) return { avatarUrl: null, initials: "?" };
  const avatarUrl =
    member.identityMode === "alias" && member.aliasProfile?.avatarUrl
      ? member.aliasProfile.avatarUrl
      : member.avatarUrl;
  const rawLabel =
    member.identityMode === "alias" && member.aliasProfile?.displayName?.trim()
      ? member.aliasProfile.displayName.trim()
      : member.label.trim();
  const compact = rawLabel.replace(/\s+/g, "");
  const initials = compact[0] ?? "?";
  return { avatarUrl, initials };
}

export function mapRealtimeRoomMessage(
  snapshot: CommunityMessengerRoomSnapshot,
  membersForSender: CommunityMessengerProfileLite[],
  message: {
    id: string;
    roomId: string;
    senderId: string | null;
    messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice";
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }
): CommunityMessengerMessage {
  const sender = message.senderId ? membersForSender.find((member) => member.id === message.senderId) : null;
  const callKind =
    message.metadata.callKind === "video" || message.metadata.callKind === "voice"
      ? message.metadata.callKind
      : null;
  const callStatus =
    message.metadata.callStatus === "missed" ||
    message.metadata.callStatus === "rejected" ||
    message.metadata.callStatus === "cancelled" ||
    message.metadata.callStatus === "ended" ||
    message.metadata.callStatus === "incoming" ||
    message.metadata.callStatus === "dialing"
      ? message.metadata.callStatus
      : null;
  const voiceDurationSeconds =
    message.messageType === "voice"
      ? Math.max(0, Math.floor(Number(message.metadata.durationSeconds ?? 0)) || 0)
      : undefined;
  const voiceWaveformPeaks =
    message.messageType === "voice"
      ? parseVoiceWaveformPeaksFromMetadata(message.metadata.waveformPeaks) ?? null
      : undefined;
  const voiceMimeType =
    message.messageType === "voice" ? (String(message.metadata.mimeType ?? "").trim() || null) : undefined;
  const fileName = message.messageType === "file" ? (String(message.metadata.fileName ?? "").trim() || null) : undefined;
  const fileMimeType = message.messageType === "file" ? (String(message.metadata.mimeType ?? "").trim() || null) : undefined;
  const fileSizeBytes =
    message.messageType === "file" ? Math.max(0, Math.floor(Number(message.metadata.fileSizeBytes ?? 0)) || 0) : undefined;
  const callSessionIdRaw = message.metadata.sessionId;
  const callSessionId =
    typeof callSessionIdRaw === "string" && callSessionIdRaw.trim() ? callSessionIdRaw.trim() : null;
  const clientMessageId =
    typeof message.metadata.client_message_id === "string" && message.metadata.client_message_id.trim()
      ? message.metadata.client_message_id.trim()
      : null;
  return {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    senderLabel: sender?.label ?? (message.senderId === snapshot.viewerUserId ? "나" : "상대"),
    messageType: message.messageType,
    content: message.content,
    createdAt: message.createdAt,
    clientMessageId,
    isMine: message.senderId === snapshot.viewerUserId,
    callKind,
    callStatus,
    callSessionId,
    ...(voiceDurationSeconds !== undefined ? { voiceDurationSeconds } : {}),
    ...(voiceWaveformPeaks !== undefined ? { voiceWaveformPeaks } : {}),
    ...(voiceMimeType !== undefined ? { voiceMimeType } : {}),
    ...(fileName !== undefined ? { fileName } : {}),
    ...(fileMimeType !== undefined ? { fileMimeType } : {}),
    ...(fileSizeBytes !== undefined ? { fileSizeBytes } : {}),
  };
}

export function formatFileMeta(mimeType?: string | null, fileSizeBytes?: number | null): string {
  const parts: string[] = [];
  const mime = String(mimeType ?? "").trim();
  const size = Number(fileSizeBytes ?? 0);
  if (mime) parts.push(mime);
  if (size > 0) parts.push(formatFileSize(size));
  return parts.join(" · ") || "첨부 파일";
}

export function formatFileSize(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)}KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatRoomCallStatus(status?: string | null): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  if (status === "dialing") return "발신 중";
  return "상태 확인 중";
}

export function formatDuration(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatParticipantStatus(value: "invited" | "joined" | "left" | "rejected"): string {
  if (value === "joined") return "참여 중";
  if (value === "invited") return "대기";
  if (value === "rejected") return "거절";
  return "종료";
}

export function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SendPlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function MicHoldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

export function TrashVoiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

export function SendVoiceArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

export function VoiceCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VideoCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="6" width="14" height="12" rx="2" strokeLinejoin="round" />
      <path d="M22 8v8l-5-3.2V11.2L22 8z" strokeLinejoin="round" />
    </svg>
  );
}

export function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h4" strokeLinecap="round" />
    </svg>
  );
}
