"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow } from "@/components/mypage/ds/MyRow";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";

type ConsentEventRow = {
  id: string;
  kind: string;
  action: string;
  source: string;
  version: string | null;
  createdAt: string;
};

type ConsentSummary = {
  terms: { version: string | null; at: string | null };
  privacy: { version: string | null; at: string | null };
  age: { state: "legacy" | "verified" | "blocked" | "missing"; attestedAt: string | null } | null;
  marketing: { enabled: boolean; at: string | null; source: string | null; version: string | null } | null;
};

/**
 * 동의 내역 — Owner mockup screen `history`.
 * Current state (terms · privacy · age · benefits/events) + append-only ledger (`GET /api/me/consent-events`).
 */
export function MyConsentHistory() {
  const { t, safeT } = useI18n();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ConsentEventRow[]>([]);
  const [summary, setSummary] = useState<ConsentSummary | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/consent-events", { cache: "no-store", credentials: "include" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          events?: ConsentEventRow[];
          summary?: ConsentSummary;
          degraded?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setFailed(true);
          return;
        }
        setEvents(Array.isArray(json.events) ? json.events : []);
        setSummary(json.summary ?? null);
        setDegraded(json.degraded ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const notRecorded = safeT("mypage_consent_not_recorded");
  const versionDate = (v: { version: string | null; at: string | null }) =>
    v.at ? (
      <span className="flex flex-col items-end leading-tight">
        {v.version ? <span className="text-[12px] text-sam-muted">{v.version}</span> : null}
        <span className="text-[12px] text-sam-meta">{formatMypageDate(v.at)}</span>
      </span>
    ) : (
      <span className="text-[12px] text-sam-muted">{notRecorded}</span>
    );

  const ageValue = (age: ConsentSummary["age"]) => {
    if (!age) return notRecorded;
    if (age.state === "legacy") {
      return safeT("mypage_consent_age_legacy");
    }
    if (age.state === "verified") {
      const label = safeT("mypage_consent_age_verified");
      return age.attestedAt ? `${label} · ${formatMypageDate(age.attestedAt)}` : label;
    }
    if (age.state === "blocked") {
      return safeT("mypage_consent_age_blocked");
    }
    return safeT("mypage_consent_age_missing");
  };

  const marketingValue = (m: ConsentSummary["marketing"]) => {
    if (!m || m.source == null) return notRecorded;
    if (!m.enabled) {
      const off = safeT("mypage_consent_marketing_off");
      return m.at ? `${off} · ${formatMypageDate(m.at)}` : off;
    }
    // Pre-existing members were switched on by default (2026-11-03) — not an explicit agreement, so not sent.
    if (m.source === "existing_member_default") {
      return safeT("mypage_consent_marketing_default");
    }
    const on = safeT("mypage_consent_marketing_on");
    return m.at ? `${on} · ${formatMypageDate(m.at)}` : on;
  };

  const kindLabel = (kind: string) =>
    kind === "terms"
      ? t("auth_consent_terms_link")
      : kind === "privacy"
        ? t("auth_consent_privacy_link")
        : kind === "marketing"
          ? t("mypage_marketing_consent_title")
          : safeT("mypage_consent_kind_age");
  const actionLabel = (action: string) =>
    action === "agree"
      ? safeT("mypage_consent_action_agree")
      : action === "withdraw"
        ? safeT("mypage_consent_action_withdraw")
        : safeT("mypage_consent_action_admin_note");
  const sourceLabel = (source: string) =>
    source === "signup"
      ? safeT("mypage_consent_source_signup")
      : source === "reconsent"
        ? safeT("mypage_consent_source_reconsent")
        : source === "admin"
          ? safeT("mypage_consent_source_admin")
          : safeT("mypage_consent_source_settings");

  return (
    <div data-testid="my-consent-history" className="space-y-3">
      <p className="px-1 text-[13px] text-sam-muted">{t("mypage_consent_history_desc")}</p>
      {loading ? (
        <p className="px-1 text-[13px] text-sam-meta">{t("common_loading")}</p>
      ) : failed ? (
        <p className="px-1 text-[13px] text-sam-danger" role="alert">
          {t("mypage_consent_history_load_failed")}
        </p>
      ) : (
        <>
          {summary ? (
            <MyGroup>
              <MyRow
                first
                href="/terms"
                testId="my-consent-summary-terms"
                title={t("mypage_comp_menu_support_terms_title")}
                value={versionDate(summary.terms)}
              />
              <MyRow
                href="/privacy"
                testId="my-consent-summary-privacy"
                title={t("mypage_comp_settings_privacy_link")}
                value={versionDate(summary.privacy)}
              />
              <div
                data-testid="my-consent-summary-age"
                className="flex min-h-[52px] items-center justify-between gap-3 border-b border-sam-border bg-sam-surface px-4 py-3"
              >
                <div className="min-w-0 text-[15px] font-medium text-sam-fg">
                  {safeT("mypage_consent_kind_age")}
                </div>
                <div className="shrink-0 text-[12px] text-sam-muted">{ageValue(summary.age)}</div>
              </div>
              <MyRow
                testId="my-consent-summary-marketing"
                href="/mypage/section/settings/notifications"
                title={t("mypage_marketing_consent_title")}
                value={<span className="text-[12px] text-sam-muted">{marketingValue(summary.marketing)}</span>}
              />
            </MyGroup>
          ) : null}
          {events.length === 0 ? (
            <p className="px-1 text-[13px] text-sam-muted">
              {degraded
                ? safeT("mypage_consent_history_unavailable")
                : safeT("mypage_consent_history_empty")}
            </p>
          ) : (
            <MyGroup>
              {events.map((ev, i) => (
                <div
                  key={ev.id}
                  className={`flex min-h-[44px] items-center justify-between gap-3 bg-sam-surface px-4 py-3 ${
                    i === 0 ? "rounded-t-ui-rect" : ""
                  } ${i === events.length - 1 ? "rounded-b-ui-rect" : "border-b border-sam-border"}`}
                  data-testid={`my-consent-history-row-${ev.id}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-sam-fg">
                      {kindLabel(ev.kind)} · {actionLabel(ev.action)}
                    </div>
                    <div className="text-[12px] text-sam-meta">
                      {[formatMypageDate(ev.createdAt), ev.version, sourceLabel(ev.source)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </MyGroup>
          )}
        </>
      )}
    </div>
  );
}
