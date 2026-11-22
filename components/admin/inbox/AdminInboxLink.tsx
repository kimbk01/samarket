"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, samTier1HeaderIconBadge } from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderInboxGlyph } from "@/lib/ui/tier1-header-glyphs";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { ADMIN_INBOX_CHANGED_EVENT } from "@/lib/admin/notifications/admin-notification-kinds";
import {
  ADMIN_INBOX_SUMMARY_EVENT,
  adminInboxSummaryViewFromPayload,
  peekAdminInboxSummary,
  publishAdminInboxSummary,
  type AdminInboxSummaryView,
} from "@/lib/admin/notifications/admin-inbox-summary-client";

/**
 * R13 — Admin inbox entry (ADMIN NOTIFICATION unread). Separate from the Action Queue bell:
 * this digit is unread notices, the bell digit is pending workload. Never summed.
 */
export function AdminInboxLink() {
  const { t } = useI18n();
  const [unread, setUnread] = useState(() => peekAdminInboxSummary()?.unread ?? 0);
  const [failed, setFailed] = useState(() => peekAdminInboxSummary()?.failed ?? false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/inbox?summary=1", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:inbox:summary",
        cacheTtlMs: 0,
      });
      const json = (await res.json().catch(() => ({}))) as Parameters<typeof adminInboxSummaryViewFromPayload>[0];
      // Super admins: permanent delivery failures (dead letters) also raise "!".
      publishAdminInboxSummary(adminInboxSummaryViewFromPayload(json, res.ok));
    } catch {
      publishAdminInboxSummary({ unread: peekAdminInboxSummary()?.unread ?? 0, failed: true });
    }
  }, []);

  /**
   * 2026-11-22 관리자 폴링 한 요청으로 — 75초 갱신·화면 돌아옴은 같은 화면 틀의 작업 대기 수 폴러가
   * `admin-bell?with_inbox=1` 로 함께 받아 `ADMIN_INBOX_SUMMARY_EVENT` 로 넘긴다(이 아이콘은 따로 폴링하지 않음).
   * 처음 화면에 아직 값이 없을 때와 받은 알림이 바뀐 때(`ADMIN_INBOX_CHANGED_EVENT`)만 직접 읽는다.
   */
  useEffect(() => {
    const onSummary = (e: Event) => {
      const v = (e as CustomEvent<AdminInboxSummaryView>).detail;
      if (!v) return;
      setUnread(v.unread);
      setFailed(v.failed);
    };
    window.addEventListener(ADMIN_INBOX_SUMMARY_EVENT, onSummary);
    const seeded = peekAdminInboxSummary();
    if (seeded) {
      setUnread(seeded.unread);
      setFailed(seeded.failed);
    } else {
      void load();
    }
    const onChanged = () => void load();
    window.addEventListener(ADMIN_INBOX_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(ADMIN_INBOX_SUMMARY_EVENT, onSummary);
      window.removeEventListener(ADMIN_INBOX_CHANGED_EVENT, onChanged);
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
