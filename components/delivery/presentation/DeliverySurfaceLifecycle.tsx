"use client";

import { createContext, useContext, type ReactNode } from "react";

export type DeliverySurfaceKind = "browse" | "store";
export type DeliverySurfaceLifecycleState = "active" | "entering" | "exiting" | "parked";

type DeliverySurfaceLifecycleValue = {
  kind: DeliverySurfaceKind;
  state: DeliverySurfaceLifecycleState;
};

const DeliverySurfaceLifecycleContext =
  createContext<DeliverySurfaceLifecycleValue | null>(null);

export function DeliverySurfaceLifecycleProvider({
  kind,
  state,
  children,
}: DeliverySurfaceLifecycleValue & { children: ReactNode }) {
  return (
    <DeliverySurfaceLifecycleContext.Provider value={{ kind, state }}>
      {children}
    </DeliverySurfaceLifecycleContext.Provider>
  );
}

/**
 * Outside DeliveryPresentationShell (hard/direct entry), the rendered surface is active.
 */
export function useDeliverySurfaceLifecycle(
  expectedKind: DeliverySurfaceKind
): DeliverySurfaceLifecycleState {
  const value = useContext(DeliverySurfaceLifecycleContext);
  if (!value || value.kind !== expectedKind) return "active";
  return value.state;
}
