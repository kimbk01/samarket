"use client";

import { useEffect, useRef } from "react";
import { bindCheckoutConfirmHistoryClose } from "@/lib/stores/checkout-confirm-history-close";

/**
 * React binding for {@link bindCheckoutConfirmHistoryClose}.
 */
export function useCheckoutConfirmHistoryClose(open: boolean, onClose: () => void, busy = false): void {
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const binding = bindCheckoutConfirmHistoryClose({
      onClose: () => onCloseRef.current(),
      isBusy: () => busyRef.current,
    });
    return () => binding.dispose();
  }, [open]);
}
