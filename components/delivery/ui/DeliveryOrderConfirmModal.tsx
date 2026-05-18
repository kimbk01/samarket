"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DeliveryButton } from "./DeliveryButton";
import { DeliveryInfoCard } from "./DeliveryInfoCard";

const ARIA_CLOSE = "\uB2EB\uAE30";
const TITLE = "\uC8FC\uBB38 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694";
const LABEL_CONTACT = "\uC5F0\uB77D\uCC98";
const LABEL_ADDRESS = "\uC8FC\uC18C";
const LABEL_PAYMENT = "\uACB0\uC81C";
const LABEL_ORDER_ITEMS = "\uC8FC\uBB38\uC0C1\uD488";
const LABEL_REQUEST = "\uC694\uCCAD\uC0AC\uD56D";
const BTN_CONFIRM = "\uC8FC\uBB38 \uC811\uC218";
const BTN_CONFIRM_BUSY = "\uC811\uC218 \uC911\u2026";
const BTN_CANCEL = "\uCDE8\uC18C";

export type DeliveryOrderConfirmModalProps = {
  open: boolean;
  phoneLabel: string;
  addressLabel: string;
  paymentLabel: string;
  orderSummaryLabel: string;
  requestLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Checkout order-confirm popup — fixed layout per dibaY delivery UI spec.
 * Styles: app/delivery-order-confirm-modal.css (unlayered).
 */
export function DeliveryOrderConfirmModal({
  open,
  phoneLabel,
  addressLabel,
  paymentLabel,
  orderSummaryLabel,
  requestLabel,
  busy = false,
  onCancel,
  onConfirm,
}: DeliveryOrderConfirmModalProps) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !portalReady) return null;

  const node = (
    <div className="dibaY-ocm-root delivery-ui" data-delivery-ocm role="presentation">
      <button
        type="button"
        className="dibaY-ocm-backdrop"
        aria-label={ARIA_CLOSE}
        disabled={busy}
        onClick={onCancel}
      />
      <div className="dibaY-ocm-stage">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dibaY-ocm-title"
          className="dibaY-ocm-card"
        >
          <header className="dibaY-ocm-header">
            <h2 id="dibaY-ocm-title" className="dibaY-ocm-title">
              {TITLE}
            </h2>
          </header>

          <div className="dibaY-ocm-body">
            <DeliveryInfoCard label={LABEL_CONTACT} value={phoneLabel} />
            <DeliveryInfoCard label={LABEL_ADDRESS} value={addressLabel} multiline />
            <DeliveryInfoCard label={LABEL_PAYMENT} value={paymentLabel} />
            <DeliveryInfoCard label={LABEL_ORDER_ITEMS} value={orderSummaryLabel} multiline />
            <DeliveryInfoCard label={LABEL_REQUEST} value={requestLabel} multiline />
          </div>

          <footer className="dibaY-ocm-footer">
            <DeliveryButton variant="primary" size="full" disabled={busy} onClick={onConfirm}>
              {busy ? BTN_CONFIRM_BUSY : BTN_CONFIRM}
            </DeliveryButton>
            <DeliveryButton variant="ghost" size="full" disabled={busy} onClick={onCancel}>
              {BTN_CANCEL}
            </DeliveryButton>
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
