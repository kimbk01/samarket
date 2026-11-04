"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";

type Row = {
  id: string;
  platform: string;
  version_name: string;
  version_code: number | null;
  released_at: string;
  source: string;
  rollout_status: string | null;
  notified_at: string | null;
};

/** 출시 무음 감지 상태 + 수동 동기화·발송 확정 (시안/전체화면 Host 비변경). */
export function AdminAppReleasesStatus() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [playKey, setPlayKey] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"sync" | "notify" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    setFailed(false);
    void fetch("/api/admin/app-releases", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; releases?: Row[]; playKeyConfigured?: boolean } | null) => {
        if (!j?.ok) {
          setFailed(true);
          return;
        }
        setRows(j.releases ?? []);
        setPlayKey(j.playKeyConfigured === true);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function runSync() {
    setBusy("sync");
    setMessage(null);
    try {
      const r = await fetch("/api/admin/app-releases/sync", {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        results?: { platform: string; inserted: number; notified: number; incomplete: boolean; error?: string }[];
      } | null;
      if (!j?.ok) {
        setMessage(ko ? `동기화 실패: ${j?.error ?? r.status}` : `Sync failed: ${j?.error ?? r.status}`);
        return;
      }
      const summary = (j.results ?? [])
        .map(
          (x) =>
            `${x.platform}: +${x.inserted} / notify ${x.notified}${x.incomplete ? " (more)" : ""}${
              x.error ? ` err=${x.error}` : ""
            }`
        )
        .join(" · ");
      setMessage(ko ? `동기화 완료 — ${summary}` : `Synced — ${summary}`);
      reload();
    } catch {
      setMessage(ko ? "동기화 요청 실패" : "Sync request failed");
    } finally {
      setBusy(null);
    }
  }

  async function runNotify(releaseId: string, label: string) {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("appReleaseNotify"),
      ko,
      title: label,
      description: ko
        ? "Play production 전체 출시가 확인된 경우에만 진행하세요.\n단계적·심사중·비공개 테스트면 취소하세요.\n구버전 Android 회원에게 인앱+푸시 1회를 보냅니다."
        : "Confirm only if production rollout is fully available.\nCancel for staged/review/closed testing.\nSends 1 inbox+push to outdated Android users.",
      confirmLabel: ko ? "발송 확정" : "Confirm notify",
    });
    if (!confirmed.ok) return;
    setBusy("notify");
    setMessage(null);
    try {
      const r = await fetch("/api/admin/app-releases/notify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, confirm: true }),
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        created?: number;
        attempted?: number;
        incomplete?: boolean;
      } | null;
      if (!j?.ok) {
        setMessage(ko ? `발송 실패: ${j?.error ?? r.status}` : `Notify failed: ${j?.error ?? r.status}`);
        return;
      }
      setMessage(
        ko
          ? `발송 시도 ${j.attempted ?? 0} · 반영 ${j.created ?? 0}${j.incomplete ? " (이어서 다시 실행)" : ""}`
          : `Attempted ${j.attempted ?? 0} · applied ${j.created ?? 0}${j.incomplete ? " (run again)" : ""}`
      );
      reload();
    } catch {
      setMessage(ko ? "발송 요청 실패" : "Notify request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm" data-admin-app-releases>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sam-fg">{ko ? "앱 업데이트 출시 감지" : "App release detect"}</h2>
        <AdminActionButton variant="secondary" disabled={busy != null} onClick={() => void runSync()}>
          {busy === "sync" ? (ko ? "동기화 중…" : "Syncing…") : ko ? "지금 동기화" : "Sync now"}
        </AdminActionButton>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "6시간마다 Play 프로덕션 트랙을 확인합니다. completed 출시만 자동으로 구버전 회원에게 인앱+푸시 1회를 보냅니다. 단계적·closed testing은 자동 발송하지 않으며, 아래에서 수동 확정할 수 있습니다. 페이스북형 업데이트 전체화면은 앱 진입 후 기존 그대로입니다."
          : "Every 6h checks Play production. Only completed rollouts auto-notify outdated users once (inbox+push). Staged/closed testing need manual confirm. Facebook-style fullscreen UI is unchanged after app open."}
      </p>
      {playKey === false ? (
        <p className="sam-text-helper text-sam-warning">
          {ko
            ? "Google Play 키가 없어 Android 자동 감지를 할 수 없습니다. 수동 확정만 가능합니다."
            : "No Google Play key: Android auto-detect disabled. Manual confirm only."}
        </p>
      ) : null}
      {message ? <p className="sam-text-helper text-sam-fg">{message}</p> : null}
      {failed ? (
        <p className="sam-text-helper text-sam-danger">{ko ? "불러오지 못했습니다" : "Failed to load"}</p>
      ) : rows == null ? null : rows.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{ko ? "아직 수집된 기록이 없습니다" : "Nothing collected yet"}</p>
      ) : (
        <ul className="divide-y divide-sam-border">
          {rows.map((r) => {
            const label = `${r.platform} ${r.version_name}${r.version_code != null ? ` (${r.version_code})` : ""}`;
            const canConfirm = !r.notified_at && (r.platform !== "android" || r.version_code != null);
            return (
              <li key={r.id || `${r.platform}-${r.version_name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="font-medium text-sam-fg">{label}</span>
                <span className="sam-text-helper text-sam-muted">{r.source}</span>
                <span className="sam-text-helper text-sam-muted">{r.rollout_status ?? "—"}</span>
                <span className="sam-text-helper text-sam-muted">{formatAdminManilaDateTime(r.released_at)}</span>
                <span className="sam-text-helper text-sam-muted">
                  {r.notified_at ? (ko ? "알림 완료" : "notified") : ko ? "미발송" : "pending"}
                </span>
                {canConfirm ? (
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    disabled={busy != null}
                    onClick={() => void runNotify(r.id, label)}
                  >
                    {ko ? "발송 확정" : "Confirm notify"}
                  </AdminActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
