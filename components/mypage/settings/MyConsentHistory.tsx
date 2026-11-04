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

  const notRecorded = safeT("mypage_consent_not_recorded", { fallbackKo: "기록 없음", fallbackEn: "Not recorded" });
  const versionDate = (v: { version: string | null; at: string | null }) =>
    v.at ? [v.version, formatMypageDate(v.at)].filter(Boolean).join(" · ") : notRecorded;

  const ageValue = (age: ConsentSummary["age"]) => {
    if (!age) return notRecorded;
    if (age.state === "legacy") {
      return safeT("mypage_consent_age_legacy", {
        fallbackKo: "기존 회원 · 연령 정책 이전 가입",
        fallbackEn: "Existing member · joined before the age policy",
      });
    }
    if (age.state === "verified") {
      const label = safeT("mypage_consent_age_verified", {
        fallbackKo: "만 14세 이상 확인",
        fallbackEn: "Confirmed 14+",
      });
      return age.attestedAt ? `${label} · ${formatMypageDate(age.attestedAt)}` : label;
    }
    if (age.state === "blocked") {
      return safeT("mypage_consent_age_blocked", { fallbackKo: "만 14세 미만", fallbackEn: "Under 14" });
    }
    return safeT("mypage_consent_age_missing", { fallbackKo: "미확인", fallbackEn: "Not confirmed" });
  };

  const marketingValue = (m: ConsentSummary["marketing"]) => {
    if (!m || m.source == null) return notRecorded;
    if (!m.enabled) {
      const off = safeT("mypage_consent_marketing_off", { fallbackKo: "받지 않음", fallbackEn: "Off" });
      return m.at ? `${off} · ${formatMypageDate(m.at)}` : off;
    }
    // Pre-existing members were switched on by default (2026-11-03) — not an explicit agreement.
    if (m.source === "existing_member_default") {
      return safeT("mypage_consent_marketing_default", {
        fallbackKo: "받음 · 기존 회원 기본 설정",
        fallbackEn: "On · existing-member default",
      });
    }
    const on = safeT("mypage_consent_marketing_on", { fallbackKo: "받음 · 동의", fallbackEn: "On · agreed" });
    return m.at ? `${on} · ${formatMypageDate(m.at)}` : on;
  };

  const kindLabel = (kind: string) =>
    kind === "terms"
      ? t("auth_consent_terms_link")
      : kind === "privacy"
        ? t("auth_consent_privacy_link")
        : kind === "marketing"
          ? t("mypage_marketing_consent_title")
          : safeT("mypage_consent_kind_age", { fallbackKo: "연령 확인", fallbackEn: "Age check" });
  const actionLabel = (action: string) =>
    action === "agree"
      ? safeT("mypage_consent_action_agree", { fallbackKo: "동의", fallbackEn: "Agreed" })
      : action === "withdraw"
        ? safeT("mypage_consent_action_withdraw", { fallbackKo: "철회", fallbackEn: "Withdrawn" })
        : safeT("mypage_consent_action_admin_note", { fallbackKo: "관리자 처리", fallbackEn: "Admin action" });
  const sourceLabel = (source: string) =>
    source === "signup"
      ? safeT("mypage_consent_source_signup", { fallbackKo: "가입", fallbackEn: "Sign-up" })
      : source === "reconsent"
        ? safeT("mypage_consent_source_reconsent", { fallbackKo: "재동의", fallbackEn: "Re-consent" })
        : source === "admin"
          ? safeT("mypage_consent_source_admin", { fallbackKo: "고객센터", fallbackEn: "Support" })
          : safeT("mypage_consent_source_settings", { fallbackKo: "설정", fallbackEn: "Settings" });

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
                title={t("auth_consent_terms_link")}
                value={<span className="text-[12px] text-sam-muted">{versionDate(summary.terms)}</span>}
              />
              <MyRow
                href="/privacy"
                testId="my-consent-summary-privacy"
                title={t("auth_consent_privacy_link")}
                value={<span className="text-[12px] text-sam-muted">{versionDate(summary.privacy)}</span>}
              />
              <div
                data-testid="my-consent-summary-age"
                className="flex min-h-[52px] items-center justify-between gap-3 border-b border-sam-border bg-sam-surface px-4 py-3"
              >
                <div className="min-w-0 text-[15px] font-medium text-sam-fg">
                  {safeT("mypage_consent_kind_age", { fallbackKo: "연령 확인", fallbackEn: "Age check" })}
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
                ? safeT("mypage_consent_history_unavailable", {
                    fallbackKo: "동의 이력 저장소가 아직 준비되지 않았습니다.",
                    fallbackEn: "Consent history storage is not ready yet.",
                  })
                : safeT("mypage_consent_history_empty", {
                    fallbackKo: "저장된 동의 이력이 없습니다.",
                    fallbackEn: "No consent history yet.",
                  })}
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
