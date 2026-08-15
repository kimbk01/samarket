"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import {
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** ASCII-only source; avoids broken encoding in tooling */
const ARIA_CLOSE = "\uB2EB\uAE30";

export type DeliveryModalPlacement = "center" | "above-checkout-footer";

const CHECKOUT_ABOVE_FOOTER_PAD =
  "pb-[calc(5.25rem+var(--safe-bottom))]";

export function DeliveryModal({
  open,
  title,
  titleId,
  busy = false,
  onBackdropClose,
  children,
  footer,
  footerLayout = "stack",
  placement = "center",
}: {
  open: boolean;
  title: string;
  titleId: string;
  busy?: boolean;
  onBackdropClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `row` — cancel/confirm buttons on one line */
  footerLayout?: "stack" | "row";
  placement?: DeliveryModalPlacement;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const titleFallbackId = useId();
  const resolvedTitleId = titleId || titleFallbackId;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !portalReady) return null;

  const stageAlign =
    placement === "above-checkout-footer"
      ? `items-end ${CHECKOUT_ABOVE_FOOTER_PAD}`
      : "items-center";

  const node = (
    <div
      className={`delivery-ui ${OverlayUi.root} dibay-overlay-root--center ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`}
      data-delivery-modal-root
      data-entered={entered ? "true" : "false"}
      data-dibay-overlay="delivery-modal"
    >
      <button
        type="button"
        className={`${OverlayUi.backdrop} !opacity-100`}
        aria-label={ARIA_CLOSE}
        disabled={busy}
        onClick={() => {
          if (!busy) onBackdropClose();
        }}
      />
      <div className={`relative z-[1] flex w-full max-w-full justify-center ${stageAlign}`}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={resolvedTitleId}
          className={`${OverlayUi.dialogPanel} !max-w-[min(92vw,24rem)] ${DeliveryTheme.modal.panel}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={resolvedTitleId} className={`${OverlayUi.title} ${DeliveryTheme.modal.title}`}>
            {title}
          </h2>
          <div className="delivery-modal-body">{children}</div>
          {footer ? (
            <div
              className={
                footerLayout === "row" ? DeliveryTheme.modal.footerRow : DeliveryTheme.modal.footer
              }
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export function DeliveryModalInfoGroup({ children }: { children: ReactNode }) {
  return <div className={DeliveryTheme.modal.section}>{children}</div>;
}

export function DeliveryModalInfoBlock({
  label,
  children,
  multiline = false,
}: {
  label: string;
  children: ReactNode;
  /** Long address blocks (Baemin-style wrap) */
  multiline?: boolean;
}) {
  const valueClass = multiline
    ? `${DeliveryTheme.modal.sectionValue} delivery-modal-section__value--address`
    : DeliveryTheme.modal.sectionValue;

  return (
    <section className="delivery-modal-info-block">
      <p className={DeliveryTheme.modal.sectionLabel}>{label}</p>
      <div className={valueClass}>{children}</div>
    </section>
  );
}
