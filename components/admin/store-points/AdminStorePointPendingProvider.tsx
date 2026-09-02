"use client";

/**
 * AdminOpsRealtimeBridge (P0-A/P0-B)
 *
 * Mounted once from AdminPlatformShell — NOT page-local.
 * Owner of Admin ops RT wake-up + sound ingest + awareness CTA for:
 *   - point_charge_requests (member)
 *   - store_point_charge_requests (owner)
 *   - member_admin_note_threads (Care inquiry, started_by=member)
 *   - platform_admin_inquiries (Owner → Admin)
 *   - feed_ad_requests
 *   - delivery_operation_alert_events
 *   - reports / store_reports / community_reports / stores (store apply)
 *
 * HARD LOCK:
 *   Badge digits come only from /api/admin/admin-bell (Action Queue).
 *   Sound must not invent badge counts.
 *   One INSERT → one ingestAdminRowSound (canonical rowId dedupe).
 *   Future report/store-apply subscribe here — do not add page RT.
 */

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  syncSupabaseRealtimeAuthFromSession,
  waitForSupabaseRealtimeAuth,
} from "@/lib/supabase/wait-for-realtime-auth";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import {
  adminMemberPointChargeDetailHref,
  adminStorePointChargeFocusHref,
} from "@/lib/admin/admin-point-charge-deeplink";
import {
  resolveAdminMemberCareInquiryHref,
  resolveAdminPlatformInquiryHref,
} from "@/lib/admin/admin-inquiry-deeplink";
import {
  resolveAdminCommunityReportHref,
  resolveAdminStoreApplicationHref,
  resolveAdminStoreReportHref,
  resolveAdminTradeReportHref,
} from "@/lib/admin/admin-ops-deeplink";
import { shouldPlayAdminOpsSound } from "@/lib/admin/admin-ops-sound-decision";
import {
  allowAdminOpsSoundAfterPreference,
  preferencesFromAdminOpsStorageRow,
} from "@/lib/admin/admin-ops-sound-preference-gate";
import { fetchAdminNotificationPreferencesRow } from "@/lib/notifications/fetch-admin-notification-preferences-client";
import {
  isAdminActionableCommunityReport,
  isAdminActionableStoreApproval,
  isAdminActionableStoreReport,
} from "@/lib/admin/admin-ops-actionable-status";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import { traceAdminSound } from "@/lib/notifications/admin-notification-sound-trace";
import {
  ingestAdminRowSound,
  seedCanonicalSoundConsumed,
} from "@/lib/notifications/notification-sound-decision";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { AdminNotificationPreferenceStorageRow } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";

type AwarenessToast = {
  kind:
    | "member_point_charge"
    | "store_point_charge"
    | "feed_ad"
    | "member_care_inquiry"
    | "platform_inquiry"
    | "trade_report"
    | "community_report"
    | "store_report"
    | "store_application";
  requestId: string;
  label: string;
  href: string;
};

type Ctx = {
  pendingCount: number;
  userChargePendingCount: number;
  feedAdPendingCount: number;
  /** TRADE_PROMO_PENDING — sidebar Trade ads-applications only */
  tradePromoPendingCount: number;
  /** A2-2 Support Center sidebar badge — support_cases OPEN|WAITING_ADMIN */
  supportActionableCount: number;
  /** @deprecated A2-2 legacy Care — always 0 for ops badge */
  memberInquiryOpenCount: number;
  /** @deprecated A2-2 legacy platform — always 0 for ops badge */
  platformInquiryOpenCount: number;
  tradeReportsCount: number;
  storeReportsCount: number;
  communityReportsCount: number;
  globalReportsCount: number;
  storeApplicationsCount: number;
  adminBellCount: number;
  refresh: () => Promise<void>;
};

const AdminStorePointPendingContext = createContext<Ctx>({
  pendingCount: 0,
  userChargePendingCount: 0,
  feedAdPendingCount: 0,
  tradePromoPendingCount: 0,
  supportActionableCount: 0,
  memberInquiryOpenCount: 0,
  platformInquiryOpenCount: 0,
  tradeReportsCount: 0,
  storeReportsCount: 0,
  communityReportsCount: 0,
  globalReportsCount: 0,
  storeApplicationsCount: 0,
  adminBellCount: 0,
  refresh: async () => {},
});

const SOUND_SEEN_KEY = "admin-feed-ad-sound-seen-v1";

function loadSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SOUND_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(SOUND_SEEN_KEY, JSON.stringify([...ids].slice(-80)));
  } catch {
    /* ignore */
  }
}

export function useAdminStorePointPendingCount(): Ctx {
  return useContext(AdminStorePointPendingContext);
}

