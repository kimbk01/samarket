"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBlock = async () => {
    if (!confirm(t("ui_report_block_chat_confirm", { label: targetLabel }))) return;
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
          setError(d?.error ?? t("ui_report_room_block_failed"));
          setLoading(false);
          return;
        }
      } catch (e) {
        setError((e as Error)?.message ?? t("ui_report_room_block_failed"));
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
      <p className="sam-text-body text-sam-muted">
        {t("ui_report_block_chat_desc", { label: targetLabel })}
      </p>
      {error && <p className="mt-2 sam-text-body-secondary text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body text-sam-fg"
        >
          {t("common_cancel")}
        </button>
        <button
          type="button"
          onClick={handleBlock}
          disabled={loading}
          className="flex-1 rounded-ui-rect bg-red-600 py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {loading ? t("ui_report_block_submitting") : t("ui_report_block_action")}
        </button>
      </div>
    </div>
  );
}
