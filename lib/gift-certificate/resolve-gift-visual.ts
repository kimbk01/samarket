export type GiftScope = "STORE" | "PLATFORM";

export type GiftVisualInput = {
  giftScope: GiftScope;
  imageUrl?: string | null;
  storeLogoUrl?: string | null;
  storeName?: string | null;
  title?: string | null;
};

export type GiftVisualResolved = {
  imageSrc: string | null;
  usePlatformFallback: boolean;
  useStoreInitialFallback: boolean;
  storeInitial: string;
  badgeScope: GiftScope;
};

/** Explicit giftScope only — never infer from store name or title. */
export function resolveGiftVisual(input: GiftVisualInput): GiftVisualResolved {
  const giftScope: GiftScope = input.giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const imageUrl = input.imageUrl?.trim() || null;
  const storeLogoUrl = input.storeLogoUrl?.trim() || null;
  const storeName = input.storeName?.trim() || "";
  const storeInitial = (storeName.charAt(0) || "S").toUpperCase();

  if (imageUrl) {
    return {
      imageSrc: imageUrl,
      usePlatformFallback: false,
      useStoreInitialFallback: false,
      storeInitial,
      badgeScope: giftScope,
    };
  }
  if (giftScope === "STORE" && storeLogoUrl) {
    return {
      imageSrc: storeLogoUrl,
      usePlatformFallback: false,
      useStoreInitialFallback: false,
      storeInitial,
      badgeScope: giftScope,
    };
  }
  if (giftScope === "PLATFORM") {
    return {
      imageSrc: null,
      usePlatformFallback: true,
      useStoreInitialFallback: false,
      storeInitial,
      badgeScope: "PLATFORM",
    };
  }
  return {
    imageSrc: null,
    usePlatformFallback: false,
    useStoreInitialFallback: true,
    storeInitial,
    badgeScope: "STORE",
  };
}
