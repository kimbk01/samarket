"use client";

import { Phone, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore, useState, type MouseEvent, type PointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isOutgoingCallStartBlocked,
  subscribeCallActionLock,
} from "@/lib/call/call-action-lock";
import {
  getActiveCallSessionCallId,
  subscribeActiveCallSession,
} from "@/lib/call/active-call-session";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { MessengerListRow } from "@/components/community-messenger/line-ui";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import {
  formatCallLogListTime,
  isCallLogMissedDisplayType,
  normalizeCommunityMessengerCallLog,
  normalizeCommunityMessengerCallLogs,
  resolveCallLogListTimestampIso,
  resolveCallLogStatusMessageKey,
  shouldShowCallLogDuration,
} from "@/lib/community-messenger/call-log-row-copy";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import { communityMessengerRoomHref } from "@/lib/community-messenger/messenger-entry-origin";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

type Props = {
  /** 부트스트랩 `data.calls` — 있으면 우선 표시(중복 fetch 방지) */
  seedCalls?: CommunityMessengerCallLog[];
  /** `deferredCallLog` — bootstrap 보강 대기 중 */
  callsHydrating?: boolean;
  /** 방 진입 시 `?from=` 유지 */
  entryOrigin?: string | null;
};

function useCallHistoryRedialBlocked(): boolean {
  useSyncExternalStore(subscribeActiveCallSession, () => isOutgoingCallStartBlocked(), () => false);
  useSyncExternalStore(subscribeCallActionLock, () => isOutgoingCallStartBlocked(), () => false);
  return isOutgoingCallStartBlocked();
}

