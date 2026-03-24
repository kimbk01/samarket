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

interface AdminChatActionPanelProps {
  room: AdminChatRoom;
  onActionSuccess: () => void;
}

export function AdminChatActionPanel({
  room,
  onActionSuccess,
}: AdminChatActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");

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
