/**
 * Hardware / WebView back parity for cart checkout confirm overlay.
 *
 * Header already resolves CLOSE via resolveDibayBackTarget(overlayOpen).
 * Without a same-URL history sentinel, Android hardware back pops the cart
 * entry and lands on STORE — diverging from header (stay on cart, close only).
 *
 * Pattern matches SupportModalHost (host-level sentinel; not DibayOverlayRoot).
 */

export const CHECKOUT_CONFIRM_HISTORY_KEY = "dibayStoreCheckoutConfirm";

export type CheckoutConfirmHistoryCloseBinding = {
  dispose: () => void;
};

/**
 * Bind same-URL history sentinel while confirm overlay is open.
 * Caller owns open/close lifecycle (hook or imperative).
 */
export function bindCheckoutConfirmHistoryClose(args: {
  onClose: () => void;
  isBusy?: () => boolean;
}): CheckoutConfirmHistoryCloseBinding {
  if (typeof window === "undefined") {
    return { dispose: () => {} };
  }

  let historyPushed = false;
  let closingFromPop = false;

  try {
    window.history.pushState(
      { ...(window.history.state || {}), [CHECKOUT_CONFIRM_HISTORY_KEY]: true },
      ""
    );
    historyPushed = true;
  } catch {
    /* ignore */
  }

  const onPop = () => {
    if (!historyPushed) return;
    if (args.isBusy?.()) {
      try {
        window.history.pushState(
          { ...(window.history.state || {}), [CHECKOUT_CONFIRM_HISTORY_KEY]: true },
          ""
        );
        historyPushed = true;
      } catch {
        /* ignore */
      }
      return;
    }
    historyPushed = false;
    closingFromPop = true;
    args.onClose();
  };

  window.addEventListener("popstate", onPop);

  return {
    dispose: () => {
      window.removeEventListener("popstate", onPop);
      if (historyPushed && !closingFromPop) {
        historyPushed = false;
        try {
          if (window.history.state?.[CHECKOUT_CONFIRM_HISTORY_KEY]) {
            window.history.back();
          }
        } catch {
          /* ignore */
        }
      }
      closingFromPop = false;
    },
  };
}
