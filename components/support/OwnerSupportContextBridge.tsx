"use client";

import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import {
  buildOwnerSupportContext,
  type OwnerSupportCategory,
} from "@/lib/support/support-context";

export function OwnerSupportContextBridge({
  enabled,
  category,
  sourceSurface,
  storeId,
  referenceType,
  referenceId,
  children,
}: {
  enabled: boolean;
  category: OwnerSupportCategory;
  sourceSurface: string;
  storeId?: string;
  referenceType?: string;
  referenceId?: string;
  children: React.ReactNode;
}) {
  return (
    <SupportContextProvider
      value={buildOwnerSupportContext({
        enabled,
        category,
        sourceSurface,
        storeId,
        referenceType,
        referenceId,
      })}
    >
      {children}
    </SupportContextProvider>
  );
}
