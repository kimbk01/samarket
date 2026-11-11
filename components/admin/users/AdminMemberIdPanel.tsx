"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";

/**
 * 어드민 회원 아이디 (설계안 v3 §3.4 · 시안 J) — 회원 아이디·기본 아이디·상태·본인 변경권·변경 이력·변경권 다시 주기.
 * 기본 아이디는 어드민에서만 보인다. 데이터: GET/POST `/api/admin/users/[id]/member-id`.
 */
type HistoryItem = {
  at: string;
  kind: "member_change" | "admin_change" | "admin_grant";
  before: string | null;
  after: string | null;
  reason: string | null;
};
type MemberIdPayload = {
  current: string | null;
  base: string | null;
  state: string;
  canChange: boolean;
  history: HistoryItem[];
};

const REASON_MAX = 300;

const STATE_KEY = {
  auto: "admin_member_id_state_auto",
  auto_legacy: "admin_member_id_state_auto_legacy",
  custom: "admin_member_id_state_custom",
  none: "admin_member_id_state_none",
} as const;

const HISTORY_KEY = {
  member_change: "admin_member_id_history_member_change",
  admin_change: "admin_member_id_history_admin_change",
  admin_grant: "admin_member_id_history_admin_grant",
} as const;

export function AdminMemberIdPanel({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { t, language } = useI18n();
  const [data, setData] = useState<MemberIdPayload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [grantOpen, setGrantOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/member-id`, { credentials: "include" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; memberId?: MemberIdPayload };
        if (cancelled) return;
        if (!r.ok || j.ok !== true || !j.memberId) {
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        setData(j.memberId);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const openGrant = () => {
    setReason("");
    setErrorText(null);
    setGrantOpen(true);
  };

  const submitGrant = useCallback(async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorText(t("admin_users_member_dibay_id_reason_required"));
      return;
    }
    setPending(true);
    setErrorText(null);
    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/member-id`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok !== true) {
        if (j.error === "change_right_available") setErrorText(t("admin_member_id_grant_already"));
        else if (j.error === "reason_required") setErrorText(t("admin_users_member_dibay_id_reason_required"));
        else if (j.error === "reason_too_long")
          setErrorText(t("admin_users_member_dibay_id_reason_too_long", { max: REASON_MAX }));
        else if (r.status === 401 || r.status === 403) setErrorText(t("admin_users_member_no_permission"));
        else setErrorText(t("admin_member_id_load_failed"));
        return;
      }
      setGrantOpen(false);
      setReloadKey((k) => k + 1);
    } catch {
      setErrorText(t("admin_member_id_load_failed"));
    } finally {
      setPending(false);
    }
  }, [reason, t, userId]);

  const stateKey = data ? (STATE_KEY[data.state as keyof typeof STATE_KEY] ?? STATE_KEY.none) : null;

  return (
    <section className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-member-id-panel="1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_member_id_panel_title")}</h2>
        {canEdit && data && !data.canChange && data.current ? (
          <AdminActionButton variant="secondary" onClick={openGrant} data-member-cta="dibay_id_grant">
            {t("admin_member_id_grant_cta")}
          </AdminActionButton>
        ) : null}
      </div>
      {loadFailed && !data ? (
        <p className="mt-2 text-[13px] text-sam-danger" role="alert">
          {t("admin_member_id_load_failed")}
        </p>
      ) : data ? (
        <>
          <dl className="mt-2 grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-sam-muted">{t("admin_member_id_current_label")}</dt>
            <dd className="font-mono text-sam-fg" data-member-id-current="1">
              {data.current ? `@${data.current}` : "—"}
            </dd>
            <dt className="text-sam-muted">{t("admin_member_id_base_label")}</dt>
            <dd className="min-w-0 text-sam-fg" data-member-id-base="1">
              <span className="font-mono">{data.base ?? "—"}</span>
              <span className="ml-2 text-[12px] text-sam-muted">{t("admin_member_id_base_note")}</span>
            </dd>
            <dt className="text-sam-muted">{t("admin_member_id_state_label")}</dt>
            <dd className="text-sam-fg" data-member-id-state={data.state}>
              {stateKey ? t(stateKey) : "—"}
            </dd>
            <dt className="text-sam-muted">{t("admin_member_id_right_label")}</dt>
            <dd className="text-sam-fg" data-member-id-can-change={data.canChange ? "1" : "0"}>
              {data.canChange ? t("admin_member_id_right_available") : t("admin_member_id_right_used")}
            </dd>
          </dl>
          <h3 className="mt-3 text-[13px] font-semibold text-sam-fg">{t("admin_member_id_history_title")}</h3>
          {data.history.length === 0 ? (
            <p className="mt-1 text-[12px] text-sam-muted">{t("admin_member_id_history_empty")}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-[12px]" data-member-id-history="1">
              {data.history.map((h, i) => (
                <li key={`${h.at}-${h.kind}-${i}`} className="flex flex-wrap gap-x-2 text-sam-fg">
                  <span className="tabular-nums text-sam-muted">
                    {formatPhtDisplayDateTime(h.at, language)} PHT
                  </span>
                  <span className="font-medium">{t(HISTORY_KEY[h.kind])}</span>
                  {h.before || h.after ? (
                    <span className="font-mono">
                      {h.before ? `@${h.before}` : ""}
                      {h.before && h.after ? " → " : ""}
                      {h.after ? `@${h.after}` : ""}
                    </span>
                  ) : null}
                  {h.reason ? (
                    <span className="text-sam-muted">{t("admin_member_id_history_reason", { reason: h.reason })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-[12px] text-sam-muted">{t("common_loading")}</p>
      )}
      <MemberAdminDialog
        open={grantOpen}
        title={t("admin_member_id_grant_title")}
        description={t("admin_member_id_grant_body")}
        size="small"
        dirty={reason.trim().length > 0}
        pending={pending}
        errorText={errorText}
        primaryLabel={t("admin_member_id_grant_primary")}
        primaryDisabled={!reason.trim()}
        onCancel={() => setGrantOpen(false)}
        onPrimary={() => void submitGrant()}
      >
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t("admin_member_id_grant_reason_label")}</span>
          <textarea
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            rows={2}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-member-id-grant-reason="1"
          />
        </label>
      </MemberAdminDialog>
    </section>
  );
}
