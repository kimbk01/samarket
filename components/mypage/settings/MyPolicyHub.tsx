"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow } from "@/components/mypage/ds/MyRow";
import type { MessageKey } from "@/lib/i18n/messages";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { AppLegalKind, AppLegalLocale } from "@/lib/legal/app-legal-documents";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";

/**
 * 약관 및 개인정보 허브 — Owner mockup screen `myhub`.
 */
export type MyPolicyHubRow = {
  id:
    | "terms"
    | "privacy"
    | "business"
    | "community-notice"
    | "consent-history"
    | "marketing-consent"
    | "location-os";
  href?: string;
  titleKey: MessageKey;
  legalKind: AppLegalKind | null;
  descKey?: MessageKey;
};

export const MY_POLICY_HUB_ROWS: readonly MyPolicyHubRow[] = [
  { id: "terms", href: "/terms", titleKey: "mypage_comp_menu_support_terms_title", legalKind: "terms" },
  { id: "privacy", href: "/privacy", titleKey: "mypage_comp_settings_privacy_link", legalKind: "privacy" },
  { id: "business", href: "/business-info", titleKey: "mypage_comp_menu_support_business_title", legalKind: null },
  {
    id: "community-notice",
    titleKey: "mypage_policy_community_notice_title",
    legalKind: null,
    descKey: "mypage_policy_community_notice_desc",
  },
  {
    id: "consent-history",
    href: "/mypage/section/settings/consent-history",
    titleKey: "mypage_consent_history_title",
    legalKind: null,
    descKey: "mypage_consent_history_desc",
  },
  {
    id: "marketing-consent",
    href: "/mypage/section/settings/notifications",
    titleKey: "mypage_marketing_consent_title",
    legalKind: null,
    descKey: "mypage_marketing_consent_desc",
  },
  {
    id: "location-os",
    titleKey: "mypage_policy_location_os_title",
    legalKind: null,
    descKey: "mypage_policy_location_os_desc",
  },
];

export type PolicyDocMeta = { title: string | null; version: string | null; effectiveAt: string | null };

type LegalJson = {
  ok?: boolean;
  document?: { title?: unknown; version?: unknown; effective_at?: unknown } | null;
};

const SESSION_PREFIX = "mypage:policy-hub:";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parsePolicyDocMeta(json: LegalJson | null | undefined): PolicyDocMeta | null {
  if (!json?.ok || !json.document) return null;
  return {
    title: str(json.document.title),
    version: str(json.document.version),
    effectiveAt: str(json.document.effective_at),
  };
}

function readSession(key: string): PolicyDocMeta | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as PolicyDocMeta;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, meta: PolicyDocMeta): void {
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export async function loadPolicyDocMeta(kind: AppLegalKind, locale: AppLegalLocale): Promise<PolicyDocMeta | null> {
  const key = `${kind}:${locale}`;
  const cached = typeof window !== "undefined" ? readSession(key) : undefined;
  if (cached) return cached;
  return runSingleFlight(`legal:meta:${key}`, async () => {
    try {
      const res = await fetch(`/api/legal/${kind}?locale=${locale}`, { cache: "no-store" });
      if (!res.ok) return null;
      const meta = parsePolicyDocMeta((await res.json().catch(() => null)) as LegalJson | null);
      if (meta && typeof window !== "undefined") writeSession(key, meta);
      return meta;
    } catch {
      return null;
    }
  });
}

export function MyPolicyHub() {
  const { t, language } = useI18n();
  const locale: AppLegalLocale = language === "ko" ? "ko" : "en";
  const [meta, setMeta] = useState<Partial<Record<AppLegalKind, PolicyDocMeta | null>>>({});

  useEffect(() => {
    let cancelled = false;
    setMeta({});
    for (const row of MY_POLICY_HUB_ROWS) {
      const kind = row.legalKind;
      if (!kind) continue;
      void loadPolicyDocMeta(kind, locale).then((m) => {
        if (!cancelled) setMeta((prev) => ({ ...prev, [kind]: m }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <div data-testid="my-policy-hub">
      <MyGroup>
        {MY_POLICY_HUB_ROWS.map((row, index) => {
          const kind = row.legalKind;
          const loaded = kind ? kind in meta : true;
          const doc = kind ? meta[kind] ?? null : null;
          const effective = doc?.effectiveAt ? formatMypageDate(doc.effectiveAt) : "";
          let value: ReactNode = undefined;
          if (kind && (doc?.version || effective)) {
            value = (
              <span className="flex flex-col items-end leading-tight">
                {doc?.version ? <span className="text-[12px] text-sam-muted">{doc.version}</span> : null}
                {effective ? (
                  <span className="text-[12px] text-sam-meta">{t("mypage_s65_effective_date", { date: effective })}</span>
                ) : null}
              </span>
            );
          } else if (row.descKey) {
            value = <span className="text-[12px] text-sam-muted">{t(row.descKey)}</span>;
          }
          if (!row.href) {
            return (
              <div
                key={row.id}
                data-testid={`my-policy-hub-row-${row.id}`}
                className={`flex min-h-[52px] items-center justify-between gap-3 bg-sam-surface px-4 py-3 ${
                  index === 0 ? "rounded-t-ui-rect" : ""
                } ${index === MY_POLICY_HUB_ROWS.length - 1 ? "rounded-b-ui-rect" : "border-b border-sam-border"}`}
              >
                <div className="min-w-0 text-[15px] font-medium text-sam-fg">{doc?.title ?? t(row.titleKey)}</div>
                {value ? <div className="shrink-0">{value}</div> : null}
              </div>
            );
          }
          return (
            <MyRow
              key={row.id}
              first={index === 0}
              href={row.href}
              testId={`my-policy-hub-row-${row.id}`}
              title={doc?.title ?? t(row.titleKey)}
              value={value}
              valueState={kind ? (!loaded ? "loading" : value ? "ready" : "empty") : value ? "ready" : undefined}
            />
          );
        })}
      </MyGroup>
    </div>
  );
}
