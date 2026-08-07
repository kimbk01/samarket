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
import { usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [hash, setHash] = useState("");
  const locationPath = `${search ? `${pathname}?${search}` : pathname}${hash}`;
  const [adminMe, setAdminMe] = useState<AdminMeSnapshot | null>(() => peekAdminMeSnapshot());
  const [adminMeLoading, setAdminMeLoading] = useState(!peekAdminMeSnapshot());
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const routeEnterStartedRef = useRef(performance.now());
  const menuSwitchStartedRef = useRef(performance.now());
  const prevPathRef = useRef(locationPath);

  useEffect(() => {
    const syncHash = () => setHash(typeof window !== "undefined" ? window.location.hash : "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname, search]);

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
    if (prev !== locationPath) {
      logAdminMenuSwitch(prev, locationPath, menuSwitchStartedRef.current);
      menuSwitchStartedRef.current = now;
      prevPathRef.current = locationPath;
    }

    if (pendingNavPath) {
      if (pendingNavPath === locationPath) {
        setPendingNavPath(null);
        return;
      }
      const pendingParts = pendingNavPath.split("#");
      const pendingBeforeHash = pendingParts[0] ?? pendingNavPath;
      const pendingHash = pendingParts.length > 1 ? `#${pendingParts.slice(1).join("#")}` : "";
      const pendingPathname = pendingBeforeHash.split("?")[0] ?? pendingBeforeHash;
      const pendingHasQuery = pendingBeforeHash.includes("?");
      const pendingHasHash = pendingHash.length > 0;
      if (pendingHasHash) {
        if (pathname === pendingPathname && hash === pendingHash) {
          setPendingNavPath(null);
        }
        return;
      }
      if (
        !pendingHasQuery &&
        (pathname === pendingPathname || pathname.startsWith(`${pendingPathname}/`))
      ) {
        setPendingNavPath(null);
      }
    }
  }, [pathname, locationPath, pendingNavPath, hash]);

  const effectiveNavPath = pendingNavPath ?? locationPath;

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
