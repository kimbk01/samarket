"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { usePathname, useRouter } from "next/navigation";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS } from "@/lib/design/delivery-chrome";
import { useStoreDetailAnimatedBack } from "@/lib/dibay/store-detail-animated-back-context";
import { markStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
import { resolveDibayBackTarget } from "@/lib/navigation/resolve-dibay-back-target";
import { runDibayBackResolution } from "@/lib/navigation/run-dibay-back-resolution";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";

type Variant = "back" | "close";

/**
 * 매장 상단 Back — destination policy = resolveDibayBackTarget only (CUT 2).
 * DO NOT invent browse URLs from DB category here.
 */
export function StoreDetailBackLink({
  storeSlug,
  /** @deprecated Ignored for destination — resolver owns policy. Kept for call-site compat. */
  fallbackHref: _fallbackHref,
  variant = "back",
  className,
}: {
  storeSlug?: string;
  fallbackHref?: string;
  variant?: Variant;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const animatedBack = useStoreDetailAnimatedBack();
  const label = variant === "close" ? t("common_close") : t("nav_back");

  const onBackPress = () => {
    const pathSlug =
      storeSlug?.trim() ||
      (() => {
        const parts = pathname.split("/").filter(Boolean);
        if (parts[0] === "stores" && parts[1]) return decodeSlugSegment(parts[1]);
        return "";
      })();
    if (!pathSlug) return;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const entryContext = readNavigationEntryContext(pathSlug);
    const resolution = resolveDibayBackTarget({
      currentPathname: pathname,
      currentSearch: search,
      storeSlug: pathSlug,
      entryContext,
    });

    if (
      resolution.action === "PUSH" ||
      resolution.action === "REPLACE"
    ) {
      const targetPath = resolution.targetHref.split("?")[0] ?? "";
      if (targetPath === `/stores/${encodeURIComponent(pathSlug)}`) {
        markStoreDetailMenuTabsLanding();
      }
    }

    runDibayBackResolution(router, resolution, animatedBack);
  };

  return (
    <button
      type="button"
      onClick={onBackPress}
      className={
        className ??
        `${DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS} hover:bg-sam-surface-muted/90 active:bg-sam-border-soft/80`
      }
      aria-label={label}
    >
      {variant === "close" ? (
        <AppCloseIcon className="h-6 w-6" />
      ) : (
        <AppBackIcon />
      )}
    </button>
  );
}