/** Alias — AdminStorePointPendingProvider IS the AdminOpsRealtimeBridge. */
export const useAdminOpsRealtimeBridge = useAdminStorePointPendingCount;

export function AdminStorePointPendingProvider({ children }: { children: ReactNode }) {
  const { safeT } = useI18n();
  const [pendingCount, setPendingCount] = useState(0);
  const [userChargePendingCount, setUserChargePendingCount] = useState(0);
  const [feedAdPendingCount, setFeedAdPendingCount] = useState(0);
  const [tradePromoPendingCount, setTradePromoPendingCount] = useState(0);
  const [supportActionableCount, setSupportActionableCount] = useState(0);
  const [memberInquiryOpenCount, setMemberInquiryOpenCount] = useState(0);
  const [platformInquiryOpenCount, setPlatformInquiryOpenCount] = useState(0);
  const [tradeReportsCount, setTradeReportsCount] = useState(0);
  const [storeReportsCount, setStoreReportsCount] = useState(0);
  const [communityReportsCount, setCommunityReportsCount] = useState(0);
  const [globalReportsCount, setGlobalReportsCount] = useState(0);
  const [storeApplicationsCount, setStoreApplicationsCount] = useState(0);
  const [adminBellCount, setAdminBellCount] = useState(0);
  const [awarenessToast, setAwarenessToast] = useState<AwarenessToast | null>(null);
  const awarenessToastTimeoutRef = useRef<number | null>(null);
  const rtTimeoutRef = useRef<number | null>(null);
  const seenFeedIdsRef = useRef<Set<string> | null>(null);
  const prevFeedCountRef = useRef(0);
  const feedSoundHydratedRef = useRef(false);
  const chargeSoundHydratedRef = useRef(false);
  const inquirySoundHydratedRef = useRef(false);
  const reportOpsSoundHydratedRef = useRef(false);
  const [adminOpsPrefRow, setAdminOpsPrefRow] =
    useState<AdminNotificationPreferenceStorageRow | null>(null);

  const adminOpsPreferences: NormalizedNotificationPreferenceSnapshot = useMemo(
    () => preferencesFromAdminOpsStorageRow(adminOpsPrefRow),
    [adminOpsPrefRow]
  );

  useEffect(() => {
    let cancelled = false;
    const userId = getCurrentUser()?.id?.trim() ?? "";
    if (!userId) {
      setAdminOpsPrefRow(null);
      return;
    }
    void fetchAdminNotificationPreferencesRow(userId).then((row) => {
      if (!cancelled) setAdminOpsPrefRow(row);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ingestAdminOpsSoundIfPrefAllowed = useCallback(
    (input: {
      sourceTable: string;
      rowId: string;
      createdAt?: string | null;
    }) => {
      // Eligible event already selected by caller; preference only suppresses sound.
      if (!allowAdminOpsSoundAfterPreference(true, adminOpsPreferences)) return;
      ingestAdminRowSound(input);
    },
    [adminOpsPreferences]
  );

  const maybeIngestAdminOpsSound = useCallback(
    (input: {
      eventType: "INSERT" | "UPDATE";
      sourceTable: string;
      rowId: string;
      createdAt?: string | null;
      oldRow?: Record<string, unknown> | null;
      newRow?: Record<string, unknown> | null;
    }) => {
      const semanticEligible = shouldPlayAdminOpsSound({
        eventType: input.eventType,
        sourceTable: input.sourceTable,
        oldRow: input.oldRow,
        newRow: input.newRow,
      });
      if (!allowAdminOpsSoundAfterPreference(semanticEligible, adminOpsPreferences)) {
        return;
      }
      ingestAdminRowSound({
        sourceTable: input.sourceTable,
        rowId: input.rowId,
        createdAt: input.createdAt ?? undefined,
      });
    },
    [adminOpsPreferences]
  );

  const showAwarenessToast = useCallback((toast: AwarenessToast) => {
    setAwarenessToast(toast);
    if (awarenessToastTimeoutRef.current) window.clearTimeout(awarenessToastTimeoutRef.current);
    awarenessToastTimeoutRef.current = window.setTimeout(() => {
      awarenessToastTimeoutRef.current = null;
      setAwarenessToast(null);
    }, 8000);
  }, []);

  const markMemberPointChargeAlert = useCallback(
    (requestId: string, meta?: { amount?: number | null }) => {
      const id = String(requestId ?? "").trim();
      if (!id) return;
      const amount =
        meta?.amount != null && Number.isFinite(Number(meta.amount))
          ? `${Number(meta.amount).toLocaleString()}P`
          : "";
      const label = [
        safeT("admin_member_point_charge_toast_title", {
          fallbackKo: "회원 포인트 입금 신청",
          fallbackEn: "Member point deposit request",
        }),
        amount || null,
      ]
        .filter(Boolean)
        .join(" · ");
      showAwarenessToast({
        kind: "member_point_charge",
        requestId: id,
        label,
        href: adminMemberPointChargeDetailHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markStorePointChargeAlert = useCallback(
    (requestId: string, meta?: { amount?: number | null }) => {
      const id = String(requestId ?? "").trim();
      if (!id) return;
      const amount =
        meta?.amount != null && Number.isFinite(Number(meta.amount))
          ? `${Number(meta.amount).toLocaleString()}P`
          : "";
      const label = [
        safeT("admin_store_point_charge_toast_title", {
          fallbackKo: "과거 매장 운영 입금 기록",
          fallbackEn: "Historical store operations deposit",
        }),
        amount || null,
      ]
        .filter(Boolean)
        .join(" · ");
      showAwarenessToast({
        kind: "store_point_charge",
        requestId: id,
        label,
        href: adminStorePointChargeFocusHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markMemberCareInquiryAlert = useCallback(
    (threadId: string, meta?: { subject?: string | null }) => {
      const id = String(threadId ?? "").trim();
      if (!id) return;
      const subject = String(meta?.subject ?? "").trim().slice(0, 80);
      const label = [
        safeT("admin_member_care_inquiry_toast_title", {
          fallbackKo: "Owner/회원 1:1 문의",
          fallbackEn: "Owner/Member 1:1 inquiry",
        }),
        subject || null,
      ]
        .filter(Boolean)
        .join(" · ");
      showAwarenessToast({
        kind: "member_care_inquiry",
        requestId: id,
        label,
        href: resolveAdminMemberCareInquiryHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markPlatformInquiryAlert = useCallback(
    (inquiryId: string, meta?: { subject?: string | null; inquiryKind?: string | null }) => {
      const id = String(inquiryId ?? "").trim();
      if (!id) return;
      const subject = String(meta?.subject ?? "").trim().slice(0, 80);
      const kind = String(meta?.inquiryKind ?? "").trim();
      const title =
        kind === "account_request"
          ? safeT("admin_platform_inquiry_account_toast_title", {
              fallbackKo: "매장 입금계좌 문의",
              fallbackEn: "Store deposit-account inquiry",
            })
          : safeT("admin_platform_inquiry_toast_title", {
              fallbackKo: "매장 플랫폼 문의",
              fallbackEn: "Store platform inquiry",
            });
      const label = [title, subject || null].filter(Boolean).join(" · ");
      showAwarenessToast({
        kind: "platform_inquiry",
        requestId: id,
        label,
        href: resolveAdminPlatformInquiryHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markTradeReportAlert = useCallback(
    (reportId: string) => {
      const id = String(reportId ?? "").trim();
      if (!id) return;
      showAwarenessToast({
        kind: "trade_report",
        requestId: id,
        label: safeT("admin_trade_report_toast_title", {
          fallbackKo: "거래 신고",
          fallbackEn: "Trade report",
        }),
        href: resolveAdminTradeReportHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markCommunityReportAlert = useCallback(
    (reportId: string) => {
      const id = String(reportId ?? "").trim();
      if (!id) return;
      showAwarenessToast({
        kind: "community_report",
        requestId: id,
        label: safeT("admin_community_report_toast_title", {
          fallbackKo: "커뮤니티 신고",
          fallbackEn: "Community report",
        }),
        href: resolveAdminCommunityReportHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markStoreReportAlert = useCallback(
    (reportId: string, meta?: { storeName?: string | null }) => {
      const id = String(reportId ?? "").trim();
      if (!id) return;
      const storeName = String(meta?.storeName ?? "").trim().slice(0, 60);
      showAwarenessToast({
        kind: "store_report",
        requestId: id,
        label: [
          safeT("admin_store_report_toast_title", {
            fallbackKo: "매장 신고",
            fallbackEn: "Store report",
          }),
          storeName || null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: resolveAdminStoreReportHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markStoreApplicationAlert = useCallback(
    (storeId: string, meta?: { storeName?: string | null }) => {
      const id = String(storeId ?? "").trim();
      if (!id) return;
      const storeName = String(meta?.storeName ?? "").trim().slice(0, 60);
      showAwarenessToast({
        kind: "store_application",
        requestId: id,
        label: [
          safeT("admin_store_application_toast_title", {
            fallbackKo: "매장 등록 신청",
            fallbackEn: "Store application",
          }),
          storeName || null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: resolveAdminStoreApplicationHref(id),
      });
    },
    [safeT, showAwarenessToast]
  );

  const markFeedAdAlert = useCallback(
    async (requestId: string, meta?: { domain?: string; placement?: string; pointCost?: number }) => {
      if (typeof window === "undefined") return;
      if (!seenFeedIdsRef.current) seenFeedIdsRef.current = loadSeenIds();
      const seen = seenFeedIdsRef.current;
      if (!requestId || seen.has(requestId)) return;
      seen.add(requestId);
      persistSeenIds(seen);

      const domain = meta?.domain ?? "";
      const point = meta?.pointCost != null ? `${meta.pointCost.toLocaleString()}P` : "";
      const label = [
        safeT("admin_feed_ad_toast_title", {
          fallbackKo: "배너 광고 신청",
          fallbackEn: "Banner ad request",
        }),
        domain || null,
        point || null,
      ]
        .filter(Boolean)
        .join(" · ");

      showAwarenessToast({
        kind: "feed_ad",
        requestId,
        label,
        href: `/admin/feed-ad-requests/${encodeURIComponent(requestId)}`,
      });

      ingestAdminOpsSoundIfPrefAllowed({
        sourceTable: "feed_ad_requests",
        rowId: requestId,
      });
    },
    [safeT, showAwarenessToast, ingestAdminOpsSoundIfPrefAllowed]
  );

  const seedPendingChargeRowsSilent = useCallback(async () => {
    try {
      const [memberRes, storeRes] = await Promise.all([
        adminFetch("/api/admin/point-charges", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:point-charges:hydrate-seed",
          cacheTtlMs: 3_000,
        }),
        adminFetch("/api/admin/store-point-charges", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:store-point-charges:hydrate-seed",
          cacheTtlMs: 3_000,
        }),
      ]);
      const memberJson = (await memberRes.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: { id?: string }[];
      };
      const storeJson = (await storeRes.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: { id?: string }[];
      };
      let seeded = 0;
      if (memberRes.ok && memberJson.ok && Array.isArray(memberJson.requests)) {
        for (const r of memberJson.requests) {
          const id = String(r.id ?? "").trim();
          if (!id) continue;
          seedCanonicalSoundConsumed({
            identityKind: "admin_row",
            canonicalEventId: id,
          });
          seeded += 1;
        }
      }
      if (storeRes.ok && storeJson.ok && Array.isArray(storeJson.requests)) {
        for (const r of storeJson.requests) {
          const id = String(r.id ?? "").trim();
          if (!id) continue;
          seedCanonicalSoundConsumed({
            identityKind: "admin_row",
            canonicalEventId: id,
          });
          seeded += 1;
        }
      }
      traceAdminSound("HYDRATE_SEED", {
        table: "point_charge_requests+store_point_charge_requests",
        count: seeded,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const seedPendingInquiryRowsSilent = useCallback(async () => {
    try {
      const [careRes, platformRes] = await Promise.all([
        adminFetch("/api/admin/member-notes?kind=inquiry", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:member-notes:hydrate-seed",
          cacheTtlMs: 3_000,
        }),
        adminFetch("/api/admin/platform-inquiries", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:platform-inquiries:hydrate-seed",
          cacheTtlMs: 3_000,
        }),
      ]);
      const careJson = (await careRes.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: { id?: string; status?: string }[];
      };
      const platformJson = (await platformRes.json().catch(() => ({}))) as {
        ok?: boolean;
        inquiries?: { id?: string; status?: string }[];
      };
      let seeded = 0;
      if (careRes.ok && careJson.ok && Array.isArray(careJson.threads)) {
        for (const t of careJson.threads) {
          const id = String(t.id ?? "").trim();
          if (!id) continue;
          if (String(t.status ?? "") !== "open") continue;
          seedCanonicalSoundConsumed({
            identityKind: "admin_row",
            canonicalEventId: id,
          });
          seeded += 1;
        }
      }
      if (platformRes.ok && platformJson.ok !== false && Array.isArray(platformJson.inquiries)) {
        for (const r of platformJson.inquiries) {
          const id = String(r.id ?? "").trim();
          if (!id) continue;
          if (String(r.status ?? "") !== "open") continue;
          seedCanonicalSoundConsumed({
            identityKind: "admin_row",
            canonicalEventId: id,
          });
          seeded += 1;
        }
      }
      traceAdminSound("HYDRATE_SEED", {
        table: "member_admin_note_threads+platform_admin_inquiries",
        count: seeded,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const seedPendingReportOpsRowsSilent = useCallback(async () => {
    try {
      let seeded = 0;
      const sb = getSupabaseClient();
      if (sb) {
        const { data: tradeRows } = await sb
          .from("reports")
          .select("id, status")
          .in("status", ["pending", "reviewing"])
          .limit(200);
        if (Array.isArray(tradeRows)) {
          for (const r of tradeRows) {
            const id = String((r as { id?: string }).id ?? "").trim();
            if (!id) continue;
            seedCanonicalSoundConsumed({ identityKind: "admin_row", canonicalEventId: id });
            seeded += 1;
          }
        }
      }
      const [storeRepRes, communityRes, storesRes] = await Promise.all([
        adminFetch("/api/admin/store-reports", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:store-reports:hydrate-seed",
          cacheTtlMs: 3_000,
        }).catch(() => null),
        adminFetch("/api/admin/community-reports", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:community-reports:hydrate-seed",
          cacheTtlMs: 3_000,
        }).catch(() => null),
        adminFetch("/api/admin/stores", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:stores:hydrate-seed",
          cacheTtlMs: 3_000,
        }).catch(() => null),
      ]);
      if (storeRepRes?.ok) {
        const json = (await storeRepRes.json().catch(() => ({}))) as {
          ok?: boolean;
          reports?: { id?: string; status?: string }[];
        };
        if (json.ok && Array.isArray(json.reports)) {
          for (const r of json.reports) {
            const id = String(r.id ?? "").trim();
            if (!id || !isAdminActionableStoreReport(String(r.status ?? ""))) continue;
            seedCanonicalSoundConsumed({ identityKind: "admin_row", canonicalEventId: id });
            seeded += 1;
          }
        }
      }
      if (communityRes?.ok) {
        const json = (await communityRes.json().catch(() => ({}))) as {
          ok?: boolean;
          reports?: { id?: string; status?: string }[];
        };
        if (json.ok && Array.isArray(json.reports)) {
          for (const r of json.reports) {
            const id = String(r.id ?? "").trim();
            if (!id || !isAdminActionableCommunityReport(String(r.status ?? ""))) continue;
            seedCanonicalSoundConsumed({ identityKind: "admin_row", canonicalEventId: id });
            seeded += 1;
          }
        }
      }
      if (storesRes?.ok) {
        const json = (await storesRes.json().catch(() => ({}))) as {
          ok?: boolean;
          stores?: { id?: string; approval_status?: string }[];
        };
        if (json.ok && Array.isArray(json.stores)) {
          for (const s of json.stores) {
            const id = String(s.id ?? "").trim();
            if (!id || !isAdminActionableStoreApproval(String(s.approval_status ?? ""))) continue;
            seedCanonicalSoundConsumed({ identityKind: "admin_row", canonicalEventId: id });
            seeded += 1;
          }
        }
      }
      traceAdminSound("HYDRATE_SEED", {
        table: "reports+store_reports+community_reports+stores",
        count: seeded,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const detectNewFeedAds = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/feed-ad-requests?status=pending_review", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:feed-ad-pending:list",
        cacheTtlMs: 3_000,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: { id?: string; domain?: string; placement?: string; pointCost?: number }[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.requests)) return;
      if (!seenFeedIdsRef.current) seenFeedIdsRef.current = loadSeenIds();
      for (const r of json.requests) {
        const id = String(r.id ?? "");
        if (!id) continue;
        seenFeedIdsRef.current.add(id);
        seedCanonicalSoundConsumed({
          identityKind: "admin_row",
          canonicalEventId: id,
        });
      }
      persistSeenIds(seenFeedIdsRef.current);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { resOk, json } = await runSingleFlight("admin:bell:summary-json", async () => {
        const res = await adminFetch("/api/admin/admin-bell", {
          credentials: "include",
          cache: "no-store",
          dedupeKey: "admin:bell:summary-json",
          cacheTtlMs: 5_000,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          total?: number;
          by_category?: {
            charges?: number;
            store_charges?: number;
            user_charges?: number;
            feed_ad_requests?: number;
            trade_promo_pending?: number;
            support_actionable?: number;
            member_inquiry_open?: number;
            platform_inquiry_open?: number;
            trade_reports?: number;
            store_reports?: number;
            community_reports?: number;
            global_reports?: number;
            store_applications?: number;
          };
        };
        return { resOk: res.ok, json };
      });
      if (resOk && json.ok) {
        setAdminBellCount(Math.max(0, Math.floor(Number(json.total) || 0)));
        const storeCharges = Math.max(0, Math.floor(Number(json.by_category?.store_charges) || 0));
        const userCharges = Math.max(0, Math.floor(Number(json.by_category?.user_charges) || 0));
        const feedAds = Math.max(0, Math.floor(Number(json.by_category?.feed_ad_requests) || 0));
        const tradePromo = Math.max(0, Math.floor(Number(json.by_category?.trade_promo_pending) || 0));
        const supportActionable = Math.max(
          0,
          Math.floor(Number(json.by_category?.support_actionable) || 0)
        );
        const memberInquiry = Math.max(
          0,
          Math.floor(Number(json.by_category?.member_inquiry_open) || 0)
        );
        const platformInquiry = Math.max(
          0,
          Math.floor(Number(json.by_category?.platform_inquiry_open) || 0)
        );
        const tradeReports = Math.max(
          0,
          Math.floor(Number(json.by_category?.trade_reports) || 0)
        );
        const storeReports = Math.max(
          0,
          Math.floor(Number(json.by_category?.store_reports) || 0)
        );
        const communityReports = Math.max(
          0,
          Math.floor(Number(json.by_category?.community_reports) || 0)
        );
        const globalReports = Math.max(
          0,
          Math.floor(Number(json.by_category?.global_reports) || tradeReports + communityReports)
        );
        const storeApplications = Math.max(
          0,
          Math.floor(Number(json.by_category?.store_applications) || 0)
        );
        setPendingCount(storeCharges);
        setUserChargePendingCount(userCharges);
        setFeedAdPendingCount(feedAds);
        setTradePromoPendingCount(tradePromo);
        setSupportActionableCount(supportActionable);
        setMemberInquiryOpenCount(memberInquiry);
        setPlatformInquiryOpenCount(platformInquiry);
        setTradeReportsCount(tradeReports);
        setStoreReportsCount(storeReports);
        setCommunityReportsCount(communityReports);
        setGlobalReportsCount(globalReports);
        setStoreApplicationsCount(storeApplications);
        if (!feedSoundHydratedRef.current) {
          feedSoundHydratedRef.current = true;
          void detectNewFeedAds();
        }
        if (!chargeSoundHydratedRef.current) {
          chargeSoundHydratedRef.current = true;
          void seedPendingChargeRowsSilent();
        }
        if (!inquirySoundHydratedRef.current) {
          inquirySoundHydratedRef.current = true;
          void seedPendingInquiryRowsSilent();
        }
        if (!reportOpsSoundHydratedRef.current) {
          reportOpsSoundHydratedRef.current = true;
          void seedPendingReportOpsRowsSilent();
        }
        prevFeedCountRef.current = feedAds;
      }
    } catch {
      /* ignore */
    }
  }, [
    detectNewFeedAds,
    seedPendingChargeRowsSilent,
    seedPendingInquiryRowsSilent,
    seedPendingReportOpsRowsSilent,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onUpdated = () => void refresh();
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, NOTIFICATION_SYNC_POLL_MS);

    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
      window.clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) {
      traceAdminSound("RT_CLIENT", { ok: false, reason: "no_supabase_client" });
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof sb.channel> | null = null;

    const scheduleRefresh = () => {
      if (rtTimeoutRef.current) window.clearTimeout(rtTimeoutRef.current);
      rtTimeoutRef.current = window.setTimeout(() => {
        rtTimeoutRef.current = null;
        void runSingleFlight("admin:store-point-charges:realtime", () => refresh());
      }, 300);
    };

    const rowIdFromPayload = (payload: { new?: unknown; old?: unknown }) => {
      const next = payload.new && typeof payload.new === "object" ? (payload.new as { id?: unknown }) : null;
      const prev = payload.old && typeof payload.old === "object" ? (payload.old as { id?: unknown }) : null;
      return String(next?.id ?? prev?.id ?? "").trim();
    };

    const createdAtFromPayload = (payload: { new?: unknown }) => {
      const next =
        payload.new && typeof payload.new === "object"
          ? (payload.new as { created_at?: unknown; requested_at?: unknown })
          : null;
      const v = next?.created_at ?? next?.requested_at;
      return typeof v === "string" && v.trim() ? v : null;
    };

    const amountFromPayload = (payload: { new?: unknown }) => {
      const next =
        payload.new && typeof payload.new === "object"
          ? (payload.new as { point_amount?: unknown })
          : null;
      const n = Number(next?.point_amount);
      return Number.isFinite(n) ? n : null;
    };

    const rowAsRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === "object" ? (value as Record<string, unknown>) : null;

    const handleReportOpsChange = (
      sourceTable: "reports" | "store_reports" | "community_reports" | "stores",
      payload: { eventType?: string; new?: unknown; old?: unknown }
    ) => {
      const eventType = payload.eventType === "INSERT" ? "INSERT" : "UPDATE";
      const newRow = rowAsRecord(payload.new);
      const oldRow = rowAsRecord(payload.old);
      const rowId = String(newRow?.id ?? oldRow?.id ?? "").trim();
      if (eventType === "INSERT" && rowId) {
        if (
          shouldPlayAdminOpsSound({
            eventType: "INSERT",
            sourceTable,
            newRow,
            oldRow,
          })
        ) {
          maybeIngestAdminOpsSound({
            eventType: "INSERT",
            sourceTable,
            rowId,
            createdAt: createdAtFromPayload(payload),
            newRow,
            oldRow,
          });
          if (sourceTable === "reports") {
            markTradeReportAlert(rowId);
          } else if (sourceTable === "community_reports") {
            markCommunityReportAlert(rowId);
          } else if (sourceTable === "store_reports") {
            markStoreReportAlert(rowId);
          } else if (sourceTable === "stores") {
            markStoreApplicationAlert(rowId, {
              storeName: typeof newRow?.store_name === "string" ? newRow.store_name : null,
            });
          }
        }
      }
      scheduleRefresh();
    };

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      traceAdminSound("RT_AUTH", { authOk });
      if (cancelled) return;
      if (!authOk) {
        traceAdminSound("RT_SUBSCRIBE", { status: "NO_AUTH" });
        return;
      }

      channel = sb
        .channel("admin-ops-realtime-bridge")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "store_point_charge_requests" },
          (payload) => {
            const rowId = rowIdFromPayload(payload);
            traceAdminSound("RT_INSERT", {
              table: "store_point_charge_requests",
              eventType: payload.eventType,
              rowId,
              newKeys:
                payload.new && typeof payload.new === "object" ? Object.keys(payload.new as object) : [],
            });
            if (payload.eventType === "INSERT" && rowId) {
              ingestAdminOpsSoundIfPrefAllowed({
                sourceTable: "store_point_charge_requests",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
              markStorePointChargeAlert(rowId, { amount: amountFromPayload(payload) });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "point_charge_requests" },
          (payload) => {
            const rowId = rowIdFromPayload(payload);
            traceAdminSound("RT_INSERT", {
              table: "point_charge_requests",
              eventType: payload.eventType,
              rowId,
              newKeys:
                payload.new && typeof payload.new === "object" ? Object.keys(payload.new as object) : [],
            });
            if (payload.eventType === "INSERT" && rowId) {
              ingestAdminOpsSoundIfPrefAllowed({
                sourceTable: "point_charge_requests",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
              markMemberPointChargeAlert(rowId, { amount: amountFromPayload(payload) });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "member_admin_note_threads" },
          (payload) => {
            const row = payload.new as {
              id?: string;
              started_by?: string;
              status?: string;
              subject?: string;
            };
            const rowId = String(row?.id ?? "").trim();
            const startedBy = String(row?.started_by ?? "member").trim();
            const status = String(row?.status ?? "").trim();
            traceAdminSound("RT_INSERT", {
              table: "member_admin_note_threads",
              eventType: payload.eventType,
              rowId,
              startedBy,
              status,
            });
            if (rowId && startedBy === "member" && status === "open") {
              ingestAdminOpsSoundIfPrefAllowed({
                sourceTable: "member_admin_note_threads",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
              markMemberCareInquiryAlert(rowId, { subject: row.subject });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "member_admin_note_threads" },
          () => scheduleRefresh()
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "platform_admin_inquiries" },
          (payload) => {
            const row = payload.new as {
              id?: string;
              status?: string;
              subject?: string;
              inquiry_kind?: string;
            };
            const rowId = String(row?.id ?? "").trim();
            const status = String(row?.status ?? "").trim();
            traceAdminSound("RT_INSERT", {
              table: "platform_admin_inquiries",
              eventType: payload.eventType,
              rowId,
              status,
            });
            if (rowId && status === "open") {
              ingestAdminOpsSoundIfPrefAllowed({
                sourceTable: "platform_admin_inquiries",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
              markPlatformInquiryAlert(rowId, {
                subject: row.subject,
                inquiryKind: row.inquiry_kind,
              });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "platform_admin_inquiries" },
          () => scheduleRefresh()
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "feed_ad_requests" },
          (payload) => {
            const row = payload.new as {
              id?: string;
              status?: string;
              domain?: string;
              placement?: string;
              point_cost?: number;
            };
            const rowId = String(row?.id ?? "").trim();
            traceAdminSound("RT_INSERT", {
              table: "feed_ad_requests",
              eventType: payload.eventType,
              rowId,
              status: row?.status ?? null,
            });
            if (String(row.status ?? "") === "pending_review" && rowId) {
              void markFeedAdAlert(rowId, {
                domain: row.domain,
                placement: row.placement,
                pointCost: row.point_cost,
              });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "feed_ad_requests" },
          () => scheduleRefresh()
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "delivery_operation_alert_events" },
          (payload) => {
            const rowId = rowIdFromPayload(payload);
            traceAdminSound("RT_INSERT", {
              table: "delivery_operation_alert_events",
              eventType: payload.eventType,
              rowId,
            });
            if (rowId) {
              ingestAdminOpsSoundIfPrefAllowed({
                sourceTable: "delivery_operation_alert_events",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
            }
            scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reports" },
          (payload) => handleReportOpsChange("reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reports" },
          (payload) => handleReportOpsChange("reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "store_reports" },
          (payload) => handleReportOpsChange("store_reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "store_reports" },
          (payload) => handleReportOpsChange("store_reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "community_reports" },
          (payload) => handleReportOpsChange("community_reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "community_reports" },
          (payload) => handleReportOpsChange("community_reports", payload)
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "stores" },
          (payload) => handleReportOpsChange("stores", payload)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "stores" },
          (payload) => handleReportOpsChange("stores", payload)
        )
        .subscribe((status) => {
          traceAdminSound("RT_SUBSCRIBE", { status });
          if (status === "SUBSCRIBED") {
            void syncSupabaseRealtimeAuthFromSession(sb);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (awarenessToastTimeoutRef.current) window.clearTimeout(awarenessToastTimeoutRef.current);
      if (rtTimeoutRef.current) window.clearTimeout(rtTimeoutRef.current);
      if (channel) void sb.removeChannel(channel);
    };
  }, [
    refresh,
    markFeedAdAlert,
    markMemberPointChargeAlert,
    markStorePointChargeAlert,
    markMemberCareInquiryAlert,
    markPlatformInquiryAlert,
    markTradeReportAlert,
    markCommunityReportAlert,
    markStoreReportAlert,
    markStoreApplicationAlert,
    maybeIngestAdminOpsSound,
    ingestAdminOpsSoundIfPrefAllowed,
  ]);

  const value = useMemo(
    () => ({
      pendingCount,
      userChargePendingCount,
      feedAdPendingCount,
      tradePromoPendingCount,
      supportActionableCount,
      memberInquiryOpenCount,
      platformInquiryOpenCount,
      tradeReportsCount,
      storeReportsCount,
      communityReportsCount,
      globalReportsCount,
      storeApplicationsCount,
      adminBellCount,
      refresh,
    }),
    [
      adminBellCount,
      pendingCount,
      userChargePendingCount,
      feedAdPendingCount,
      tradePromoPendingCount,
      supportActionableCount,
      memberInquiryOpenCount,
      platformInquiryOpenCount,
      tradeReportsCount,
      storeReportsCount,
      communityReportsCount,
      globalReportsCount,
      storeApplicationsCount,
      refresh,
    ]
  );

  return (
    <AdminStorePointPendingContext.Provider value={value}>
      {awarenessToast ? (
        <Link
          href={awarenessToast.href}
          className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-ui-rect border border-sam-primary/40 bg-sam-surface px-4 py-3 text-sm font-medium text-sam-fg shadow-lg"
          role="status"
          data-testid={
            awarenessToast.kind === "member_point_charge"
              ? "admin-member-point-charge-toast"
              : awarenessToast.kind === "store_point_charge"
                ? "admin-store-point-charge-toast"
                : awarenessToast.kind === "member_care_inquiry"
                  ? "admin-member-care-inquiry-toast"
                  : awarenessToast.kind === "platform_inquiry"
                    ? "admin-platform-inquiry-toast"
                    : awarenessToast.kind === "trade_report"
                      ? "admin-trade-report-toast"
                      : awarenessToast.kind === "community_report"
                        ? "admin-community-report-toast"
                        : awarenessToast.kind === "store_report"
                          ? "admin-store-report-toast"
                          : awarenessToast.kind === "store_application"
                            ? "admin-store-application-toast"
                            : "admin-feed-ad-toast"
          }
          data-request-id={awarenessToast.requestId}
        >
          <span className="block">{awarenessToast.label}</span>
          <span className="mt-1 block sam-text-helper text-sam-primary underline">
            {safeT("admin_ops_awareness_toast_open", {
              fallbackKo: "신청 상세 보기",
              fallbackEn: "Open request",
            })}
          </span>
        </Link>
      ) : null}
      {children}
    </AdminStorePointPendingContext.Provider>
  );
}
