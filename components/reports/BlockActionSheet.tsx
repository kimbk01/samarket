"use client";

import { useState } from "react";
import { blockUserDaangn } from "@/lib/reports/blockUserDaangn";

interface BlockActionSheetProps {
  targetUserId: string;
  targetLabel: string;
  roomId?: string;
  /** 당근형 chat_room일 때 서버에 차단 반영 (POST /api/chat/rooms/:roomId/block) */
  roomSource?: "product_chat" | "chat_room";
  currentUserId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BlockActionSheet({
  targetUserId,
  targetLabel,
  roomId,
  roomSource,
  currentUserId,
  onClose,
  onSuccess,
}: BlockActionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBlock = async () => {
    if (!confirm(`"${targetLabel}"님을 차단하면 서로 채팅을 보낼 수 없습니다. 차단할까요?`)) return;
    setLoading(true);
    setError("");
    const res = await blockUserDaangn(targetUserId, { roomId });
    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      return;
    }
    if (roomSource === "chat_room" && roomId && currentUserId) {
      try {
        const r = await fetch(`/api/chat/rooms/${roomId}/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d?.error ?? "채팅방 차단 반영에 실패했습니다.");
          setLoading(false);
          return;
        }
      } catch (e) {
        setError((e as Error)?.message ?? "채팅방 차단 반영에 실패했습니다.");
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="p-4">
      <p className="text-[14px] text-sam-muted">
        {targetLabel}님을 차단하면 서로의 메시지 전송이 불가하며, 기존 대화는 보관됩니다.
      </p>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-ui-rect border border-sam-border py-2.5 text-[14px] text-sam-fg"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleBlock}
          disabled={loading}
          className="flex-1 rounded-ui-rect bg-red-600 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {loading ? "처리 중..." : "차단하기"}
        </button>
      </div>
    </div>
  );
}