function CallLogRow({
  call,
  onNavigate,
  globalRedialBlocked,
  activeCallId,
}: {
  call: CommunityMessengerCallLog;
  onNavigate: (call: CommunityMessengerCallLog) => void;
  globalRedialBlocked: boolean;
  activeCallId: string | null;
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const [redialing, setRedialing] = useState(false);
  const redialingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const name = call.peerLabel?.trim() || call.title?.trim() || t("common_partner");
  const timestampIso = resolveCallLogListTimestampIso(call);
  const timeLabel = formatCallLogListTime(timestampIso, language, t("cm_ui_call_log_time_yesterday"));
  const statusKey = resolveCallLogStatusMessageKey(call.callKind, call.displayType);
  const statusLabel = safeT(statusKey, {
    fallbackKo: "통화 기록",
    fallbackEn: "Call log",
  });
  const isMissed = isCallLogMissedDisplayType(call.displayType);
  const showDuration = shouldShowCallLogDuration(call.displayType, call.durationSeconds);
  const durationLine = showDuration
    ? formatCommunityMessengerCallDurationLabel(call.durationSeconds)
    : null;
  const canNavigate = Boolean(call.roomId?.trim() || call.sessionId?.trim());
  const canRedial =
    call.sessionMode !== "group" && Boolean(call.roomId?.trim() || call.peerUserId?.trim());
  const redialKind = call.callKind;
  const RedialIcon = redialKind === "video" ? Video : Phone;
  const redialAriaLabel =
    redialKind === "video" ? t("cm_ui_call_log_redial_video") : t("cm_ui_call_log_redial_voice");

  const handleRedial = useCallback(
    (event: MouseEvent | PointerEvent) => {
      event.stopPropagation();
      if (!canRedial || redialingRef.current || globalRedialBlocked) return;
      redialingRef.current = true;
      setRedialing(true);
      void (async () => {
        try {
          const result = await launchOutgoingDirectCall(
            {
              roomId: call.roomId?.trim() ?? null,
              peerUserId: call.peerUserId?.trim() ?? null,
              peerLabel: call.peerLabel,
              kind: redialKind,
            },
            router
          );
          if (!result.ok) {
            showMessengerSnackbar(result.userMessage, { variant: "error" });
          }
        } catch {
          showMessengerSnackbar(t("cm_ui_network_error_could_not_start_call"), { variant: "error" });
        } finally {
          redialingRef.current = false;
          if (mountedRef.current) setRedialing(false);
        }
      })();
    },
    [call.peerUserId, call.roomId, canRedial, globalRedialBlocked, redialKind, router, t]
  );

  const rowBlocked = globalRedialBlocked && !redialing;

  return (
    <li>
      <div
        role={canNavigate ? "button" : undefined}
        tabIndex={canNavigate ? 0 : undefined}
        onClick={() => canNavigate && onNavigate(call)}
        onKeyDown={(event) => {
          if (!canNavigate) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate(call);
          }
        }}
        className={`w-full text-left transition active:bg-sam-surface-muted ${
          canNavigate ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <MessengerListRow
          centerWithAvatar
          trailingLayout="center"
          avatar={
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(call.peerAvatarUrl ?? null)}
              size={48}
              roundedClassName="rounded-full"
              className="bg-[color:var(--messenger-surface-muted)] ring-1 ring-[color:var(--messenger-divider)]"
              fallbackSrc=""
              fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
            />
          }
          trailing={
            <div className="flex flex-col items-end justify-center gap-1.5">
              {timeLabel ? (
                <span className="shrink-0 whitespace-nowrap sam-text-helper tabular-nums text-sam-meta">
                  {timeLabel}
                </span>
              ) : null}
              {canRedial ? (
                <button
                  type="button"
                  disabled={rowBlocked || redialing}
                  aria-busy={redialing}
                  aria-label={redialAriaLabel}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={handleRedial}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-fg transition hover:bg-sam-surface-muted disabled:opacity-50"
                >
                  <RedialIcon className={`h-5 w-5 ${redialing ? "animate-pulse" : ""}`} aria-hidden />
                </button>
              ) : null}
            </div>
          }
        >
          <p className="truncate sam-text-body font-semibold text-sam-fg">{name}</p>
          <p
            className={`truncate sam-text-body-secondary ${
              isMissed ? "font-medium text-red-600" : "text-sam-muted"
            }`}
          >
            {statusLabel}
            {durationLine ? (
              <>
                <span className="mx-1.5 text-sam-border">·</span>
                {durationLine}
              </>
            ) : null}
          </p>
        </MessengerListRow>
      </div>
    </li>
  );
}

/** 통화 목록 본문 — 독립 페이지·메신저 홈 탭 공용 */
export function MessengerCallLogsPanel({
  seedCalls = [],
  callsHydrating = false,
  entryOrigin = null,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const globalRedialBlocked = useCallHistoryRedialBlocked();
  const activeCallId = useSyncExternalStore(
    subscribeActiveCallSession,
    getActiveCallSessionCallId,
    () => null,
  );
  const [calls, setCalls] = useState<CommunityMessengerCallLog[]>(seedCalls);
  const [loading, setLoading] = useState(callsHydrating);
  const [error, setError] = useState<string | null>(null);
  const fallbackFetchedRef = useRef(false);

  useEffect(() => {
    setCalls(normalizeCommunityMessengerCallLogs(seedCalls));
    if (!callsHydrating) {
      setLoading(false);
    }
  }, [seedCalls, callsHydrating]);

  useEffect(() => {
    if (!callsHydrating) return;
    setLoading(true);
    setError(null);
  }, [callsHydrating]);

  /** bootstrap deferred 가 지연·실패할 때 탭 진입 즉시 1회 fallback */
  useEffect(() => {
    if (!callsHydrating || fallbackFetchedRef.current) return;
    fallbackFetchedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-messenger/calls", { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; calls?: CommunityMessengerCallLog[] };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(t("cm_ui_call_logs_load_failed"));
          return;
        }
        setCalls(normalizeCommunityMessengerCallLogs(json.calls ?? []));
      } catch {
        if (!cancelled) setError(t("cm_ui_call_logs_network_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callsHydrating, t]);

  const onRowNavigate = useCallback(
    (call: CommunityMessengerCallLog) => {
      const roomId = call.roomId?.trim();
      if (roomId) {
        router.push(communityMessengerRoomHref(roomId, entryOrigin, "inbox"));
        return;
      }
      const sid = call.sessionId?.trim();
      if (sid) {
        router.push(`/community-messenger/calls/${encodeURIComponent(sid)}`);
      }
    },
    [router, entryOrigin]
  );

  if (error && calls.length === 0) {
    return <p className="py-10 text-center sam-text-body text-red-600">{error}</p>;
  }
  if (calls.length === 0) {
    if (loading) {
      return (
        <ul
          className="min-h-[120px] divide-y divide-sam-border"
          aria-busy="true"
          aria-label={t("cm_ui_call_logs_title")}
        />
      );
    }
    return <p className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("cm_ui_call_logs_empty")}</p>;
  }

  return (
    <ul className="divide-y divide-sam-border" aria-label={t("cm_ui_call_logs_title")}>
      {calls.map((call) => (
        <CallLogRow
          key={call.id}
          call={call}
          onNavigate={onRowNavigate}
          globalRedialBlocked={globalRedialBlocked}
          activeCallId={activeCallId}
        />
      ))}
    </ul>
  );
}
