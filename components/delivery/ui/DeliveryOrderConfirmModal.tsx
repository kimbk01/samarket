"use client";

import { DeliveryInfoCard } from "./DeliveryInfoCard";
import { DibayOverlayRoot, DibayOverlayButton, useOverlayTitleIds } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
 * Checkout order-confirm — Dibay Overlay SSOT shell; delivery info cards preserved.
 * Content chrome: app/delivery-order-confirm-modal.css (tokens → --overlay-*).
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
  const { titleId } = useOverlayTitleIds("delivery-ocm");

  return (
    <DibayOverlayRoot
      open={open}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      placement="center"
      zRole="dialog"
      labelledBy={titleId}
    >
      <div
        className={`${OverlayUi.dialogPanel} delivery-ui dibaY-ocm-card !max-w-[min(22.5rem,calc(100%-32px))] !p-0`}
        data-delivery-ocm
        data-dibay-overlay="delivery-order-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dibaY-ocm-header">
          <h2 id={titleId} className={`${OverlayUi.title} dibaY-ocm-title`}>
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

        <footer className={`${OverlayUi.actionsStack} dibaY-ocm-footer !mt-0`}>
          <DibayOverlayButton roleTone="primary" disabled={busy} onClick={onConfirm}>
            {busy ? BTN_CONFIRM_BUSY : BTN_CONFIRM}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="text" disabled={busy} onClick={onCancel}>
            {BTN_CANCEL}
          </DibayOverlayButton>
        </footer>
      </div>
    </DibayOverlayRoot>
  );
}
