"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;

type ChatSummaryPayload = {
  ok?: boolean;
  meeting_title?: string;
  main_chat_room_id?: string | null;
  extra_room_count?: number;
  private_room_count?: number;
  total_linked_rooms?: number;
  schema_note?: string | null;
  rooms?: Array<{
    room_id: string;
    role: string;
    meeting_chat_room_id?: string | null;
    title: string | null;
    is_private: boolean;
    is_readonly?: boolean | null;
    is_locked?: boolean | null;
    is_blocked?: boolean | null;
    message_count: number;
    hidden_message_count: number;
    report_count: number;
    last_message_at: string | null;
  }>;
  error?: string;
};

export function AdminCommunityEngineMeetingsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insightId, setInsightId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ChatSummaryPayload | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState("");
  const [roomBusyKey, setRoomBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/community/engine/meetings?limit=60", { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; meetings?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "불러오기 실패");
        setRows([]);
        return;
      }
      setRows(j.meetings ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadInsight = async (id: string) => {
    if (insightId === id) {
      setInsightId(null);
      setInsight(null);
      setInsightErr("");
      return;
    }
    setInsightId(id);
    setInsightLoading(true);
    setInsightErr("");
    setInsight(null);
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${encodeURIComponent(id)}/chat-summary`, {
        cache: "no-store",
      });
      const j = (await res.json()) as ChatSummaryPayload;
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "요약 실패");
        return;
      }
      setInsight(j);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setInsightLoading(false);
    }
  };

  const refetchInsight = async (meetingId: string) => {
    if (!meetingId) return;
    setInsightLoading(true);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/chat-summary`, {
        cache: "no-store",
      });
      const j = (await res.json()) as ChatSummaryPayload;
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "요약 갱신 실패");
        return;
      }
      setInsight(j);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setInsightLoading(false);
    }
  };

  const postRoomAction = async (meetingId: string, roomId: string, action: string) => {
    const key = `${meetingId}:${roomId}:${action}`;
    setRoomBusyKey(key);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "채팅 조치 실패");
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const bulkHideRoomMessages = async (meetingId: string, roomId: string) => {
    if (
      !confirm(
        "시스템 메시지를 제외한, 아직 숨기지 않은 메시지를 이 방에서 일괄 숨김 처리합니다. 계속할까요?",
      )
    )
      return;
    setRoomBusyKey(`${meetingId}:bulkhide:${roomId}`);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/messages/bulk-hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "모임 엔진 관리 일괄 숨김" }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; hidden_count?: number };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "일괄 숨김 실패");
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const bulkUnhideRoomMessages = async (meetingId: string, roomId: string) => {
    if (
      !confirm(
        "관리자로 숨김 처리된 비시스템 메시지를 이 방에서 일괄 다시 보이게 합니다. 계속할까요?",
      )
    )
      return;
    setRoomBusyKey(`${meetingId}:bulkunhide:${roomId}`);
    setInsightErr("");
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(roomId)}/messages/bulk-unhide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "모임 엔진 관리 일괄 숨김 해제" }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; unhidden_count?: number };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "일괄 숨김 해제 실패");
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const deleteExtraMeetingChat = async (meetingId: string, mcrId: string) => {
    if (!confirm("이 부가 채팅방과 메시지를 삭제합니다. 계속할까요?")) return;
    setRoomBusyKey(`${meetingId}:del:${mcrId}`);
    setInsightErr("");
    try {
      const res = await fetch(
        `/api/admin/community/engine/meetings/${encodeURIComponent(meetingId)}/meeting-chat-rooms/${encodeURIComponent(mcrId)}`,
        { method: "DELETE" },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setInsightErr(j.error ?? "삭제 실패");
        return;
      }
      await refetchInsight(meetingId);
    } catch (e) {
      setInsightErr((e as Error).message);
    } finally {
      setRoomBusyKey(null);
    }
  };

  const patch = async (id: string, body: { status?: string; maxMembers?: number }) => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setErr(j.error ?? "실패");
      else await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-ui-rect border border-gray-300 bg-white px-3 py-1.5 text-[13px]"
      >
        새로고침
      </button>
      {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
        <table className="min-w-full text-left text-[12px] text-gray-800">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-2">제목</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2">참여 방식</th>
              <th className="px-2 py-2">정원</th>
              <th className="px-2 py-2">채팅방</th>
              <th className="px-2 py-2">액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              const isSample = r.is_sample_data === true;
              const ep = String(r.entry_policy ?? r.join_policy ?? "open");
              const entryLabel =
                ep === "approve"
                  ? "승인제"
                  : ep === "invite_only"
                    ? "초대·승인"
                    : ep === "password"
                      ? "비밀번호"
                      : "오픈";
              return (
                <Fragment key={id}>
                  <tr className="border-t border-gray-100">
                    <td className="max-w-[180px] truncate px-2 py-2">
                      {String(r.title ?? "")}
                      {isSample ? (
                        <span className="ml-1 rounded bg-signature/10 px-1 py-0.5 text-[10px] text-gray-800" title="is_sample_data=true">
                          DB샘플
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{String(r.status ?? "")}</td>
                    <td className="px-2 py-2 text-[11px] text-gray-700">
                      {entryLabel}
                      {ep === "password" && r.has_password ? (
                        <span className="ml-1 text-emerald-700">설정됨</span>
                      ) : null}
                      {ep === "password" && !r.has_password ? (
                        <span className="ml-1 text-amber-700">비번 미설정</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{String(r.max_members ?? "")}</td>
                    <td className="max-w-[120px] truncate px-2 py-2 font-mono text-[10px]">
                      {r.chat_room_id != null ? String(r.chat_room_id) : "—"}
                    </td>
                    <td className="flex flex-wrap gap-1 px-2 py-2">
                      <button
                        type="button"
                        disabled={insightLoading}
                        className={`rounded px-2 py-0.5 ${insightId === id ? "bg-signature/20" : "bg-signature/5"}`}
                        onClick={() => void loadInsight(id)}
                      >
                        {insightId === id ? "요약 닫기" : "채팅 요약"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-red-100 px-2 py-0.5"
                        onClick={() => void patch(id, { status: "ended" })}
                      >
                        종료
                      </button>
                      <button
                        type="button"
                        disabled={busyId === id}
                        className="rounded bg-sky-100 px-2 py-0.5"
                        onClick={() => void patch(id, { status: "open" })}
                      >
                        열기
                      </button>
                    </td>
                  </tr>
                  {insightId === id ? (
                    <tr className="border-t border-gray-200 bg-signature/5">
                      <td colSpan={6} className="px-3 py-3 text-[12px] text-gray-800">
                        {insightLoading ? (
                          <p className="text-gray-500">불러오는 중…</p>
                        ) : insightErr ? (
                          <p className="text-red-600">{insightErr}</p>
                        ) : insight ? (
                          <div className="space-y-2">
                            <p className="font-semibold text-gray-900">모임 채팅 검토</p>
                            <p className="text-[11px] text-gray-600">
                              연결된 채팅{" "}
                              <span className="font-mono">{insight.total_linked_rooms ?? 0}</span>개 · 부가 방{" "}
                              <span className="font-mono">{insight.extra_room_count ?? 0}</span> · 비공개{" "}
                              <span className="font-mono">{insight.private_room_count ?? 0}</span>
                            </p>
                            {insight.schema_note ? (
                              <p className="text-[11px] text-amber-800">{insight.schema_note}</p>
                            ) : null}
                            <ul className="space-y-1.5 border-t border-gray-200 pt-2">
                              {(insight.rooms ?? []).map((room) => {
                                const mid = insightId ?? "";
                                const ro = room.is_readonly === true;
                                const lk = room.is_locked === true;
                                const blk = room.is_blocked === true;
                                const mcr = room.meeting_chat_room_id ?? null;
                                const isExtra = room.role !== "main" && !!mcr;
                                return (
                                  <li
                                    key={room.room_id}
                                    className="flex flex-col gap-2 rounded border border-white/80 bg-white/90 px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
                                  >
                                    <div className="min-w-0">
                                      <span className="font-medium">
                                        {room.title ?? room.room_id.slice(0, 8)}
                                      </span>
                                      <span className="ml-2 text-[10px] text-gray-500">
                                        {room.role === "main" ? "기본" : "부가"}
                                        {room.is_private ? " · 비공개" : ""}
                                        {ro ? " · 읽기전용" : ""}
                                        {lk ? " · 잠금" : ""}
                                        {blk ? " · 차단" : ""}
                                      </span>
                                      <div className="mt-0.5 font-mono text-[10px] text-gray-400">{room.room_id}</div>
                                    </div>
                                    <div className="shrink-0 text-[11px] text-gray-600">
                                      <div className="text-right">
                                        메시지 {room.message_count} · 숨김 {room.hidden_message_count} · 신고{" "}
                                        {room.report_count}
                                        {room.last_message_at ? (
                                          <div className="text-[10px] text-gray-400">
                                            마지막 {new Date(room.last_message_at).toLocaleString("ko-KR")}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 flex flex-wrap justify-end gap-1">
                                        <Link
                                          href={`/admin/chats/${encodeURIComponent(room.room_id)}`}
                                          className="rounded bg-signature/5 px-2 py-0.5 text-gray-800 underline-offset-2 hover:underline"
                                        >
                                          관리자 채팅
                                        </Link>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-orange-50 px-2 py-0.5 text-orange-900"
                                          onClick={() => void bulkHideRoomMessages(mid, room.room_id)}
                                        >
                                          메시지 일괄 숨김
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-lime-50 px-2 py-0.5 text-lime-900"
                                          onClick={() => void bulkUnhideRoomMessages(mid, room.room_id)}
                                        >
                                          숨김 일괄 해제
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-amber-50 px-2 py-0.5 text-amber-900"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, ro ? "readonly_off" : "readonly_on")
                                          }
                                        >
                                          {ro ? "읽기전용 해제" : "읽기전용"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-slate-100 px-2 py-0.5 text-slate-800"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, lk ? "unarchive_room" : "archive_room")
                                          }
                                        >
                                          {lk ? "잠금 해제" : "잠금"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!!roomBusyKey || insightLoading}
                                          className="rounded bg-rose-50 px-2 py-0.5 text-rose-900"
                                          onClick={() =>
                                            void postRoomAction(mid, room.room_id, blk ? "unblock_room" : "block_room")
                                          }
                                        >
                                          {blk ? "차단 해제" : "방 차단"}
                                        </button>
                                        {isExtra ? (
                                          <button
                                            type="button"
                                            disabled={!!roomBusyKey || insightLoading}
                                            className="rounded bg-red-50 px-2 py-0.5 text-red-800"
                                            onClick={() => void deleteExtraMeetingChat(mid, mcr!)}
                                          >
                                            부가 방 삭제
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            {(insight.rooms ?? []).length === 0 ? (
                              <p className="text-[11px] text-gray-500">연결된 채팅방이 없습니다.</p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
