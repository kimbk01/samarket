"use client";

import { Link2, QrCode } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { GroupInviteLinkState } from "@/lib/community-messenger/group/use-group-room-invite-link";

type GroupInviteLinkSectionProps = {
  state: GroupInviteLinkState;
  loading: boolean;
  canManage: boolean;
  busy: string | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onDisable: () => void;
};

/** Invite link settings — copy / regenerate / disable + QR-ready structure. */
export function GroupInviteLinkSection({
  state,
  loading,
  canManage,
  busy,
  onCopy,
  onRegenerate,
  onDisable,
}: GroupInviteLinkSectionProps) {
  const { t, safeT } = useI18n();
  const inviteBusy = busy === "group-invite";

  return (
    <div className="mt-4 rounded-ui-rect border border-[#006241]/25 bg-[#EAF4EF] p-4">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[#006241]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="sam-text-body font-semibold text-[#006241]">{t("cm_ui_group_invite_link")}</p>
          <p className="mt-1 break-all sam-text-helper text-[#004C3F]">
            {loading
              ? t("chats_spinner_loading_aria")
              : state.enabled && state.inviteUrl
                ? state.inviteUrl
                : safeT("cm_ui_group_invite_link_disabled", {
                    fallbackKo: "초대 링크가 비활성화되어 있습니다.",
                    fallbackEn: "Invite link is disabled.",
                  })}
          </p>
          {state.inviteToken ? (
            <p className="mt-2 flex items-center gap-1.5 sam-text-xxs text-[#006241]/80">
              <QrCode className="h-3.5 w-3.5" aria-hidden />
              {safeT("cm_ui_group_invite_qr_ready", {
                fallbackKo: "QR 코드 연동 준비됨",
                fallbackEn: "QR code ready",
              })}
              <span className="font-mono opacity-70">({state.inviteToken.slice(0, 8)}…)</span>
            </p>
          ) : null}
        </div>
      </div>
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!state.enabled || !state.inviteUrl || inviteBusy}
            className="min-h-[44px] rounded-ui-rect border border-[#006241]/30 bg-white px-3 py-2 sam-text-helper font-semibold text-[#006241] disabled:opacity-40"
          >
            {t("common_copy")}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={inviteBusy}
            className="min-h-[44px] rounded-ui-rect bg-[#006241] px-3 py-2 sam-text-helper font-semibold text-white disabled:opacity-40"
          >
            {t("cm_ui_group_invite_regenerate")}
          </button>
          <button
            type="button"
            onClick={onDisable}
            disabled={!state.enabled || inviteBusy}
            className="min-h-[44px] rounded-ui-rect border border-red-200 bg-white px-3 py-2 sam-text-helper font-semibold text-red-600 disabled:opacity-40"
          >
            {t("cm_ui_group_invite_disable")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
