"use client";

import type { ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliveryAddressCard({
  selected,
  title,
  description,
  onSelect,
  disabled,
  radio,
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
  disabled?: boolean;
  radio?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`${DeliveryTheme.address.card} ${selected ? DeliveryTheme.address.cardSelected : ""} flex gap-3 text-left disabled:opacity-50`}
    >
      {radio ? <span className="mt-0.5 shrink-0">{radio}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={DeliveryTheme.address.title}>{title}</span>
        <p className={DeliveryTheme.address.body}>{description}</p>
      </span>
    </button>
  );
}
