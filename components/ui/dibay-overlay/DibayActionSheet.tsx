"use client";

import type { ReactNode } from "react";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayBottomSheet } from "./DibayBottomSheet";
import { DibayOverlayButton } from "./DibayOverlayActions";

export type DibayActionSheetItem = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export type DibayActionSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  items: DibayActionSheetItem[];
  cancelLabel: ReactNode;
  anchor?: "above-bottom-nav" | "device-bottom";
};

/** Vertical action list + separated cancel — Action Sheet canonical. */
export function DibayActionSheet({
  open,
  onClose,
  title,
  items,
  cancelLabel,
  anchor = "above-bottom-nav",
}: DibayActionSheetProps) {
  return (
    <DibayBottomSheet open={open} onClose={onClose} title={title} anchor={anchor}>
      <div className={OverlayUi.actionSheetList}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            className={item.danger ? OverlayUi.actionSheetItemDanger : OverlayUi.actionSheetItem}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {cancelLabel}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
