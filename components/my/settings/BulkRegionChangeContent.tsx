"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function BulkRegionChangeContent() {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = () => {
    setError((prev) => (prev === null ? prev : null));
    setSuccess((prev) => (prev === null ? prev : null));
    setConfirming((prev) => (prev ? prev : true));
  };

  const handleConfirm = async () => {
    setBusy((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    setSuccess((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch("/api/me/posts/bulk-region", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updatedCount?: number;
        location?: { label?: string | null; source?: string | null };
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : t("settings_bulk_region_error"));
        return;
      }
      const label =
        typeof json.location?.label === "string" ? json.location.label : t("settings_bulk_region_default_neighborhood");
      const count = Number.isFinite(json.updatedCount) ? Number(json.updatedCount) : 0;
      setSuccess(t("settings_bulk_region_success", { label, count: String(count) }));
      setConfirming((prev) => (prev ? false : prev));
    } catch {
      setError(t("settings_bulk_region_error"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">{t("settings_bulk_region_intro")}</p>
      {success ? (
        <div className="rounded-ui-rect bg-emerald-50 px-4 py-3 sam-text-body-secondary text-emerald-700">{success}</div>
      ) : null}
      {error ? (
        <div className="rounded-ui-rect bg-red-50 px-4 py-3 sam-text-body-secondary text-red-600">{error}</div>
      ) : null}
      {!confirming ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {busy ? t("settings_bulk_region_busy") : t("settings_bulk_region_run")}
        </button>
      ) : (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="sam-text-body text-sam-fg">{t("settings_bulk_region_confirm")}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming((prev) => (prev ? false : prev))}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body text-sam-fg"
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="rounded bg-signature px-3 py-1.5 sam-text-body font-medium text-white"
            >
              {busy ? t("settings_bulk_region_apply_busy") : t("common_confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
