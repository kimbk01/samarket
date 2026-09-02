"use client";

import { useEffect, useMemo } from "react";
import { useSupportFabRegistry } from "@/lib/support/support-fab-registry";
import {
  DISABLED_SUPPORT_CONTEXT,
  type SupportContext,
} from "@/lib/support/support-context";

/**
 * Publishes explicit per-screen support context to the global FAB registry.
 * Unmount clears back to DISABLED — no pathname inference.
 */
export function SupportContextProvider({
  value,
  children,
}: {
  value: SupportContext;
  children: React.ReactNode;
}) {
  const { publish } = useSupportFabRegistry();
  const stableValue = useMemo(
    () => (value.enabled === true ? value : { ...value, enabled: false as const }),
    [
      value.enabled,
      value.audience,
      value.category,
      value.sourceSurface,
      value.referenceType,
      value.referenceId,
      value.storeId,
    ]
  );

  useEffect(() => {
    publish(stableValue);
    return () => {
      publish(DISABLED_SUPPORT_CONTEXT);
    };
  }, [stableValue, publish]);

  return <>{children}</>;
}
