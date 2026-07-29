"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MessengerSplitDetailOverrideApi = {
  detailOverride: ReactNode | null;
  setDetailOverride: (node: ReactNode | null) => void;
};

const MessengerSplitDetailOverrideContext = createContext<MessengerSplitDetailOverrideApi | null>(
  null
);

export function MessengerSplitDetailOverrideProvider({ children }: { children: ReactNode }) {
  const [detailOverride, setDetailOverrideState] = useState<ReactNode | null>(null);
  const setDetailOverride = useCallback((node: ReactNode | null) => {
    setDetailOverrideState(node);
  }, []);
  const value = useMemo(
    () => ({ detailOverride, setDetailOverride }),
    [detailOverride, setDetailOverride]
  );
  return (
    <MessengerSplitDetailOverrideContext.Provider value={value}>
      {children}
    </MessengerSplitDetailOverrideContext.Provider>
  );
}

export function useMessengerSplitDetailOverride(): MessengerSplitDetailOverrideApi | null {
  return useContext(MessengerSplitDetailOverrideContext);
}
