"use client";

import { ChevronLeft, MessageCircle, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CommunityMessengerCallPeerHistoryRow } from "@/components/community-messenger/call-history/CommunityMessengerCallPeerHistoryRow";
import { useCommunityMessengerCallPeerDetailClose } from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailShell";
import {
  CommunityMessengerCallPhoneOutlineIcon,
  CommunityMessengerCallVideoOutlineIcon,
} from "@/components/community-messenger/call-history/CommunityMessengerCallOutlineIcons";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import {
  CALL_PEER_HISTORY_INITIAL_LIMIT,
  filterDirectCallHistoryForPeer,
  groupCallPeerHistoryByDate,
} from "@/lib/community-messenger/call-history/call-peer-history-group";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

const STARBUCKS_GREEN = "#006241";

export type CallPeerDetailSelection = {
  peerUserId: string;
  roomId: string | null;
  peerName: string;
  peerPublicId: string | null;
  peerDisplayLabel: string;
  peerAvatarUrl: string | null;
};

type Props = {
  selection: CallPeerDetailSelection;
  calls: CommunityMessengerCallLog[];
  entryOrigin?: string | null;
  viewerUserId?: string | null;
  onRequestOutgoingConfirm: (kind: "voice" | "video") => void;
};

function CallActionTile({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: "voice" | "video";
  onPress: () => void;
  disabled?: boolean;
}) {
  const Icon =
    icon === "video" ? CommunityMessengerCallVideoOutlineIcon : CommunityMessengerCallPhoneOutlineIcon;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-2 py-1 text-white active:opacity-80 disabled:opacity-50"
    >
      <Icon className="h-6 w-6" aria-hidden />
      <span className="sam-text-helper font-medium text-white">{label}</span>
    </button>
  );
}

export function CommunityMessengerCallPeerDetailPanel({
  selection,
  calls,
  entryOrigin = null,
  viewerUserId = null,
  onRequestOutgoingConfirm,
}: Props) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const requestClose = useCommunityMessengerCallPeerDetailClose();
  const [showAllHistory, setShowAllHistory] = useState(false);

  const peerCalls = useMemo(
    () => filterDirectCallHistoryForPeer(calls, selection.peerUserId, selection.roomId),
    [calls, selection.peerUserId, selection.roomId]
  );
  const visibleCalls = showAllHistory ? peerCalls : peerCalls.slice(0, CALL_PEER_HISTORY_INITIAL_LIMIT);
  const sections = useMemo(() => groupCallPeerHistoryByDate(visibleCalls), [visibleCalls]);
  const hasMore = !showAllHistory && peerCalls.length > CALL_PEER_HISTORY_INITIAL_LIMIT;

  const resolveSectionLabel = useCallback(
    (sectionKind: "today" | "yesterday" | "date", sectionKey: string) => {
      if (sectionKind === "today") {
        return safeT("cm_ui_call_peer_history_section_today", {
          fallbackKo: "오늘",
          fallbackEn: "Today",
        });
      }
      if (sectionKind === "yesterday") {
        return t("cm_ui_call_log_time_yesterday");
      }
      const date = new Date(sectionKey);
      if (!Number.isFinite(date.getTime())) return "";
      return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
        month: "long",
        day: "numeric",
      }).format(date);
    },
    [language, safeT, t]
  );

  const handleChat = useCallback(() => {
    const roomId = selection.roomId?.trim();
    if (!roomId) {
      showMessengerSnackbar(
        safeT("cm_ui_call_outgoing_missing_room", {
          fallbackKo: "방 정보가 없어 채팅을 열 수 없습니다.",
          fallbackEn: "Cannot open chat because room information is missing.",
        }),
        { variant: "error" }
      );
      return;
    }
    requestClose?.();
    void runCommunityMessengerRoomForwardNavigation({
      router,
      roomId,
      listSource: "inbox",
      fromEntryOrigin: entryOrigin,
      viewerUserId,
    });
  }, [entryOrigin, requestClose, router, safeT, selection.roomId, viewerUserId]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between px-2 pb-2 pt-[max(8px,var(--safe-top))]">
        <button
          type="button"
          aria-label={t("nav_back")}
          onClick={() => requestClose?.()}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sam-fg active:bg-sam-surface-muted"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("cm_ui_call_peer_detail_more_aria")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sam-fg active:bg-sam-surface-muted"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="shrink-0 flex flex-col items-center px-4 pb-4">
        <SamarketThumbnail
          src={resolveUserAvatarImageSrc(selection.peerAvatarUrl)}
          size={96}
          roundedClassName="rounded-full"
          className="bg-sam-surface-muted ring-2 ring-[#006241]/20"
          fallbackSrc=""
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
        <p className="mt-4 max-w-full truncate text-center text-lg font-bold text-sam-fg">
          {selection.peerName}
          {selection.peerPublicId &&
          selection.peerName.toLowerCase() !== selection.peerPublicId.toLowerCase() ? (
            <span className="font-medium text-sam-fg-muted"> (@{selection.peerPublicId})</span>
          ) : null}
        </p>

        <div
          className="mt-5 flex w-full max-w-sm items-stretch justify-center gap-2 rounded-ui-rect px-2 py-3 shadow-sm"
          style={{ backgroundColor: STARBUCKS_GREEN }}
        >
          <button
            type="button"
            onClick={handleChat}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-2 py-1 text-white active:opacity-80"
          >
            <MessageCircle className="h-6 w-6" aria-hidden />
            <span className="sam-text-helper font-medium text-white">
              {safeT("cm_ui_call_peer_detail_chat", { fallbackKo: "채팅", fallbackEn: "Chat" })}
            </span>
          </button>
          <CallActionTile
            label={safeT("cm_ui_call_peer_detail_voice", { fallbackKo: "음성 통화", fallbackEn: "Voice call" })}
            icon="voice"
            onPress={() => onRequestOutgoingConfirm("voice")}
          />
          <CallActionTile
            label={safeT("cm_ui_call_peer_detail_video", { fallbackKo: "영상 통화", fallbackEn: "Video call" })}
            icon="video"
            onPress={() => onRequestOutgoingConfirm("video")}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-sam-border">
        {sections.map((section) => (
          <section key={section.sectionKey}>
            <h3 className="px-4 pb-1 pt-4 sam-text-helper font-medium text-sam-fg-muted">
              {resolveSectionLabel(section.sectionKind, section.sectionKey)}
            </h3>
            <ul>
              {section.calls.map((call) => (
                <CommunityMessengerCallPeerHistoryRow key={call.id} call={call} />
              ))}
            </ul>
          </section>
        ))}
        {!peerCalls.length ? (
          <p className="px-4 py-8 text-center sam-text-body text-sam-fg-muted">{t("cm_ui_call_logs_empty")}</p>
        ) : null}
      </div>

      {hasMore ? (
        <div className="shrink-0 border-t border-sam-border px-4 py-3 pb-[max(12px,var(--safe-bottom))]">
          <button
            type="button"
            onClick={() => setShowAllHistory(true)}
            className="w-full rounded-ui-rect py-3 sam-text-body font-medium text-white active:opacity-90"
            style={{ backgroundColor: STARBUCKS_GREEN }}
          >
            {safeT("cm_ui_call_peer_history_more", {
              fallbackKo: "통화 이력 더보기",
              fallbackEn: "See more call history",
            })}
          </button>
        </div>
      ) : (
        <div className="shrink-0 pb-[max(12px,var(--safe-bottom))]" />
      )}
    </div>
  );
}
