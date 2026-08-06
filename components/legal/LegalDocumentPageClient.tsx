"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLegalKind } from "@/lib/legal/app-legal-documents";
import { splitLegalBodyParagraphs } from "@/lib/legal/app-legal-documents";

type Props = {
  kind: AppLegalKind;
  fallbackTitleKey: MessageKey;
  fallbackBodyKeys: readonly MessageKey[];
};

export function LegalDocumentPageClient({ kind, fallbackTitleKey, fallbackBodyKeys }: Props) {
  const { t, language, safeT } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const [title, setTitle] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<string[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [source, setSource] = useState<"cms" | "fallback">("fallback");

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
        setTitle(null);
        setParagraphs(null);
        setVersion(null);
        setSource("fallback");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, locale]);

  const displayTitle = title ?? t(fallbackTitleKey);
  const displayParagraphs =
    paragraphs && paragraphs.length > 0
      ? paragraphs
      : fallbackBodyKeys.map((key) => t(key));

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
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
