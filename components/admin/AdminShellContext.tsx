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
import { usePathname } from "next/navigation";
import {
  fetchAdminMeSnapshot,
  peekAdminMeSnapshot,
  type AdminMeSnapshot,
} from "@/lib/admin-auth/admin-me-context";
import {
  logAdminMenuSwitch,
  logAdminRouteEnter,
} from "@/lib/admin/admin-perf-logger";

type AdminShellContextValue = {
  adminMe: AdminMeSnapshot | null;
  adminMeLoading: boolean;
  refreshAdminMe: () => Promise<AdminMeSnapshot | null>;
  /** 메뉴 클릭 직후 pathname 반영 전 하이라이트용 */
  pendingNavPath: string | null;
  setPendingNavPath: (path: string | null) => void;
  /** sidebar active 판정 — pending 우선, 없으면 pathname */
  effectiveNavPath: string;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell(): AdminShellContextValue {
  const ctx = useContext(AdminShellContext);
  if (!ctx) {
    throw new Error("useAdminShell must be used within AdminShellProvider");
  }
  return ctx;
}

export function AdminShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [adminMe, setAdminMe] = useState<AdminMeSnapshot | null>(() => peekAdminMeSnapshot());
  const [adminMeLoading, setAdminMeLoading] = useState(!peekAdminMeSnapshot());
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const routeEnterStartedRef = useRef(performance.now());
  const menuSwitchStartedRef = useRef(performance.now());
  const prevPathRef = useRef(pathname);

  const refreshAdminMe = useCallback(async () => {
    setAdminMeLoading(true);
    try {
      const next = await fetchAdminMeSnapshot({ force: true });
      setAdminMe(next);
      return next;
    } finally {
      setAdminMeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (peekAdminMeSnapshot()) return;
    let cancelled = false;
    void (async () => {
      setAdminMeLoading(true);
      try {
        const next = await fetchAdminMeSnapshot();
        if (!cancelled) setAdminMe(next);
      } finally {
        if (!cancelled) setAdminMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const now = performance.now();
    logAdminRouteEnter(pathname, routeEnterStartedRef.current);
    routeEnterStartedRef.current = now;

    const prev = prevPathRef.current;
    if (prev !== pathname) {
      logAdminMenuSwitch(prev, pathname, menuSwitchStartedRef.current);
      menuSwitchStartedRef.current = now;
      prevPathRef.current = pathname;
    }

    if (pendingNavPath) {
      const normalizedPending = pendingNavPath.split("?")[0] ?? pendingNavPath;
      const normalizedPath = pathname.split("?")[0] ?? pathname;
      if (
        normalizedPath === normalizedPending ||
        normalizedPath.startsWith(`${normalizedPending}/`)
      ) {
        setPendingNavPath(null);
      }
    }
  }, [pathname, pendingNavPath]);

  const effectiveNavPath = pendingNavPath ?? pathname;

  const setPendingNavPathWithPerf = useCallback((path: string | null) => {
    if (path) menuSwitchStartedRef.current = performance.now();
    setPendingNavPath(path);
  }, []);

  const value = useMemo(
    () => ({
      adminMe,
      adminMeLoading,
      refreshAdminMe,
      pendingNavPath,
      setPendingNavPath: setPendingNavPathWithPerf,
      effectiveNavPath,
    }),
    [adminMe, adminMeLoading, refreshAdminMe, pendingNavPath, setPendingNavPathWithPerf, effectiveNavPath]
  );

  return <AdminShellContext.Provider value={value}>{children}</AdminShellContext.Provider>;
}
