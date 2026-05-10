"use client";

import type { ReactNode } from "react";

export function StoresDeliveryLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="sam-domain-shell">{children}</div>;
}
