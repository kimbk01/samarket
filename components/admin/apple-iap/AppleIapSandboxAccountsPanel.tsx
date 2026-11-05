"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { APPLE_IAP_SANDBOX_POINT_CAP, appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";

type SandboxAccountRow = {
  userId: string;
  nickname: string | null;
  note: string;
  addedAt: string;
  revokedAt: string | null;
  usedPoints: number;
};

const INPUT = "min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body";

/** Apple 테스트 결제(Sandbox) 지급 허용 계정 — 등록·해제 (최고관리자). 지급 상한·차단은 DB 함수가 강제한다. */
export function AppleIapSandboxAccountsPanel({ ko }: { ko: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<SandboxAccountRow[]>([]);
  const [capPoints, setCapPoints] = useState(APPLE_IAP_SANDBOX_POINT_CAP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/apple-iap/sandbox-accounts", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: SandboxAccountRow[];
        capPoints?: number;
      };
      if (!res.ok || j.ok !== true) {
        setError({ code: String(j.error ?? "load_failed"), httpStatus: res.status });
        return;
      }
      setRows(j.rows ?? []);
      if (typeof j.capPoints === "number") setCapPoints(j.capPoints);
    } catch {
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (targetUserId: string, active: boolean, targetNote: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/apple-iap/sandbox-accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, note: targetNote, active }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || j.ok !== true) {
        setMessage(t("apple_iap_admin_action_failed", { error: String(j.error ?? res.status) }));
        return;
      }
      setMessage(t("apple_iap_admin_action_done"));
      if (active) {
        setUserId("");
        setNote("");
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const trimmedUser = userId.trim();
  const trimmedNote = note.trim();
  const canAdd = appleIapIsUuid(trimmedUser) && trimmedNote.length >= 2 && trimmedNote.length <= 200 && !busy;

  return (
    <section
      className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-apple-iap-sandbox-accounts="1"
    >
      <p className="sam-text-helper text-sam-muted">
        {t("apple_iap_admin_sandbox_desc", { cap: formatAdminNumber(capPoints) })}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          className={`${INPUT} min-w-[18rem]`}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t("apple_iap_admin_sandbox_user_ph")}
          aria-label={t("apple_iap_admin_sandbox_user_ph")}
        />
        <input
          className={`${INPUT} min-w-[18rem] flex-1`}
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("apple_iap_admin_sandbox_note_ph")}
          aria-label={t("apple_iap_admin_sandbox_note_ph")}
        />
        <AdminActionButton variant="primary" disabled={!canAdd} onClick={() => void submit(trimmedUser, true, trimmedNote)}>
          {t("apple_iap_admin_sandbox_add")}
        </AdminActionButton>
      </div>
      {message ? <p className="sam-text-body-secondary text-sam-fg">{message}</p> : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("apple_iap_admin_sandbox_empty")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("apple_iap_admin_col_member")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_status")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_sandbox_used")}</th>
                <th className="px-3 py-2">{t("apple_iap_admin_col_time")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-sam-border-soft" data-apple-iap-sandbox-row={r.userId}>
                  <td className="px-3 py-2">
                    <span className="block text-sam-fg">{r.nickname || "—"}</span>
                    <span className="block break-all sam-text-xxs text-sam-muted">{r.userId}</span>
                    <span className="block sam-text-helper text-sam-muted">{r.note}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.revokedAt ? t("apple_iap_admin_sandbox_revoked") : t("apple_iap_admin_sandbox_active")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatAdminNumber(r.usedPoints)}P / {formatAdminNumber(capPoints)}P
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatAdminManilaDateTime(r.addedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.revokedAt ? null : (
                      <AdminActionButton variant="secondary" disabled={busy} onClick={() => void submit(r.userId, false, "")}>
                        {t("apple_iap_admin_sandbox_revoke")}
                      </AdminActionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
