"use client";

/**
 * 어드민 › 메신저 › 연락처 동기화 운영 설정 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §6-5).
 * - 기능 켜기(킬스위치) · 가입 안내 · 한도 · 미사용 기기 보관 일수 · 「번호로 나를 찾기」 기본값 · 동의 문구 버전
 * - 현황 숫자 (재추천 제한 기록 실패 미복구 건수 = §5-3 감지)
 * 저장 = 최고관리자, 읽은 revision 으로만 (409 면 덮어쓰지 않음). 번호·이름·변환값은 다루지 않는다.
 */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

type Settings = {
  enabled: boolean;
  joinNoticeEnabled: boolean;
  joinNoticeCap: number;
  dailyNewNumberLimit: number;
  requestNumberLimit: number;
  idleSourceDays: number;
  defaultDiscoveryPolicy: "everyone" | "mutual" | "nobody";
  consentVersion: string;
  revision: number;
};
type Counts = {
  consentedUsers: number | null;
  activeSources: number | null;
  entries: number | null;
  openSuppressionFailures: number | null;
} | null;
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; settings: Settings; migrationApplied: boolean; hmacKeyConfigured: boolean; counts: Counts };

const FIELD = "w-full rounded-ui-rect border border-[var(--admin-console-border)] bg-white px-2 h-10 text-[14px]";

