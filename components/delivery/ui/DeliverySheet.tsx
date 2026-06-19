"use client";

import type { ReactNode } from "react";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliverySheet({
  open,
  title,
  titleId,
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
  if (!open) return null;

  return (
    <div className="delivery-ui fixed inset-0 z-[200]" role="presentation">
      <button
        type="button"
        className="delivery-sheet-backdrop"
        aria-label={"\uB2EB\uAE30"}
        onClick={onClose}
        disabled={busy}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex justify-center p-0 sm:px-3 sm:pb-3">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`pointer-events-auto ${DeliveryTheme.sheet.panel} ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
          style={{ paddingBottom: "max(12px, var(--safe-bottom))" }}
        >
          <div className={`${DeliveryTheme.sheet.pad} pb-2`}>
            <span className={DeliveryTheme.sheet.handle} aria-hidden />
            <h2
              id={titleId}
              className={`${DeliveryTheme.typo.sectionTitle} mt-2 text-center`}
            >
              {title}
            </h2>
          </div>
          <div className={`${DeliveryTheme.sheet.pad} pt-0`}>{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-[#ECECEC] px-4 pt-3">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
