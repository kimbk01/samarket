"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, samTier1HeaderIconBadge } from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderInboxGlyph } from "@/lib/ui/tier1-header-glyphs";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_INBOX_CHANGED_EVENT } from "@/lib/admin/notifications/admin-notification-kinds";
import { NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";

/**
 * R13 — Admin inbox entry (ADMIN NOTIFICATION unread). Separate from the Action Queue bell:
 * this digit is unread notices, the bell digit is pending workload. Never summed.
 */
export function AdminInboxLink() {
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/inbox?summary=1", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:inbox:summary",
        cacheTtlMs: 0,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        unread?: number;
        delivery?: { outboxDead?: number; pushDead?: number; unavailable?: boolean };
      };
      if (!res.ok || !json.ok) {
        setFailed(true);
        return;
      }
      setUnread(Math.max(0, Math.floor(Number(json.unread) || 0)));
      // Super admins: permanent delivery failures (dead letters) also raise "!".
      const d = json.delivery;
      setFailed(Boolean(d && (d.unavailable || (d.outboxDead ?? 0) > 0 || (d.pushDead ?? 0) > 0)));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onChanged = () => void load();
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener(ADMIN_INBOX_CHANGED_EVENT, onChanged);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NOTIFICATION_SYNC_POLL_MS);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(ADMIN_INBOX_CHANGED_EVENT, onChanged);
      window.clearInterval(id);
    };
  }, [load]);

  const label = t("admin_inbox_link_label");
  return (
    <Link
      href="/admin/inbox"
      className={`relative ${SAM_TIER1_HEADER_ACTION_BTN_CLASS}`}
      aria-label={failed ? `${label} · !` : `${label} · ${unread}`}
      title={label}
      data-testid="admin-inbox-link"
      data-admin-inbox-state={failed ? "degraded" : "ok"}
    >
      <Tier1HeaderInboxGlyph />
      {failed ? (
        <span className={samTier1HeaderIconBadge}>!</span>
      ) : unread > 0 ? (
        <span className={samTier1HeaderIconBadge}>{unread > 99 ? "99+" : unread}</span>
      ) : null}
    </Link>
  );
}
