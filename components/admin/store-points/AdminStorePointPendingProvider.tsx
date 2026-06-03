"use client";

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
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";

type Ctx = {
  pendingCount: number;
  adminBellCount: number;
  refresh: () => Promise<void>;
};

const AdminStorePointPendingContext = createContext<Ctx>({
  pendingCount: 0,
  adminBellCount: 0,
  refresh: async () => {},
});

export function useAdminStorePointPendingCount(): Ctx {
  return useContext(AdminStorePointPendingContext);
}

export function AdminStorePointPendingProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pendingCount, setPendingCount] = useState(0);
  const [adminBellCount, setAdminBellCount] = useState(0);
  const [toast, setToast] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);
  const rtTimeoutRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { resOk, json } = await runSingleFlight("admin:bell:summary-json", async () => {
        const res = await fetch("/api/admin/admin-bell", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          total?: number;
          by_category?: { charges?: number };
        };
        return { resOk: res.ok, json };
      });
      if (resOk && json.ok) {
        setAdminBellCount(Math.max(0, Math.floor(Number(json.total) || 0)));
        setPendingCount(Math.max(0, Math.floor(Number(json.by_category?.charges) || 0)));
      }
    } catch {
      /* ignore */
    }
  }, []);

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
    if (!sb) return;

    const onChange = (payload?: { eventType?: string }) => {
      if (payload?.eventType === "INSERT") {
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

    const channel = sb
      .channel("admin-store-point-charges-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_point_charge_requests" },
        (payload) => onChange({ eventType: payload.eventType })
      )
      .subscribe();

    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (rtTimeoutRef.current) window.clearTimeout(rtTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ pendingCount, adminBellCount, refresh }),
    [adminBellCount, pendingCount, refresh]
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
      {children}
    </AdminStorePointPendingContext.Provider>
  );
}
