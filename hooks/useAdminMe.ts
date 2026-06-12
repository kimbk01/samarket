"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminMeSnapshot,
  isSuperAdminFromSnapshot,
  peekAdminMeSnapshot,
  type AdminMeSnapshot,
} from "@/lib/admin-auth/admin-me-context";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { AdminRole } from "@/lib/admin-menu-config";

export function useAdminMe() {
  const [snapshot, setSnapshot] = useState<AdminMeSnapshot | null>(() => peekAdminMeSnapshot());
  const [loading, setLoading] = useState(!peekAdminMeSnapshot());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchAdminMeSnapshot({ force: true });
      setSnapshot(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (peekAdminMeSnapshot()) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const next = await fetchAdminMeSnapshot();
        if (!cancelled) setSnapshot(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperAdmin = isSuperAdminFromSnapshot(snapshot);
  const uiRole: AdminRole = snapshot?.uiRole ?? "operator";
  const permissions = useMemo(() => snapshot?.permissions ?? [], [snapshot]);

  const hasPermission = useCallback(
    (key: AdminPermissionKey) => {
      if (isSuperAdmin) return true;
      if (permissions.includes(key)) return true;
      if (key === "users_edit_membership" && permissions.includes("users")) return true;
      return false;
    },
    [isSuperAdmin, permissions]
  );

  return { snapshot, loading, refresh, isSuperAdmin, uiRole, permissions, hasPermission };
}
