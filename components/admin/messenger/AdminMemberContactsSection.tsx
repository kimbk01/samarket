"use client";

/**
 * 어드민 › 회원 상세 › 연락처 동기화 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §17 어드민 · 3단계).
 * 동의·철회 이력 · 번호 등록 여부 · 기기 출처 · 숨긴 추천 수 · 받은 가입 안내 수 + 기기별 연락처 삭제(사유 필수 · 감사 기록).
 * 번호·이름·변환값은 다루지 않는다.
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type View = {
  consent: { consentedAt: string | null; withdrawnAt: string | null; consentVersion: string | null; accountSyncEnabled: boolean } | null;
  registeredPhone: boolean;
  sources: {
    id: string;
    platform: string;
    status: string;
    permissionState: string;
    lastUsedAt: string;
    entryCount: number;
  }[];
  suppressionCount: number;
  joinNoticesReceived: number;
};

export function AdminMemberContactsSection({ userId }: { userId: string }) {
  const { t, language } = useI18n();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/messenger/contacts/users/${encodeURIComponent(userId)}`, { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean } & View;
      setView(res.ok && j.ok ? j : null);
    } catch {
      setView(null);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!view) return null;

  const removeSource = async (sourceId: string) => {
    const confirmed = await confirmAdminAction({
      ko: language !== "en",
      title: t("admin_mc_member_delete_title"),
      description: t("admin_mc_member_delete_desc"),
      confirmLabel: t("admin_mc_member_delete_source"),
      destructive: true,
      action: "delete",
    });
    if (!confirmed.ok || !confirmed.reason) return;
    const reason = confirmed.reason;
    setBusy(sourceId);
    try {
      const res = await fetch(`/api/admin/messenger/contacts/users/${encodeURIComponent(userId)}/sources/${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setNotice(res.ok ? t("admin_mc_member_deleted") : t("admin_mc_save_failed"));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const c = view.consent;
  return (
    <section className="mt-4 rounded-ui-rect border border-[var(--admin-console-border)] bg-white p-4" data-admin-member-contacts="">
      <h2 className="mb-2 text-[16px] font-semibold">{t("admin_mc_member_title")}</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        {c?.consentedAt ? (
          <>
            <dt>{t("admin_mc_member_consented_at")}</dt>
            <dd className="text-right tabular-nums">
              {formatAdminManilaDateTime(c.consentedAt)} · {c.consentVersion ?? "—"}
            </dd>
          </>
        ) : (
          <>
            <dt>{t("admin_mc_member_consented_at")}</dt>
            <dd className="text-right">{t("admin_mc_member_not_consented")}</dd>
          </>
        )}
        {c?.withdrawnAt ? (
          <>
            <dt>{t("admin_mc_member_withdrawn_at")}</dt>
            <dd className="text-right tabular-nums">{formatAdminManilaDateTime(c.withdrawnAt)}</dd>
          </>
        ) : null}
        {c ? (
          <>
            <dt>{t("admin_mc_member_account_sync")}</dt>
            <dd className="text-right">{c.accountSyncEnabled ? t("admin_mc_member_on") : t("admin_mc_member_off")}</dd>
          </>
        ) : null}
        <dt>{t("admin_mc_member_registered")}</dt>
        <dd className="text-right">{view.registeredPhone ? t("admin_mc_member_registered_yes") : t("admin_mc_member_registered_no")}</dd>
        <dt>{t("admin_mc_member_suppressions")}</dt>
        <dd className="text-right tabular-nums">{view.suppressionCount}</dd>
        <dt>{t("admin_mc_member_join_received")}</dt>
        <dd className="text-right tabular-nums">{view.joinNoticesReceived}</dd>
      </dl>
      <h3 className="mb-1 mt-3 text-[14px] font-semibold">{t("admin_mc_member_sources")}</h3>
      {view.sources.length === 0 ? (
        <p className="text-[13px] text-[var(--admin-console-muted)]">{t("admin_mc_member_no_sources")}</p>
      ) : (
        <ul className="divide-y divide-[var(--admin-console-border)]">
          {view.sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block font-semibold">{s.platform}</span>
                <span className="block text-[12px] text-[var(--admin-console-muted)]">
                  {t("admin_mc_member_source_meta", {
                    status: s.status,
                    permission: s.permissionState,
                    used: formatAdminManilaDateTime(s.lastUsedAt),
                    count: s.entryCount,
                  })}
                </span>
              </span>
              {s.status === "active" ? (
                <AdminActionButton size="sm" variant="danger" disabled={busy !== null} aria-busy={busy === s.id} onClick={() => void removeSource(s.id)}>
                  {t("admin_mc_member_delete_source")}
                </AdminActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {notice ? <p className="mt-2 text-[13px]">{notice}</p> : null}
    </section>
  );
}
