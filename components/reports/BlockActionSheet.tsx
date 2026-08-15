"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState } from "react";
import { blockUserDaangn } from "@/lib/reports/blockUserDaangn";
import { dibayConfirm, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface BlockActionSheetProps {
  targetUserId: string;
  targetLabel: string;
  roomId?: string;
  /** 당근형 chat_room일 때 서버에 차단 반영 (POST /api/chat/rooms/:roomId/block) */
  roomSource?: "product_chat" | "chat_room";
  currentUserId?: string;
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BlockActionSheet({
  targetUserId,
  targetLabel,
  roomId,
  roomSource,
  currentUserId,
  title,
  onClose,
  onSuccess,
}: BlockActionSheetProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBlock = async () => {
    const ok = await dibayConfirm({
      title: t("ui_report_block_chat_confirm", { label: targetLabel }),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("ui_report_block_action"),
      confirmTone: "destructive",
    });
    if (!ok) return;
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
    <DibayBottomSheet
      open
      onClose={() => {
        if (!loading) onClose();
      }}
      title={title ?? t("common_block")}
      anchor="above-bottom-nav"
      ariaLabel={title ?? t("common_block")}
    >
      <div className="px-1 pb-2">
        <p className={OverlayUi.bodySecondary}>
          {t("ui_report_block_chat_desc", { label: targetLabel })}
        </p>
        {error ? <p className={`mt-2 ${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <DibayOverlayButton roleTone="secondary" onClick={onClose}>
            {t("common_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="destructive"
            disabled={loading}
            onClick={() => void handleBlock()}
          >
            {loading ? t("ui_report_block_submitting") : t("ui_report_block_action")}
          </DibayOverlayButton>
        </div>
      </div>
    </DibayBottomSheet>
  );
}
