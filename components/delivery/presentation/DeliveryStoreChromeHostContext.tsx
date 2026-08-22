"use client";

import { createContext, useContext, type ReactNode } from "react";

export type DeliveryStoreChromeHostContextValue = {
  /** Canonical soft-store chrome mount — transform-free sibling of store surface. */
  hostEl: HTMLElement | null;
  /** PresentationShell owns activation — not opacity/cover masking. */
  active: boolean;
};

const DeliveryStoreChromeHostContext = createContext<DeliveryStoreChromeHostContextValue>({
  hostEl: null,
  active: false,
});

export function DeliveryStoreChromeHostProvider({
  hostEl,
  active,
  children,
}: {
  hostEl: HTMLElement | null;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <DeliveryStoreChromeHostContext.Provider value={{ hostEl, active }}>
      {children}
    </DeliveryStoreChromeHostContext.Provider>
  );
}

export function useDeliveryStoreChromeHost(): DeliveryStoreChromeHostContextValue {
  return useContext(DeliveryStoreChromeHostContext);
}
