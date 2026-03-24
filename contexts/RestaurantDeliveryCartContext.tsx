"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  computeGrandTotal,
  computeLineTotal,
  computeSubtotal,
} from "@/lib/stores/delivery-mock/cart-math";
import type {
  CartSelectedOption,
  DeliveryCartLine,
  RestaurantDeliveryProfile,
} from "@/lib/stores/delivery-mock/types";

function newLineId(): string {
  return `ln_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface RestaurantCartState {
  storeSlug: string | null;
  storeNameKo: string | null;
  storeId: string | null;
  profile: RestaurantDeliveryProfile | null;
  lines: DeliveryCartLine[];
}

const emptyState: RestaurantCartState = {
  storeSlug: null,
  storeNameKo: null,
  storeId: null,
  profile: null,
  lines: [],
};

interface RestaurantDeliveryCartContextValue {
  storeSlug: string | null;
  storeNameKo: string | null;
  storeId: string | null;
  profile: RestaurantDeliveryProfile | null;
  lines: DeliveryCartLine[];
  itemCount: number;
  subtotal: number;
  meetsMinOrder: boolean;
  minOrderShortage: number;
  addLine: (input: {
    storeSlug: string;
    storeNameKo: string;
    storeId: string;
    profile: RestaurantDeliveryProfile;
    menuItemId: string;
    menuName: string;
    basePrice: number;
    selections: CartSelectedOption[];
    quantity: number;
  }) => void;
  updateLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  grandTotalFor: (mode: "delivery" | "pickup") => number;
  deliveryFeeApplied: (mode: "delivery" | "pickup") => number;
}

const Ctx = createContext<RestaurantDeliveryCartContextValue | null>(null);

export function RestaurantDeliveryCartProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<RestaurantCartState>(emptyState);

  const addLine = useCallback(
    (input: {
      storeSlug: string;
      storeNameKo: string;
      storeId: string;
      profile: RestaurantDeliveryProfile;
      menuItemId: string;
      menuName: string;
      basePrice: number;
      selections: CartSelectedOption[];
      quantity: number;
    }) => {
      setS((prev) => {
        const next: RestaurantCartState =
          prev.storeSlug && prev.storeSlug !== input.storeSlug
            ? { ...emptyState }
            : { ...prev };

        const line: DeliveryCartLine = {
          lineId: newLineId(),
          menuItemId: input.menuItemId,
          menuName: input.menuName,
          basePrice: input.basePrice,
          selections: input.selections,
          quantity: input.quantity,
        };

        return {
          storeSlug: input.storeSlug,
          storeNameKo: input.storeNameKo,
          storeId: input.storeId,
          profile: input.profile,
          lines: [...next.lines, line],
        };
      });
    },
    []
  );

  const updateLineQuantity = useCallback((lineId: string, quantity: number) => {
    const q = Math.max(0, Math.min(99, Math.floor(quantity)));
    setS((prev) => {
      if (q === 0) {
        const lines = prev.lines.filter((l) => l.lineId !== lineId);
        if (lines.length === 0) return emptyState;
        return { ...prev, lines };
      }
      return {
        ...prev,
        lines: prev.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: q } : l)),
      };
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setS((prev) => {
      const lines = prev.lines.filter((l) => l.lineId !== lineId);
      if (lines.length === 0) return emptyState;
      return { ...prev, lines };
    });
  }, []);

  const clearCart = useCallback(() => setS(emptyState), []);

  const value = useMemo(() => {
    const subtotal = computeSubtotal(s.lines);
    const min = s.profile?.minOrderAmount ?? 0;
    const meetsMinOrder = s.lines.length === 0 || subtotal >= min;
    const minOrderShortage = Math.max(0, min - subtotal);

    const grandTotalFor = (mode: "delivery" | "pickup") => {
      const fee = s.profile?.deliveryFee ?? 0;
      return computeGrandTotal(subtotal, fee, mode);
    };

    const deliveryFeeApplied = (mode: "delivery" | "pickup") =>
      mode === "delivery" ? (s.profile?.deliveryFee ?? 0) : 0;

    const itemCount = s.lines.reduce((n, l) => n + l.quantity, 0);

    return {
      storeSlug: s.storeSlug,
      storeNameKo: s.storeNameKo,
      storeId: s.storeId,
      profile: s.profile,
      lines: s.lines,
      itemCount,
      subtotal,
      meetsMinOrder,
      minOrderShortage,
      addLine,
      updateLineQuantity,
      removeLine,
      clearCart,
      grandTotalFor,
      deliveryFeeApplied,
    };
  }, [s, addLine, updateLineQuantity, removeLine, clearCart]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRestaurantDeliveryCart(): RestaurantDeliveryCartContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useRestaurantDeliveryCart must be used within RestaurantDeliveryCartProvider");
  }
  return v;
}

/** Provider 밖(테스트)에서도 안전하게 */
export function useRestaurantDeliveryCartOptional(): RestaurantDeliveryCartContextValue | null {
  return useContext(Ctx);
}
