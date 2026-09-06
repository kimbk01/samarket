"use client";

import { useEffect, useId, useState } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { acquireOwnerOverlayBodyLock } from "@/lib/business/owner-overlay-body-lock";
import { OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
import { X, ExternalLink } from "lucide-react";

/**
 * Owner Store Preview — PRIMARY stays in Owner context.
 * Embeds the real buyer public store URL (same document the customer sees).
 * Secondary: open public page in a new tab.
 */
export function OwnerStorePreviewModal({
  open,
  slug,
  onClose,
}: {
  open: boolean;
  slug: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const publicHref = slug?.trim() ? `/stores/${encodeURIComponent(slug.trim())}` : null;

  useEffect(() => {
    if (!open) return;
    const release = acquireOwnerOverlayBodyLock("store_preview");
    return release;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [slug, open]);

  if (!open || !publicHref) return null;

  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-owner-store-preview="1"
        className={`${OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS} z-[90]`}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sam-border bg-sam-surface px-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sam-fg hover:bg-sam-surface-muted"
            aria-label={t("common_close")}
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-sam-fg">
            {t("biz_nav_public_store")}
          </h2>
          <a
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--biz-primary)] hover:bg-sam-surface-muted"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">{t("biz_nav_public_store_open_external")}</span>
          </a>
        </header>
        <div className="relative min-h-0 flex-1 bg-sam-app">
          {!iframeLoaded ?
            <p className="absolute inset-0 flex items-center justify-center text-sm text-sam-muted">
              {t("common_loading")}
            </p>
          : null}
          <iframe
            title={t("biz_nav_public_store")}
            src={publicHref}
            className="h-full w-full border-0 bg-white"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </div>
    </BodyPortal>
  );
}
