"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  consumeMapAddressPick,
  consumeMapAddressPickContext,
} from "@/lib/map/map-address-pick-storage";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  shouldShowMeAddressesListMigrationHint,
} from "@/lib/addresses/address-list-client-cache";
import { commitUserAddressListAfterMutation } from "@/lib/addresses/user-addresses-sync";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  buildMypageAddressEditHref,
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

function AddressEditorPageChrome(props: {
  titleKey: MessageKey;
  backHref: string;
  children: ReactNode;
}) {
  const { titleKey, backHref, children } = props;
  return (
    <div className="flex min-h-screen w-full min-w-0 max-w-[100dvw] flex-col overflow-x-clip bg-sam-app">
      <MySubpageHeader titleKey={titleKey} backHref={backHref} hideCtaStrip />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} min-h-0 flex-1`}>{children}</div>
    </div>
  );
}

function AddressEditorPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const idFromUrl = (sp.get("id") ?? "").trim();
  const mapBootstrapUrl = sp.get("map") === "1";
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  const addressesListHref = buildMypageAddressesHref(returnTo);
  const headerTitleKey: MessageKey = idFromUrl ? "addr_ui_edit_title" : "addr_ui_add_title";

  const [list, setList] = useState<UserAddressDTO[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadErrMigrationHint, setLoadErrMigrationHint] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<UserAddressDTO | null>(null);
  const [mapBootstrap, setMapBootstrap] = useState<{
    latitude: number;
    longitude: number;
    fullAddress: string;
    addressDetail?: string | null;
  } | null>(null);

  const mapHandledRef = useRef(false);

  useEffect(() => {
    void (async () => {
      setLoadErr(null);
      setLoadErrMigrationHint(false);
      const result = await fetchMeAddressesListSingleFlight();
      if (!result.ok) {
        setLoadErr(describeMeAddressesListFailure(result, t));
        setLoadErrMigrationHint(shouldShowMeAddressesListMigrationHint(result));
        setList([]);
        setBootstrapping(false);
        return;
      }
      const rows = result.rows;
      setList(rows);

      let replaceId = idFromUrl;

      if (mapBootstrapUrl && !mapHandledRef.current) {
        mapHandledRef.current = true;
        const pick = consumeMapAddressPick();
        const ctx = consumeMapAddressPickContext();
        if (pick) {
          setMapBootstrap({
            latitude: pick.latitude,
            longitude: pick.longitude,
            fullAddress: pick.fullAddress,
            addressDetail: pick.addressDetail ?? null,
          });
          if (ctx.source === "edit") {
            const row = rows.find((a) => a.id === ctx.addressId);
            setEditTarget(row ?? null);
            setMode(row ? "edit" : "create");
            if (row) replaceId = row.id;
          } else {
            setMode("create");
            setEditTarget(null);
            replaceId = "";
          }
        }
        const nextPath = buildMypageAddressEditHref({
          returnTo,
          id: replaceId || undefined,
        });
        router.replace(nextPath);
      } else if (!mapBootstrapUrl) {
        if (idFromUrl) {
          const row = rows.find((a) => a.id === idFromUrl);
          setEditTarget(row ?? null);
          setMode(row ? "edit" : "create");
        } else {
          setMode("create");
          setEditTarget(null);
        }
      }

      setBootstrapping(false);
    })();
  }, [idFromUrl, mapBootstrapUrl, returnTo, router, t]);

  if (bootstrapping) {
    return (
      <AddressEditorPageChrome titleKey={headerTitleKey} backHref={addressesListHref}>
        <div className="flex min-h-[40vh] items-center justify-center sam-text-body-secondary text-sam-muted">
          {t("common_loading")}
        </div>
      </AddressEditorPageChrome>
    );
  }

  if (loadErr) {
    return (
      <AddressEditorPageChrome titleKey={headerTitleKey} backHref={addressesListHref}>
        <div className="flex flex-col px-4 py-8">
          <p className="text-center sam-text-body-secondary text-sam-danger">{loadErr}</p>
          {loadErrMigrationHint ? (
            <p className="mt-2 text-center sam-text-helper text-sam-muted">{t("addr_ui_migration_hint")}</p>
          ) : null}
          <button
            type="button"
            className="mx-auto mt-4 rounded-lg border border-sam-border px-4 py-2 sam-text-body font-semibold text-sam-fg"
            onClick={() => router.push(addressesListHref)}
          >
            {t("addr_ui_back_to_list")}
          </button>
        </div>
      </AddressEditorPageChrome>
    );
  }

  return (
    <AddressEditorSheet
      layout="page"
      open
      mode={mode}
      initial={editTarget}
      mapBootstrap={mapBootstrap}
      allAddresses={list}
      returnTo={returnTo}
      onClose={() => router.push(addressesListHref)}
      onSaved={async () => {
        await commitUserAddressListAfterMutation();
        router.push(addressesListHref);
      }}
    />
  );
}

function AddressEditorPageFallback() {
  const { t } = useI18n();
  const addressesListHref = buildMypageAddressesHref(null);
  return (
    <AddressEditorPageChrome titleKey="addr_ui_add_title" backHref={addressesListHref}>
      <div className="flex min-h-[40vh] items-center justify-center sam-text-body-secondary text-sam-muted">
        {t("common_loading")}
      </div>
    </AddressEditorPageChrome>
  );
}

export function AddressEditorPageClient() {
  return (
    <Suspense fallback={<AddressEditorPageFallback />}>
      <AddressEditorPageInner />
    </Suspense>
  );
}
