"use client";

import type { ReactNode } from "react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";

export function DeliverySheet({
  open,
  title,
  titleId: _titleId,
  busy = false,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  titleId: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="delivery-ui">
      <DibayBottomSheet
        open={open}
        onClose={() => {
          if (!busy) onClose();
        }}
        title={title}
        anchor="above-bottom-nav"
        footer={footer}
        ariaLabel={title}
        panelClassName="delivery-sheet-panel"
      >
        <div className="px-1 pb-1">{children}</div>
      </DibayBottomSheet>
    </div>
  );
}
