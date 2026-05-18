"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { DeliveryButton } from "@/components/delivery/ui/DeliveryButton";
import { STORE_CART_CLEAR_CONFIRM } from "@/lib/stores/store-cart-policy";

const ARIA_CLOSE = "\uB2EB\uAE30";

/** 장바구니 비우기 — 배민식 가운데 확인 팝업 */
export function StoreCartClearConfirmDialog({
  open,
  storeName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  storeName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const [portalReady, setPortalReady] = useState(false);
  const label = storeName.trim() || "이 가게";

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
    <div className="delivery-ui" data-store-cart-clear-modal style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <button
        type="button"
        className="store-cart-clear-modal__backdrop"
        aria-label={ARIA_CLOSE}
        disabled={busy}
        onClick={onCancel}
      />
      <div className="store-cart-clear-modal__stage">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="store-cart-clear-modal__panel"
        >
          <h2 id={titleId} className="store-cart-clear-modal__title">
            {STORE_CART_CLEAR_CONFIRM.title}
          </h2>
          <p className="store-cart-clear-modal__message">
            <span className="store-cart-clear-modal__store">{label}</span> {STORE_CART_CLEAR_CONFIRM.body}
          </p>
          <div className="store-cart-clear-modal__actions">
            <DeliveryButton variant="outline" size="md" disabled={busy} onClick={onCancel}>
              {STORE_CART_CLEAR_CONFIRM.cancel}
            </DeliveryButton>
            <DeliveryButton variant="primary" size="md" disabled={busy} onClick={onConfirm}>
              {busy ? "비우는 중…" : STORE_CART_CLEAR_CONFIRM.confirm}
            </DeliveryButton>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
