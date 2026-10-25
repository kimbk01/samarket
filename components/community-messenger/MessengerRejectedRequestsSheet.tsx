"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export type MessengerRejectedRequest = {
  id: string;
  requesterId: string;
  requesterLabel: string;
  requesterHandle: string | null;
  requesterAvatarUrl: string | null;
  respondedAt: string | null;
};

/** §14-5: 내가 거절한 받은 친구 요청 목록 — 보관함 행 개수와 시트가 같은 목록을 쓴다. */
export function useMessengerRejectedRequests(enabled: boolean) {
  const [requests, setRequests] = useState<MessengerRejectedRequest[] | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/community-messenger/friend-requests/rejected", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; requests?: MessengerRejectedRequest[] };
      if (res.ok && json.ok) setRequests(json.requests ?? []);
    } catch {
      /* 개수는 미확정(null) 유지 — 「없음」으로 오해하지 않게 */
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  return { requests, setRequests, reload };
}

/**
 * 보관함 「거절한 요청」 시트 (S1) — 거절한 사람은 나에게 대화·통화·친구 요청 불가, 「해제」 하면 다시 가능.
 */
export function MessengerRejectedRequestsSheet({
  requests,
  onClose,
  onReleased,
}: {
  requests: MessengerRejectedRequest[] | null;
  onClose: () => void;
  onReleased: (requestId: string) => void;
}) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);

  const release = async (req: MessengerRejectedRequest) => {
    setBusyId(req.id);
    try {
      const res = await fetch("/api/community-messenger/friend-requests/rejected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (json.error === "not_rejected") {
          onReleased(req.id);
          return;
        }
        showMessengerSnackbar(t("cm_friend_rejected_release_failed"), { variant: "error" });
        return;
      }
      onReleased(req.id);
      showMessengerSnackbar(t("cm_friend_rejected_released", { name: req.requesterLabel }), { variant: "default" });
    } catch {
      showMessengerSnackbar(t("cm_friend_rejected_release_failed"), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_friend_rejected_section")}
      panelClassName="flex max-h-[min(78dvh,600px)] flex-col overflow-hidden"
    >
      <MessengerSheetHeaderBar title={t("cm_friend_rejected_section")} onClose={onClose} closeLabel={t("nav_close")} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,var(--safe-bottom))] pt-2">
        <p className="pb-2 sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
          {t("cm_friend_rejected_section_hint")}
        </p>
        {requests == null ? (
          <p className="py-8 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("common_loading")}
          </p>
        ) : requests.length === 0 ? (
          <p className="py-8 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("cm_friend_rejected_empty")}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--messenger-divider)]" data-cm-rejected-requests="">
            {requests.map((req) => (
              <li key={req.id} className="flex items-center gap-3 py-3">
                <span className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                  <SamarketThumbnail
                    src={resolveUserAvatarImageSrc(req.requesterAvatarUrl ?? undefined)}
                    size={40}
                    roundedClassName="rounded-full"
                    fallbackSrc=""
                    fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                    {req.requesterLabel}
                  </p>
                  {req.requesterHandle ? (
                    <p className="truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                      @{req.requesterHandle}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void release(req)}
                  className="shrink-0 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-1.5 sam-text-helper font-semibold text-[color:var(--messenger-text)] transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  {busyId === req.id ? t("common_processing") : t("cm_friend_rejected_release")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
