"use client";

import { ArrowLeft, Phone, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

function displayTypeLabel(
  type: CommunityMessengerCallLogDisplayType,
  tr: ReturnType<typeof useI18n>["t"],
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

export function CommunityMessengerCallLogsClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [calls, setCalls] = useState<CommunityMessengerCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/community-messenger/calls", { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; calls?: CommunityMessengerCallLog[] };
        if (!res.ok || !json.ok) {
          if (!cancelled) setError(t("cm_ui_call_logs_load_failed"));
          return;
        }
        if (!cancelled) setCalls(json.calls ?? []);
      } catch {
        if (!cancelled) setError(t("cm_ui_call_logs_network_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRowNavigate = useCallback(
    (call: CommunityMessengerCallLog) => {
      const roomId = call.roomId?.trim();
      if (roomId) {
        router.push(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
        return;
      }
      const sid = call.sessionId?.trim();
      if (sid) {
        router.push(`/community-messenger/calls/${encodeURIComponent(sid)}`);
      }
    },
    [router]
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-sam-app">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-sam-border bg-sam-app/95 px-3 py-3 backdrop-blur-sm pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full text-sam-fg active:bg-sam-surface-muted"
          aria-label={t("nav_back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate sam-text-page-title font-semibold text-sam-fg">{t("cm_ui_call_logs_title")}</h1>
        <Link
          href="/community-messenger?section=chats"
          className="sam-text-body-secondary shrink-0 text-signature active:opacity-80"
        >
          {t("nav_conversation")}
        </Link>
      </header>

      <main className="flex-1 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        {loading ? (
          <p className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("common_loading")}</p>
        ) : error ? (
          <p className="py-10 text-center sam-text-body text-red-600">{error}</p>
        ) : calls.length === 0 ? (
          <p className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("cm_ui_call_logs_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
            {calls.map((call) => {
              const name = call.peerLabel?.trim() || call.title?.trim() || t("common_partner");
              const dateLine = resolveRowTimestamp(call);
              const durationLine =
                call.durationSeconds > 0 ? formatCommunityMessengerCallDurationLabel(call.durationSeconds) : t("mypage_comp_placeholder_dash");
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
                      {dateLine ? (
                        <span className="mt-1 block sam-text-helper text-sam-meta">{dateLine}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
