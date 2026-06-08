"use client";

import { Phone, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import { communityMessengerRoomHref } from "@/lib/community-messenger/messenger-entry-origin";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

function displayTypeLabel(
  type: CommunityMessengerCallLogDisplayType,
  tr: ReturnType<typeof useI18n>["t"]
): string {
  switch (type) {
    case "missed_outgoing":
      return tr("cm_ui_call_type_missed_outgoing");
    case "missed_incoming":
      return tr("cm_ui_call_type_missed_incoming");
    case "rejected":
      return tr("cm_ui_call_type_rejected");
    case "cancelled":
      return tr("common_cancel");
    case "failed":
      return tr("cm_ui_call_type_failed");
    case "outgoing":
      return tr("cm_ui_call_type_outgoing");
    case "incoming":
      return tr("cm_ui_call_type_incoming");
    default:
      return tr("cm_ui_call_label");
  }
}

function formatLogDate(iso: string | null | undefined): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function resolveRowTimestamp(call: CommunityMessengerCallLog): string {
  return formatLogDate(call.endedAt) || formatLogDate(call.startedAt);
}

type Props = {
  /** 부트스트랩 `data.calls` — 있으면 우선 표시(중복 fetch 방지) */
  seedCalls?: CommunityMessengerCallLog[];
  /** `deferredCallLog` — bootstrap 보강 대기 중 */
  callsHydrating?: boolean;
  /** 방 진입 시 `?from=` 유지 */
  entryOrigin?: string | null;
};

/** 통화 목록 본문 — 독립 페이지·메신저 홈 탭 공용 */
export function MessengerCallLogsPanel({
  seedCalls = [],
  callsHydrating = false,
  entryOrigin = null,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [calls, setCalls] = useState<CommunityMessengerCallLog[]>(seedCalls);
  const [loading, setLoading] = useState(callsHydrating);
  const [error, setError] = useState<string | null>(null);
  const fallbackFetchedRef = useRef(false);

  useEffect(() => {
    setCalls(seedCalls);
    if (!callsHydrating) {
      setLoading(false);
    }
  }, [seedCalls, callsHydrating]);

  useEffect(() => {
    if (!callsHydrating) return;
    setLoading(true);
    setError(null);
  }, [callsHydrating]);

  /** bootstrap deferred 가 지연·실패할 때 탭 진입 1회 fallback */
  useEffect(() => {
    if (!callsHydrating || fallbackFetchedRef.current) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || fallbackFetchedRef.current) return;
      fallbackFetchedRef.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/community-messenger/calls", { credentials: "include" });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; calls?: CommunityMessengerCallLog[] };
          if (cancelled) return;
          if (!res.ok || !json.ok) {
            setError(t("cm_ui_call_logs_load_failed"));
            return;
          }
          setCalls(json.calls ?? []);
        } catch {
          if (!cancelled) setError(t("cm_ui_call_logs_network_failed"));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 2200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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

  if (loading && calls.length === 0 && !error) {
    return <p className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("common_loading")}</p>;
  }
  if (error && calls.length === 0) {
    return <p className="py-10 text-center sam-text-body text-red-600">{error}</p>;
  }
  if (calls.length === 0) {
    return <p className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("cm_ui_call_logs_empty")}</p>;
  }

  return (
    <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
      {calls.map((call) => {
        const name = call.peerLabel?.trim() || call.title?.trim() || t("common_partner");
        const dateLine = resolveRowTimestamp(call);
        const durationLine =
          call.durationSeconds > 0
            ? formatCommunityMessengerCallDurationLabel(call.durationSeconds)
            : t("mypage_comp_placeholder_dash");
        const canNavigate = Boolean(call.roomId?.trim() || call.sessionId?.trim());
        return (
          <li key={call.id}>
            <button
              type="button"
              disabled={!canNavigate}
              onClick={() => canNavigate && onRowNavigate(call)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-sam-surface-muted ${
                canNavigate ? "cursor-pointer" : "cursor-default opacity-90"
              }`}
            >
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted text-sam-fg">
                {call.callKind === "video" ? (
                  <Video className="h-5 w-5" aria-hidden />
                ) : (
                  <Phone className="h-5 w-5" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate sam-text-body font-semibold text-sam-fg">{name}</span>
                <span className="mt-0.5 block sam-text-body-secondary text-sam-muted">
                  {displayTypeLabel(call.displayType, t)}
                  <span className="mx-1.5 text-sam-border">·</span>
                  {durationLine}
                </span>
                {dateLine ? <span className="mt-1 block sam-text-helper text-sam-meta">{dateLine}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
