"use client";

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

type FeedAdToast = {
  requestId: string;
  label: string;
  href: string;
};

type Ctx = {
  pendingCount: number;
  userChargePendingCount: number;
  feedAdPendingCount: number;
  adminBellCount: number;
  refresh: () => Promise<void>;
};

const AdminStorePointPendingContext = createContext<Ctx>({
  pendingCount: 0,
  userChargePendingCount: 0,
  feedAdPendingCount: 0,
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

export function AdminStorePointPendingProvider({ children }: { children: ReactNode }) {
  const { t, safeT } = useI18n();
  const [pendingCount, setPendingCount] = useState(0);
  const [userChargePendingCount, setUserChargePendingCount] = useState(0);
  const [feedAdPendingCount, setFeedAdPendingCount] = useState(0);
  const [adminBellCount, setAdminBellCount] = useState(0);
  const [toast, setToast] = useState(false);
  const [feedAdToast, setFeedAdToast] = useState<FeedAdToast | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const feedToastTimeoutRef = useRef<number | null>(null);
  const rtTimeoutRef = useRef<number | null>(null);
  const seenFeedIdsRef = useRef<Set<string> | null>(null);
  const prevFeedCountRef = useRef(0);
  const feedSoundHydratedRef = useRef(false);
  const chargeSoundHydratedRef = useRef(false);

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

      setFeedAdToast({
        requestId,
        label,
        href: `/admin/feed-ad-requests/${encodeURIComponent(requestId)}`,
      });
      if (feedToastTimeoutRef.current) window.clearTimeout(feedToastTimeoutRef.current);
      feedToastTimeoutRef.current = window.setTimeout(() => {
        feedToastTimeoutRef.current = null;
        setFeedAdToast(null);
      }, 8000);

      ingestAdminRowSound({
        sourceTable: "feed_ad_requests",
        rowId: requestId,
      });
    },
    [safeT]
  );

  const seedPendingChargeRowsSilent = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/point-charges", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:point-charges:hydrate-seed",
        cacheTtlMs: 3_000,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: { id?: string }[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.requests)) return;
      for (const r of json.requests) {
        const id = String(r.id ?? "").trim();
        if (!id) continue;
        seedCanonicalSoundConsumed({
          identityKind: "admin_row",
          canonicalEventId: id,
        });
      }
      traceAdminSound("HYDRATE_SEED", {
        table: "point_charge_requests",
        count: json.requests.length,
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
          };
        };
        return { resOk: res.ok, json };
      });
      if (resOk && json.ok) {
        setAdminBellCount(Math.max(0, Math.floor(Number(json.total) || 0)));
        const storeCharges = Math.max(0, Math.floor(Number(json.by_category?.store_charges) || 0));
        const userCharges = Math.max(0, Math.floor(Number(json.by_category?.user_charges) || 0));
        const feedAds = Math.max(0, Math.floor(Number(json.by_category?.feed_ad_requests) || 0));
        setPendingCount(storeCharges);
        setUserChargePendingCount(userCharges);
        setFeedAdPendingCount(feedAds);
        if (!feedSoundHydratedRef.current) {
          feedSoundHydratedRef.current = true;
          void detectNewFeedAds();
        }
        if (!chargeSoundHydratedRef.current) {
          chargeSoundHydratedRef.current = true;
          void seedPendingChargeRowsSilent();
        }
        prevFeedCountRef.current = feedAds;
      }
    } catch {
      /* ignore */
    }
  }, [detectNewFeedAds, seedPendingChargeRowsSilent]);

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

    const scheduleRefresh = (showToast: boolean, eventType?: string) => {
      if (showToast && eventType === "INSERT") {
        if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
        setToast(true);
        toastTimeoutRef.current = window.setTimeout(() => {
          toastTimeoutRef.current = null;
          setToast(false);
        }, 4000);
      }
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

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      traceAdminSound("RT_AUTH", { authOk });
      if (cancelled) return;
      if (!authOk) {
        traceAdminSound("RT_SUBSCRIBE", { status: "NO_AUTH" });
        return;
      }

      channel = sb
        .channel("admin-point-charges-realtime")
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
              ingestAdminRowSound({
                sourceTable: "store_point_charge_requests",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
            }
            scheduleRefresh(true, payload.eventType);
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
              ingestAdminRowSound({
                sourceTable: "point_charge_requests",
                rowId,
                createdAt: createdAtFromPayload(payload),
              });
            }
            scheduleRefresh(false);
          }
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
            scheduleRefresh(false);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "feed_ad_requests" },
          () => scheduleRefresh(false)
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
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (feedToastTimeoutRef.current) window.clearTimeout(feedToastTimeoutRef.current);
      if (rtTimeoutRef.current) window.clearTimeout(rtTimeoutRef.current);
      if (channel) void sb.removeChannel(channel);
    };
  }, [refresh, markFeedAdAlert]);

  const value = useMemo(
    () => ({
      pendingCount,
      userChargePendingCount,
      feedAdPendingCount,
      adminBellCount,
      refresh,
    }),
    [adminBellCount, pendingCount, userChargePendingCount, feedAdPendingCount, refresh]
  );

  return (
    <AdminStorePointPendingContext.Provider value={value}>
      {toast ? (
        <div
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-ui-rect border border-[#006241]/40 bg-[#E8F5E9] px-4 py-3 text-sm font-medium text-[#1B5E20] shadow-lg"
          role="status"
        >
          {t("admin_store_point_charge_toast_new")}
        </div>
      ) : null}
      {feedAdToast ? (
        <Link
          href={feedAdToast.href}
          className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-ui-rect border border-sam-primary/40 bg-sam-surface px-4 py-3 text-sm font-medium text-sam-fg shadow-lg"
          role="status"
          data-testid="admin-feed-ad-toast"
        >
          <span className="block">{feedAdToast.label}</span>
          <span className="mt-1 block sam-text-helper text-sam-primary underline">
            {safeT("admin_feed_ad_toast_open", {
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