export function AdminMessengerContactsSettings({ canSave }: { canSave: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "stale" | "failed" | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setNotice(null);
    try {
      const res = await fetch("/api/admin/messenger/contacts-settings", { cache: "no-store", credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        settings?: Settings;
        migrationApplied?: boolean;
        hmacKeyConfigured?: boolean;
        counts?: Counts;
      };
      if (!res.ok || !j.ok || !j.settings) {
        setState({ kind: "error" });
        return;
      }
      setState({
        kind: "ready",
        settings: j.settings,
        migrationApplied: j.migrationApplied === true,
        hmacKeyConfigured: j.hmacKeyConfigured === true,
        counts: j.counts ?? null,
      });
      setDraft(j.settings);
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!draft || state.kind !== "ready") return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/messenger/contacts-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, expectedRevision: state.settings.revision }),
      });
      if (res.status === 409) {
        setNotice("stale");
        return;
      }
      if (!res.ok) {
        setNotice("failed");
        return;
      }
      setNotice("saved");
      await load();
      setNotice("saved");
    } catch {
      setNotice("failed");
    } finally {
      setSaving(false);
    }
  }, [draft, load, state]);

  if (state.kind === "loading") return <p className="p-4 text-[14px]">{t("admin_mc_loading")}</p>;
  if (state.kind === "error" || !draft) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-[14px]">{t("admin_mc_load_failed")}</p>
        <AdminActionButton onClick={() => void load()}>{t("admin_mc_refresh")}</AdminActionButton>
      </div>
    );
  }

  const disabled = !canSave || !state.migrationApplied || saving;
  const setNum = (k: keyof Settings) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [k]: Number(e.target.value) } : d));
  const counts = state.counts;

  return (
    <div className="max-w-[720px] space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">{t("admin_mc_title")}</h1>
          <p className="mt-1 text-[13px] text-[var(--admin-console-muted)]">{t("admin_mc_desc")}</p>
        </div>
        <AdminActionButton size="sm" onClick={() => void load()}>
          {t("admin_mc_refresh")}
        </AdminActionButton>
      </div>

      {!state.migrationApplied ? (
        <p className="rounded-ui-rect border border-[var(--admin-console-border)] bg-[#fff8e6] p-3 text-[13px]">{t("admin_mc_migration_missing")}</p>
      ) : null}
      {state.migrationApplied && !state.hmacKeyConfigured ? (
        <p className="rounded-ui-rect border border-[var(--admin-console-border)] bg-[#fff8e6] p-3 text-[13px]">{t("admin_mc_key_missing")}</p>
      ) : null}
      {!canSave ? <p className="text-[13px] text-[var(--admin-console-muted)]">{t("admin_mc_super_only")}</p> : null}

      <section className="space-y-3 rounded-ui-rect border border-[var(--admin-console-border)] bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={draft.enabled}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          <span>
            <span className="block text-[14px] font-semibold">{t("admin_mc_enabled")}</span>
            <span className="block text-[13px] text-[var(--admin-console-muted)]">{t("admin_mc_enabled_desc")}</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={draft.joinNoticeEnabled}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, joinNoticeEnabled: e.target.checked })}
          />
          <span>
            <span className="block text-[14px] font-semibold">{t("admin_mc_join_notice")}</span>
            <span className="block text-[13px] text-[var(--admin-console-muted)]">{t("admin_mc_join_notice_desc")}</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[13px]">
            {t("admin_mc_join_notice_cap")}
            <input type="number" min={0} max={1000} className={FIELD} value={draft.joinNoticeCap} disabled={disabled} onChange={setNum("joinNoticeCap")} />
          </label>
          <label className="text-[13px]">
            {t("admin_mc_daily_limit")}
            <input type="number" min={100} max={20000} className={FIELD} value={draft.dailyNewNumberLimit} disabled={disabled} onChange={setNum("dailyNewNumberLimit")} />
          </label>
          <label className="text-[13px]">
            {t("admin_mc_request_limit")}
            <input type="number" min={100} max={2000} className={FIELD} value={draft.requestNumberLimit} disabled={disabled} onChange={setNum("requestNumberLimit")} />
          </label>
          <label className="text-[13px]">
            {t("admin_mc_idle_days")}
            <input type="number" min={30} max={730} className={FIELD} value={draft.idleSourceDays} disabled={disabled} onChange={setNum("idleSourceDays")} />
          </label>
          <label className="text-[13px]">
            {t("admin_mc_default_policy")}
            <select
              className={FIELD}
              value={draft.defaultDiscoveryPolicy}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, defaultDiscoveryPolicy: e.target.value as Settings["defaultDiscoveryPolicy"] })}
            >
              <option value="everyone">{t("admin_mc_policy_everyone")}</option>
              <option value="mutual">{t("admin_mc_policy_mutual")}</option>
              <option value="nobody">{t("admin_mc_policy_nobody")}</option>
            </select>
          </label>
          <label className="text-[13px]">
            {t("admin_mc_consent_version")}
            <input
              className={FIELD}
              value={draft.consentVersion}
              maxLength={32}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, consentVersion: e.target.value })}
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <AdminActionButton variant="primary" disabled={disabled} aria-busy={saving} onClick={() => void save()}>
            {saving ? t("admin_mc_saving") : t("admin_mc_save")}
          </AdminActionButton>
          <span className="text-[12px] text-[var(--admin-console-muted)]">
            {t("admin_mc_revision")} {state.settings.revision}
          </span>
          {notice === "saved" ? <span className="text-[13px]">{t("admin_mc_saved")}</span> : null}
          {notice === "stale" ? <span className="text-[13px] text-[var(--admin-console-danger,#c0392b)]">{t("admin_mc_stale")}</span> : null}
          {notice === "failed" ? <span className="text-[13px] text-[var(--admin-console-danger,#c0392b)]">{t("admin_mc_save_failed")}</span> : null}
        </div>
      </section>

      {counts ? (
        <section className="rounded-ui-rect border border-[var(--admin-console-border)] bg-white p-4">
          <h2 className="mb-2 text-[15px] font-semibold">{t("admin_mc_counts_title")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            <dt>{t("admin_mc_count_consented")}</dt>
            <dd className="text-right tabular-nums">{counts.consentedUsers ?? "—"}</dd>
            <dt>{t("admin_mc_count_sources")}</dt>
            <dd className="text-right tabular-nums">{counts.activeSources ?? "—"}</dd>
            <dt>{t("admin_mc_count_entries")}</dt>
            <dd className="text-right tabular-nums">{counts.entries ?? "—"}</dd>
            <dt>{t("admin_mc_count_failures")}</dt>
            <dd
              className={`text-right tabular-nums ${
                (counts.openSuppressionFailures ?? 0) > 0 ? "font-semibold text-[var(--admin-console-danger,#c0392b)]" : ""
              }`}
            >
              {counts.openSuppressionFailures ?? "—"}
            </dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
