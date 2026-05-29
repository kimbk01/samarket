/**
 * dibaY delivery design system — class name registry for TS/JSX.
 * Pair with `app/delivery-tokens.css` + `app/delivery-components.css`.
 */

export const DeliveryTheme = {
  page: "delivery-page",
  pageInner: "delivery-page-inner",
  sectionGap: "delivery-section-gap",
  card: "delivery-card",
  cardPad: "delivery-card-pad",
  dividerBlock: "delivery-divider-block",
  typo: {
    pageTitle: "delivery-typo-page-title",
    modalTitle: "delivery-typo-modal-title",
    sectionTitle: "delivery-typo-section-title",
    cardTitle: "delivery-typo-card-title",
    body: "delivery-typo-body",
    meta: "delivery-typo-meta",
    price: "delivery-typo-price",
  },
  btn: {
    primary: "delivery-btn-primary",
    secondary: "delivery-btn-secondary",
    outline: "delivery-btn-outline",
    ghost: "delivery-btn-ghost",
    danger: "delivery-btn-danger",
    sizeFull: "delivery-btn--size-full",
    sizeSm: "delivery-btn--size-sm",
    sizeMd: "delivery-btn--size-md",
    sizeLg: "delivery-btn--size-lg",
    sticky: "delivery-btn--sticky",
  },
  infoCard: {
    root: "delivery-info-card",
    label: "delivery-info-card__label",
    value: "delivery-info-card__value",
  },
  sectionCard: {
    root: "delivery-section-card",
    title: "delivery-section-card__title",
  },
  input: "delivery-input",
  badge: {
    base: "delivery-badge",
    primary: "delivery-badge--primary",
    popular: "delivery-badge--popular",
    owner: "delivery-badge--owner",
    discount: "delivery-badge--discount",
    free: "delivery-badge--free",
    soldOut: "delivery-badge--soldout",
  },
  address: {
    card: "delivery-address-card",
    cardSelected: "delivery-address-card--selected",
    title: "delivery-address-card__title",
    body: "delivery-address-card__body",
  },
  modal: {
    panel: "delivery-modal-panel",
    title: "delivery-modal-title",
    section: "delivery-modal-section",
    sectionLabel: "delivery-modal-section__label",
    sectionValue: "delivery-modal-section__value",
    footer: "delivery-modal-footer",
    footerRow: "delivery-modal-footer delivery-modal-footer--row",
    cancel: "delivery-modal-cancel",
  },
  sticky: {
    root: "delivery-sticky-cta",
    inner: "delivery-sticky-cta__inner",
  },
  sheet: {
    panel: "delivery-sheet-panel",
    pad: "delivery-sheet-pad",
    handle: "delivery-sheet-handle",
  },
  menuRow: "delivery-menu-row",
  menuThumb: "delivery-menu-thumb",
  menuPlus: "delivery-menu-plus",
  categoryChip: "delivery-category-chip",
  categoryChipActive: "delivery-category-chip delivery-category-chip--active",
  /** 매장 상세 메뉴 — 박스형 탭(§ store detail category bar) */
  categoryTab: "delivery-category-tab",
  categoryTabActive: "delivery-category-tab delivery-category-tab--active",
  categorySearch: "delivery-category-search",
  subpageHeader: {
    shell: "delivery-subpage-header",
    inner: "delivery-subpage-header__inner",
    row: "delivery-subpage-header__row",
    title: "delivery-subpage-header__title",
    backBtn: "delivery-subpage-header__back-btn",
    actionBtn: "delivery-subpage-header__action-btn",
  },
  cartCheckoutBar: {
    root: "delivery-cart-checkout-bar",
    label: "delivery-cart-checkout-bar__label",
    price: "delivery-cart-checkout-bar__price",
    hint: "delivery-cart-checkout-bar__hint",
    btn: "delivery-cart-checkout-bar__btn",
  },
  badgeMenu: {
    popular: "delivery-badge delivery-badge--menu-popular",
    owner: "delivery-badge delivery-badge--menu-owner",
    rep: "delivery-badge delivery-badge--menu-rep",
    discount: "delivery-badge delivery-badge--menu-discount",
  },
  cartStack: "delivery-cart-section-stack",
  priceTotal: "delivery-price-summary__total",
} as const;

export const deliverySizes = {
  thumbList: "var(--delivery-thumb-list)",
  thumbMenu: "var(--delivery-thumb-menu)",
  thumbCart: "var(--delivery-thumb-cart)",
  thumbUpsell: "var(--delivery-thumb-upsell)",
  pageX: "var(--delivery-page-x)",
  sectionGap: "var(--delivery-section-gap)",
  cardPad: "var(--delivery-card-pad)",
  rowGap: "var(--delivery-row-gap)",
  btnH: "var(--delivery-btn-h)",
  btnHSticky: "var(--delivery-btn-h-sticky)",
  inputH: "var(--delivery-input-h)",
} as const;

export type DeliveryButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "cancel";
export type DeliveryButtonSize = "sm" | "md" | "lg" | "full";
