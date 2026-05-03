"use client";

import { ArrowLeft, Phone, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

function displayTypeLabel(t: CommunityMessengerCallLogDisplayType): string {
  switch (t) {
    case "missed_outgoing":
      return "부재중 · 발신";
    case "missed_incoming":
      return "부재중 · 수신";
    case "rejected":
      return "거절";
    case "cancelled":
      return "취소";
    case "failed":
      return "실패";
    case "outgoing":
      return "발신";
    case "incoming":
      return "수신";
    default:
      return "통화";
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
          if (!cancelled) setError("통화 기록을 불러오지 못했습니다.");
          return;
        }
        if (!cancelled) setCalls(json.calls ?? []);
      } catch {
        if (!cancelled) setError("네트워크 오류로 통화 기록을 불러오지 못했습니다.");
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
          aria-label="뒤로"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate sam-text-page-title font-semibold text-sam-fg">통화 기록</h1>
        <Link
          href="/community-messenger?section=chats"
          className="sam-text-body-secondary shrink-0 text-signature active:opacity-80"
        >
          채팅
        </Link>
      </header>

      <main className="flex-1 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        {loading ? (
          <p className="py-10 text-center sam-text-body-secondary text-sam-muted">불러오는 중…</p>
        ) : error ? (
          <p className="py-10 text-center sam-text-body text-red-600">{error}</p>
        ) : calls.length === 0 ? (
          <p className="py-10 text-center sam-text-body-secondary text-sam-muted">통화 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
            {calls.map((call) => {
              const name = call.peerLabel?.trim() || call.title?.trim() || "상대";
              const dateLine = resolveRowTimestamp(call);
              const durationLine =
                call.durationSeconds > 0 ? formatCommunityMessengerCallDurationLabel(call.durationSeconds) : "—";
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
                        {displayTypeLabel(call.displayType)}
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
