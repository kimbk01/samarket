"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type MessengerSplitChromeState = {
  titleText: string;
  showBack: boolean;
  backHref?: string;
  headerActionsNode: ReactNode;
};

const DEFAULT_STATE: MessengerSplitChromeState = {
  titleText: "",
  showBack: false,
  headerActionsNode: null,
};

function chromeStateEqual(a: MessengerSplitChromeState, b: MessengerSplitChromeState): boolean {
  return (
    a.titleText === b.titleText &&
    a.showBack === b.showBack &&
    a.backHref === b.backHref &&
    a.headerActionsNode === b.headerActionsNode
  );
}

type MessengerSplitChromeContextValue = {
  chrome: MessengerSplitChromeState;
  setChrome: (next: MessengerSplitChromeState) => void;
  clearChrome: () => void;
};

const MessengerSplitChromeContext = createContext<MessengerSplitChromeContextValue | null>(null);

export function MessengerSplitChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<MessengerSplitChromeState>(DEFAULT_STATE);
  const setChrome = useCallback((next: MessengerSplitChromeState) => {
    setChromeState((prev) => (chromeStateEqual(prev, next) ? prev : next));
  }, []);
  const clearChrome = useCallback(() => {
    setChromeState((prev) => (chromeStateEqual(prev, DEFAULT_STATE) ? prev : DEFAULT_STATE));
  }, []);
  const value = useMemo(
    () => ({ chrome, setChrome, clearChrome }),
    [chrome, setChrome, clearChrome]
  );
  return (
    <MessengerSplitChromeContext.Provider value={value}>{children}</MessengerSplitChromeContext.Provider>
  );
}

export function useMessengerSplitChrome() {
  return useContext(MessengerSplitChromeContext);
}

/** split top bar 등록 — cleanup 은 unmount / disabled 시에만 */
export function useRegisterMessengerSplitChrome(
  enabled: boolean,
  titleText: string,
  showBack: boolean,
  backHref: string | undefined,
  headerActionsNode: ReactNode
) {
  const ctx = useMessengerSplitChrome();
  const setChrome = ctx?.setChrome;
  const clearChrome = ctx?.clearChrome;
  const headerActionsRef = useRef(headerActionsNode);
  headerActionsRef.current = headerActionsNode;

  useLayoutEffect(() => {
    if (!setChrome || !clearChrome) return;
    if (!enabled) {
      clearChrome();
      return;
    }
    setChrome({
      titleText,
      showBack,
      backHref,
      headerActionsNode: headerActionsRef.current,
    });
  }, [enabled, titleText, showBack, backHref, headerActionsNode, setChrome, clearChrome]);

  useLayoutEffect(() => {
    return () => {
      clearChrome?.();
    };
  }, [clearChrome]);
}
