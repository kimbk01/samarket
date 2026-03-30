"use client";

import { useState } from "react";
import type { AdminChatRoom } from "@/lib/types/admin-chat";

type PanelAction =
  | "warn"
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";

type BulkMsgAction = "bulk_hide" | "bulk_unhide";

interface AdminChatActionPanelProps {
  room: AdminChatRoom;
  onActionSuccess: () => void;
}

export function AdminChatActionPanel({
  room,
  onActionSuccess,
}: AdminChatActionPanelProps) {
  const [loading, setLoading] = useState<PanelAction | BulkMsgAction | null>(null);
  const [note, setNote] = useState("");

  const runBulkMessages = async (kind: BulkMsgAction) => {
    const isHide = kind === "bulk_hide";
    if (
      !confirm(
        isHide
          ? "시스템 메시지를 제외한, 아직 숨기지 않은 메시지를 이 방에서 일괄 숨김 처리합니다. 계속할까요?"
          : "관리자로 숨김 처리된 비시스템 메시지를 이 방에서 일괄 다시 보이게 합니다. 계속할까요?",
      )
    ) {
      return;
    }
    setLoading(kind);
    try {
      const path = isHide ? "bulk-hide" : "bulk-unhide";
      const res = await fetch(
        `/api/admin/chat/rooms/${encodeURIComponent(room.id)}/messages/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: isHide ? "관리자 채팅 상세 일괄 숨김" : "관리자 채팅 상세 일괄 숨김 해제",
          }),
          credentials: "same-origin",
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hidden_count?: number;
        unhidden_count?: number;
      };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "처리 실패");
        return;
      }
      const n = isHide ? j.hidden_count : j.unhidden_count;
      if (typeof n === "number") {
        alert(isHide ? `숨김 처리: ${n}건` : `숨김 해제: ${n}건`);
      }
      onActionSuccess();
    } finally {
      setLoading(null);
    }
  };

  const run = async (action: PanelAction) => {
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(room.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "처리 실패");
        return;
      }
      setNote("");
      onActionSuccess();
    } finally {
      setLoading(null);
    }
  };

  const readonly = room.isReadonly === true;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[12px] font-medium text-gray-500">조치 메모 (선택)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="사유·내부 메모 (최대 1000자)"
          className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("warn")}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading === "warn" ? "처리 중..." : "채팅 경고 기록"}
        </button>
        {room.roomStatus !== "blocked" ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("block_room")}
            className="rounded border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading === "block_room" ? "처리 중..." : "채팅방 닫기(운영)"}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("unblock_room")}
            className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "unblock_room" ? "처리 중..." : "운영 닫기 해제"}
          </button>
        )}
        {room.roomStatus !== "archived" ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("archive_room")}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === "archive_room" ? "처리 중..." : "채팅방 보관(잠금)"}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("unarchive_room")}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === "unarchive_room" ? "처리 중..." : "보관 해제"}
          </button>
        )}
        {!readonly ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("readonly_on")}
            className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === "readonly_on" ? "처리 중..." : "읽기 전용"}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("readonly_off")}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === "readonly_off" ? "처리 중..." : "읽기 전용 해제"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <span className="w-full text-[12px] font-medium text-gray-500">메시지 일괄 조치</span>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runBulkMessages("bulk_hide")}
          className="rounded border border-orange-100 bg-orange-50 px-3 py-2 text-[13px] font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50"
        >
          {loading === "bulk_hide" ? "처리 중..." : "메시지 일괄 숨김"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runBulkMessages("bulk_unhide")}
          className="rounded border border-lime-200 bg-lime-50 px-3 py-2 text-[13px] font-medium text-lime-900 hover:bg-lime-100 disabled:opacity-50"
        >
          {loading === "bulk_unhide" ? "처리 중..." : "숨김 일괄 해제"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/admin/reports?targetType=chat&targetId=${encodeURIComponent(room.id)}`}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
        >
          신고 검토로 이동
        </a>
      </div>
    </div>
  );
}
