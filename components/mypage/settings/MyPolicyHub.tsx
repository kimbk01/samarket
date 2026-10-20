"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow } from "@/components/mypage/ds/MyRow";
import type { MessageKey } from "@/lib/i18n/messages";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { AppLegalKind, AppLegalLocale } from "@/lib/legal/app-legal-documents";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";

/**
 * 약관 및 정책 허브 `/mypage/section/settings/terms` (최종 설계 S65 · X13/K9).
 * 1그룹 3행: 이용약관 → 개인정보처리방침 → 사업자 정보. 「기타 문서」 행 없음(DB kind 2종).
 * 행은 즉시 표시(제목 i18n 기본값), 약관·개인정보 행의 버전 칸만 Legal CMS(`GET /api/legal/{kind}`)로 채운다 —
 * 조회 실패면 버전 칸만 비우고 행 이동은 유지(목적지 화면이 자체 오류 처리). 홈 정책 그룹 3행은 그대로.
 */
export type MyPolicyHubRow = {
  id: "terms" | "privacy" | "business";
  href: "/terms" | "/privacy" | "/business-info";
  titleKey: MessageKey;
  /** Legal CMS 문서 종류 — 사업자 정보는 값 조회 생략 */
  legalKind: AppLegalKind | null;
};

export const MY_POLICY_HUB_ROWS: readonly MyPolicyHubRow[] = [
  { id: "terms", href: "/terms", titleKey: "mypage_comp_menu_support_terms_title", legalKind: "terms" },
  { id: "privacy", href: "/privacy", titleKey: "mypage_comp_settings_privacy_link", legalKind: "privacy" },
  { id: "business", href: "/business-info", titleKey: "mypage_comp_menu_support_business_title", legalKind: null },
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

/** Legal CMS 응답 → 허브 행 메타. 실패·문서 없음 → null(버전 칸 비움) */
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
    /* 저장 불가 — 다음 진입 때 다시 조회 */
  }
}

/** 버전 조회 — `runSingleFlight` + 세션 캐시(성공만 저장) */
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
          const value =
            doc && (doc.version || effective) ? (
              <span className="flex flex-col items-end leading-tight">
                {doc.version ? <span className="text-[12px] text-sam-muted">{doc.version}</span> : null}
                {effective ? (
                  <span className="text-[12px] text-sam-meta">{t("mypage_s65_effective_date", { date: effective })}</span>
                ) : null}
              </span>
            ) : undefined;
          return (
            <MyRow
              key={row.id}
              first={index === 0}
              href={row.href}
              testId={`my-policy-hub-row-${row.id}`}
              title={doc?.title ?? t(row.titleKey)}
              value={kind ? value : undefined}
              valueState={kind ? (!loaded ? "loading" : value ? "ready" : "empty") : undefined}
            />
          );
        })}
      </MyGroup>
    </div>
  );
}
