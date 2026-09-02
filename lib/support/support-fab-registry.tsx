"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DISABLED_SUPPORT_CONTEXT,
  type SupportContext,
} from "@/lib/support/support-context";

type SupportFabRegistryValue = {
  context: SupportContext;
  publish: (next: SupportContext) => void;
  clear: () => void;
};

const SupportFabRegistryContext = createContext<SupportFabRegistryValue | null>(null);

export function SupportFabRegistryProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<SupportContext>(DISABLED_SUPPORT_CONTEXT);

  const publish = useCallback((next: SupportContext) => {
    setContext(next);
  }, []);

  const clear = useCallback(() => {
    setContext(DISABLED_SUPPORT_CONTEXT);
  }, []);

  const value = useMemo(
    () => ({ context, publish, clear }),
    [context, publish, clear]
  );

  return (
    <SupportFabRegistryContext.Provider value={value}>{children}</SupportFabRegistryContext.Provider>
  );
}

export function useSupportFabRegistry(): SupportFabRegistryValue {
  const ctx = useContext(SupportFabRegistryContext);
  if (!ctx) {
    throw new Error("useSupportFabRegistry must be used within SupportFabRegistryProvider");
  }
  return ctx;
}
