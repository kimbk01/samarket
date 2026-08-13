"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddressFineTuneSheet } from "@/components/addresses/AddressFineTuneSheet";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildMypageAddressEditHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import {
  consumeAddressFineTuneIntent,
  peekAddressFineTuneIntent,
  writeAddressFineTuneResult,
} from "@/lib/addresses/address-editor-page-draft";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";
import type { ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";

function AddressFineTunePageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  const idFromUrl = (sp.get("id") ?? "").trim();
  const editHref = useMemo(
    () => buildMypageAddressEditHref({ returnTo, id: idFromUrl || undefined }),
    [returnTo, idFromUrl],
  );

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [bootErr, setBootErr] = useState(false);

  useEffect(() => {
    const intent = peekAddressFineTuneIntent();
    if (intent && Number.isFinite(intent.latitude) && Number.isFinite(intent.longitude)) {
      setCoords({ latitude: intent.latitude, longitude: intent.longitude });
      return;
    }
    setBootErr(true);
  }, []);

  if (bootErr) {
    return (
      <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
        <MySubpageHeader
          inlineChrome
          registerMainTier1={false}
          titleKey="addr_ui_fine_tune_title"
          backHref={editHref}
          hideCtaStrip
          showHubQuickActions
        />
        <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS}>
          <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS}>
            <p className="py-8 text-center sam-text-body-secondary text-sam-danger">
              {t("addr_ui_resolve_failed")}
            </p>
            <button
              type="button"
              className="mx-auto block rounded-lg border border-sam-border px-4 py-2 sam-text-body font-semibold text-sam-fg"
              onClick={() => router.replace(editHref)}
            >
              {t("addr_ui_back_to_list")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!coords) {
    return (
      <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
        <MySubpageHeader
          inlineChrome
          registerMainTier1={false}
          titleKey="addr_ui_fine_tune_title"
          backHref={editHref}
          hideCtaStrip
          showHubQuickActions
        />
        <div className="flex min-h-[40vh] items-center justify-center sam-text-body-secondary text-sam-muted">
          {t("common_loading")}
        </div>
      </div>
    );
  }

  return (
    <AddressFineTuneSheet
      layout="page"
      open
      latitude={coords.latitude}
      longitude={coords.longitude}
      pageBackHref={editHref}
      onClose={() => {
        consumeAddressFineTuneIntent();
        router.replace(editHref);
      }}
      onApply={(r: ReverseGeocodePhResult) => {
        writeAddressFineTuneResult(r);
        consumeAddressFineTuneIntent();
        router.replace(editHref);
      }}
    />
  );
}

function AddressFineTunePageFallback() {
  const { t } = useI18n();
  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey="addr_ui_fine_tune_title"
        backHref="/mypage/addresses"
        hideCtaStrip
        showHubQuickActions
      />
      <div className="flex min-h-[40vh] items-center justify-center sam-text-body-secondary text-sam-muted">
        {t("common_loading")}
      </div>
    </div>
  );
}

export function AddressFineTunePageClient() {
  return (
    <Suspense fallback={<AddressFineTunePageFallback />}>
      <AddressFineTunePageInner />
    </Suspense>
  );
}
