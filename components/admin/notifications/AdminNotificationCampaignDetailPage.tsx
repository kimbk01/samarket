"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function AdminNotificationCampaignDetailPage() {
  const params = useParams();
  const id = typeof params?.campaignId === "string" ? params.campaignId : "";

  const [camp, setCamp] = useState<Record<string, unknown> | null>(null);
  const [tallies, setTallies] = useState<{ pending: number; sent: number; failed: number; skipped: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${id}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaign?: Record<string, unknown>;
        targets?: typeof tallies;
      };
      if (res.ok && j?.ok) {
        setCamp(j.campaign ?? null);
        setTallies(j.targets ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSend = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      let done = false;
      let guard = 0;
      const lines: string[] = [];
      while (!done && guard < 500) {
        guard += 1;
        const res = await fetch(`/api/admin/notification-campaigns/${id}/send`, {
          method: "POST",
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          processed?: number;
          sent?: number;
          skipped?: number;
          failed?: number;
          done?: boolean;
          error?: string;
        };
        if (!res.ok || !j?.ok) {
          lines.push(`오류: ${j?.error ?? res.status}`);
          break;
        }
        lines.push(
          `배치 ${guard}: 처리 ${j.processed ?? 0}, 발송 ${j.sent ?? 0}, 건너뜀 ${j.skipped ?? 0}, 실패 ${j.failed ?? 0}`
        );
        done = j.done === true;
      }
      setLog(lines);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!id) {
    return <p className="p-4 text-sm text-sam-muted">잘못된 경로입니다.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← 목록
      </Link>

      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : camp ? (
        <>
          <h1 className="text-lg font-semibold text-sam-fg">{String(camp.title ?? "")}</h1>
          <div className="space-y-1 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
            <p>
              <span className="text-sam-muted">유형</span> {String(camp.type ?? "")}
            </p>
            <p>
              <span className="text-sam-muted">대상</span> {String(camp.target_type ?? "")}
            </p>
            <p>
              <span className="text-sam-muted">상태</span> {String(camp.status ?? "")}
            </p>
            <p className="whitespace-pre-wrap text-sam-fg">{String(camp.body ?? "")}</p>
            {camp.target_url ? (
              <p className="break-all text-signature">
                URL: <span className="text-sam-fg">{String(camp.target_url)}</span>
              </p>
            ) : null}
          </div>

          {tallies ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] text-sam-muted">
              대상 요약 · 대기 {tallies.pending}, 발송 {tallies.sent}, 건너뜀 {tallies.skipped}, 실패 {tallies.failed}
            </div>
          ) : null}

          {camp.status === "draft" || camp.status === "scheduled" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSend()}
              className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "발송 중…" : "배치 발송 실행"}
            </button>
          ) : null}

          {log.length ? (
            <pre className="max-h-60 overflow-auto rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[11px]">
              {log.join("\n")}
            </pre>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-sam-muted">캠페인을 찾을 수 없습니다.</p>
      )}
    </div>
  );
}
