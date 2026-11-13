"use client";

import { useEffect, useState } from "react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLegalKind } from "@/lib/legal/app-legal-documents";
import { splitLegalBodyParagraphs } from "@/lib/legal/app-legal-documents";
import { DIBAY_ONBOARDING_PRIMARY_BTN } from "@/lib/ui/dibay-onboarding-styles";

type Props = {
  open: boolean;
  kind: AppLegalKind | null;
  onClose: () => void;
  /**
   * 이미 받은 원문(특정 버전) — 있으면 지금 게시본을 다시 불러오지 않고 이 글을 보여 준다
   * (매장 입점 계약: 동의한 버전 원문·서명할 버전 원문).
   */
  document?: { title: string; body: string; version: string } | null;
};

/**
 * In-app legal document sheet (Owner mockup) — closing preserves parent checkbox state.
 */
export function ConsentLegalDocSheet({ open, kind, onClose, document: preloaded = null }: Props) {
  const { t, language, safeT } = useI18n();
  const locale = language === "en" ? "en" : "ko";
  const [title, setTitle] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (preloaded) {
      setLoading(false);
      setError(null);
      setTitle(preloaded.title);
      setParagraphs(splitLegalBodyParagraphs(preloaded.body));
      setVersion(preloaded.version || null);
      return;
    }
    if (!kind) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setParagraphs([]);
    setTitle("");
    setVersion(null);
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
          return;
        }
        setError(
          safeT("auth_consent_doc_load_failed"),
        );
      } catch {
        if (!cancelled) {
          setError(
            safeT("auth_consent_doc_load_failed"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, locale, safeT, preloaded]);

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={title || t("auth_consent_doc_sheet_title")}
      heightRatio={0.85}
      footer={
        <button type="button" className={DIBAY_ONBOARDING_PRIMARY_BTN} onClick={onClose}>
          {safeT("auth_consent_doc_sheet_ok")}
        </button>
      }
    >
      <div className="space-y-3 px-1 pb-2" data-testid="consent-legal-doc-sheet" data-user-content="">
        {version ? <p className="text-[12px] text-sam-meta">{version}</p> : null}
        {loading ? <p className="text-[14px] text-sam-muted">{t("common_loading")}</p> : null}
        {error ? (
          <p className="text-[14px] text-sam-danger" role="alert">
            {error}
          </p>
        ) : null}
        {!loading &&
          !error &&
          paragraphs.map((p, i) => (
            <p key={i} className="text-[14px] leading-relaxed text-sam-fg">
              {p}
            </p>
          ))}
      </div>
    </DibayBottomSheet>
  );
}
