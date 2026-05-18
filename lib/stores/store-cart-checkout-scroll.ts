/**
 * 매장 장바구니 주문 확인 — 내부 스크롤 영역을 하단(주문 바) 쪽으로 맞춤.
 */
export function scrollAppShellForStoreCheckoutConfirm(checkoutFooterEl?: HTMLElement | null): void {
  if (typeof document === "undefined") return;
  const scrollEl =
    checkoutFooterEl?.closest<HTMLElement>("[data-store-cart-scroll]") ??
    document.querySelector<HTMLElement>("[data-store-cart-scroll]");
  if (!scrollEl) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const anchor =
          checkoutFooterEl ??
          document.querySelector<HTMLElement>("[data-store-cart-checkout-action]");
        if (anchor && scrollEl.contains(anchor)) {
          anchor.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
      } catch {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    });
  });
}
