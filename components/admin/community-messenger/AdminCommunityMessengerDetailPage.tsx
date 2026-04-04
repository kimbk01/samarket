"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { AdminCommunityMessengerRoomDetail } from "@/lib/admin-community-messenger/service";

type DetailResponse = AdminCommunityMessengerRoomDetail & { ok?: boolean };
type RoomAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";
type MessageAction = "hide_message" | "unhide_message";
type ReportAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";

export function AdminCommunityMessengerDetailPage({ roomId }: { roomId: string }) {
  const [detail, setDetail] = useState<AdminCommunityMessengerRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DetailResponse;
      if (res.ok && json.ok) {
        setDetail(json);
      } else {
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (action: RoomAction) => {
      setBusy(action);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, note }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          alert(json.error ?? "처리에 실패했습니다.");
          return;
        }
        setNote("");
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh, roomId]
  );

  const runMessageAction = useCallback(
    async (messageId: string, hidden: boolean) => {
      const key = `${hidden ? "hide" : "unhide"}:${messageId}`;
      setBusy(key);
      try {
        const res = await fetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          alert(json.error ?? "메시지 조치에 실패했습니다.");
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh, roomId]
  );

  const runReportAction = useCallback(
    async (reportId: string, action: ReportAction) => {
      const key = `report:${reportId}:${action}`;
      setBusy(key);
      try {
        const res = await fetch(`/api/admin/community-messenger/reports/${encodeURIComponent(reportId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, adminNote: note }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          alert(json.error ?? "신고 처리에 실패했습니다.");
          return;
        }
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [note, refresh]
  );

  if (loading) {
    return <div className="py-10 text-center text-[14px] text-gray-500">불러오는 중...</div>;
  }

  if (!detail) {
    return <div className="py-10 text-center text-[14px] text-gray-500">메신저 방을 찾을 수 없습니다.</div>;
  }

  const room = detail.room;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="메신저 방 상세"
        backHref="/admin/chats/messenger"
        description="방 상태 조치, 참여자 확인, 메시지 흐름 점검"
      />

      <AdminCard title="방 정보">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="방 제목" value={room.title} />
          <Info label="방 ID" value={room.id} mono />
          <Info label="유형" value={room.roomType === "group" ? "그룹" : "1:1"} />
          <Info label="상태" value={room.roomStatus} />
          <Info label="읽기 전용" value={room.isReadonly ? "ON" : "OFF"} />
          <Info label="생성자" value={room.createdByLabel} />
          <Info label="참여자 수" value={`${room.memberCount}명`} />
          <Info label="최근 메시지 시간" value={formatDateTime(room.lastMessageAt)} />
          <Info label="최근 메시지" value={room.lastMessage} full />
          <Info label="운영 메모" value={room.adminNote || "-"} full />
          <Info label="최근 조치 관리자" value={room.moderatedByLabel} />
          <Info label="최근 조치 시각" value={room.moderatedAt ? formatDateTime(room.moderatedAt) : "-"} />
        </div>
      </AdminCard>

      <AdminCard title="운영 조치">
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="운영 메모를 남기세요"
            className="w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
          <div className="flex flex-wrap gap-2">
            {room.roomStatus !== "blocked" ? (
              <ActionButton busy={busy} action="block_room" label="채팅 차단" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unblock_room" label="차단 해제" onRun={runAction} />
            )}
            {room.roomStatus !== "archived" ? (
              <ActionButton busy={busy} action="archive_room" label="보관" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="unarchive_room" label="보관 해제" onRun={runAction} />
            )}
            {!room.isReadonly ? (
              <ActionButton busy={busy} action="readonly_on" label="읽기 전용" onRun={runAction} />
            ) : (
              <ActionButton busy={busy} action="readonly_off" label="읽기 전용 해제" onRun={runAction} />
            )}
          </div>
        </div>
      </AdminCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard title="참여자">
          <div className="space-y-2">
            {detail.participants.map((participant) => (
              <div key={participant.id} className="rounded border border-gray-100 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-gray-900">{participant.label}</p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      {participant.role} · unread {participant.unreadCount}
                    </p>
                  </div>
                  <div className="text-right text-[12px] text-gray-400">
                    <div>참여 {participant.joinedAt ? formatDateTime(participant.joinedAt) : "-"}</div>
                    <div className="mt-1">읽음 {participant.lastReadAt ? formatDateTime(participant.lastReadAt) : "-"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="최근 통화">
          <div className="space-y-2">
            {detail.calls.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-gray-500">통화 기록이 없습니다.</div>
            ) : (
              detail.calls.map((call) => (
                <div key={call.id} className="rounded border border-gray-100 px-3 py-3">
                  <p className="text-[14px] font-medium text-gray-900">
                    {call.callerLabel} {"->"} {call.peerLabel}
                  </p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {call.callKind} · {call.status} · {call.durationSeconds}초
                  </p>
                  <p className="mt-1 text-[12px] text-gray-400">{formatDateTime(call.startedAt)}</p>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard title="메시지 타임라인">
        <div className="space-y-2">
          {detail.messages.map((message) => (
            <div key={message.id} className="rounded border border-gray-100 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">
                    {message.senderLabel}
                    <span className="ml-2 text-[12px] font-normal text-gray-400">{message.messageType}</span>
                    {message.isHiddenByAdmin ? (
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">숨김</span>
                    ) : null}
                    {message.reportCount > 0 ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                        신고 {message.reportCount}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] text-gray-700">
                    {message.content || "(빈 메시지)"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.isHiddenByAdmin ? (
                      <button
                        type="button"
                        disabled={busy === `unhide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, false)}
                        className="rounded border border-lime-200 bg-lime-50 px-2.5 py-1 text-[12px] text-lime-700"
                      >
                        숨김 해제
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === `hide:${message.id}`}
                        onClick={() => void runMessageAction(message.id, true)}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] text-orange-700"
                      >
                        메시지 숨김
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-[12px] text-gray-400">{formatDateTime(message.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="방 신고 내역">
        <div className="space-y-2">
          {detail.reports.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-gray-500">이 방에 접수된 신고가 없습니다.</div>
          ) : (
            detail.reports.map((report) => (
              <div key={report.id} className="rounded border border-gray-100 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium text-gray-900">
                      {report.reportType} · {report.reporterLabel}
                    </p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      상태 {report.status} · {formatDateTime(report.createdAt)}
                    </p>
                    <p className="mt-1 text-[12px] text-gray-700">
                      {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : ""}
                    </p>
                    {report.adminNote ? (
                      <p className="mt-1 text-[12px] text-amber-700">관리 메모: {report.adminNote}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:reviewing`}
                      onClick={() => void runReportAction(report.id, "reviewing")}
                      className="rounded border border-gray-200 px-2.5 py-1 text-[12px] text-gray-700"
                    >
                      검토중
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:resolved`}
                      onClick={() => void runReportAction(report.id, "resolved")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-700"
                    >
                      해결
                    </button>
                    <button
                      type="button"
                      disabled={busy === `report:${report.id}:rejected`}
                      onClick={() => void runReportAction(report.id, "rejected")}
                      className="rounded border border-gray-200 bg-white px-2.5 py-1 text-[12px] text-gray-700"
                    >
                      기각
                    </button>
                    {report.messageId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_message_hide`}
                        onClick={() => void runReportAction(report.id, "sanction_message_hide")}
                        className="rounded border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] text-orange-700"
                      >
                        메시지 숨김 제재
                      </button>
                    ) : null}
                    {report.roomId ? (
                      <button
                        type="button"
                        disabled={busy === `report:${report.id}:sanction_room_block`}
                        onClick={() => void runReportAction(report.id, "sanction_room_block")}
                        className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[12px] text-red-700"
                      >
                        방 차단 제재
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}

function Info({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-[12px] text-gray-500">{label}</div>
      <div className={`mt-1 text-[14px] text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  busy,
  action,
  label,
  onRun,
}: {
  busy: string | null;
  action: RoomAction;
  label: string;
  onRun: (action: RoomAction) => Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void onRun(action)}
      className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-700 disabled:opacity-50"
    >
      {busy === action ? "처리 중..." : label}
    </button>
  );
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}
