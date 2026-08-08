"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLegalKind } from "@/lib/legal/app-legal-documents";
import { splitLegalBodyParagraphs } from "@/lib/legal/app-legal-documents";

type LocaleDoc = {
  title: string;
  body: string;
  version?: string | null;
  source?: "cms" | "fallback";
};

type Props = {
  kind: AppLegalKind;
  fallbackTitleKey: MessageKey;
  fallbackBodyKeys: readonly MessageKey[];
  /** SSR/CMS seed so first paint is not empty (Play Console / no-JS-ish HTML). */
  initialByLocale?: Partial<Record<"ko" | "en", LocaleDoc>>;
  /** Prefer full static body over thin i18n key list when CMS/API miss. */
  staticFallbackByLocale?: Partial<Record<"ko" | "en", { title: string; body: string }>>;
};

function resolveLocale(language: string): "ko" | "en" {
  return language === "en" ? "en" : "ko";
}

export function LegalDocumentPageClient({
  kind,
  fallbackTitleKey,
  fallbackBodyKeys,
  initialByLocale,
  staticFallbackByLocale,
}: Props) {
  const { t, language, safeT } = useI18n();
  const locale = resolveLocale(language);
  const seeded = initialByLocale?.[locale] ?? null;

  const [title, setTitle] = useState<string | null>(seeded?.title ?? null);
  const [paragraphs, setParagraphs] = useState<string[] | null>(
    seeded?.body ? splitLegalBodyParagraphs(seeded.body) : null,
  );
  const [version, setVersion] = useState<string | null>(seeded?.version ?? null);
  const [source, setSource] = useState<"cms" | "fallback">(seeded?.source ?? "fallback");

  useEffect(() => {
    const next = initialByLocale?.[locale] ?? null;
    if (next?.title && next?.body) {
      setTitle(next.title);
      setParagraphs(splitLegalBodyParagraphs(next.body));
      setVersion(next.version ?? null);
      setSource(next.source ?? "cms");
    }
  }, [initialByLocale, locale]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/legal/${kind}?locale=${locale}&_ts=${Date.now()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          document?: { title?: string; body?: string; version?: string } | null;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.document?.title && json.document?.body) {
          setTitle(json.document.title);
          setParagraphs(splitLegalBodyParagraphs(json.document.body));
          setVersion(json.document.version ?? null);
          setSource("cms");
          return;
        }
      } catch {
        /* fall through */
      }
      if (!cancelled) {
        const staticFb = staticFallbackByLocale?.[locale];
        if (staticFb?.title && staticFb?.body) {
          setTitle(staticFb.title);
          setParagraphs(splitLegalBodyParagraphs(staticFb.body));
          setVersion(null);
          setSource("fallback");
          return;
        }
        setTitle(null);
        setParagraphs(null);
        setVersion(null);
        setSource("fallback");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, locale, staticFallbackByLocale]);

  const staticFb = staticFallbackByLocale?.[locale];
  const displayTitle = title ?? staticFb?.title ?? t(fallbackTitleKey);
  const displayParagraphs =
    paragraphs && paragraphs.length > 0
      ? paragraphs
      : staticFb?.body
        ? splitLegalBodyParagraphs(staticFb.body)
        : fallbackBodyKeys.map((key) => t(key));

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8" data-legal-kind={kind}>
      <h1 className="text-2xl font-semibold text-sam-fg">{displayTitle}</h1>
      {version ? (
        <p className="mt-2 text-xs text-sam-meta">
          {safeT("legal_document_version_label", {
            fallbackKo: `버전 ${version}`,
            fallbackEn: `Version ${version}`,
          })}
          {source === "cms" ? " · CMS" : ""}
        </p>
      ) : null}
      <div className="mt-4 space-y-3 sam-text-body leading-relaxed text-sam-fg">
        {displayParagraphs.map((p, i) => (
          <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
        ))}
      </div>
    </div>
  );
}
