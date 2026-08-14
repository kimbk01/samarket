"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddressPlatformDetailClient } from "@/components/addresses/AddressPlatformDetailClient";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { consumeMapAddressPick, consumeMapAddressPickContext } from "@/lib/map/map-address-pick-storage";
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
  buildMypageAddressSearchHref,
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import {
  clearAddressPlatformV2Draft,
  readAddressPlatformV2Draft,
  shouldRedirectCreateDetailToSearch,
} from "@/lib/addresses/canonical-address-draft-storage";
import { draftFromSavedRow, resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import { writeAddressFlowExitHref } from "@/lib/addresses/mypage-address-flow-exit";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";

function AddressEditorPageChrome(props: {
  titleKey: MessageKey;
  backHref: string;
  children: ReactNode;
}) {
  const { titleKey, backHref, children } = props;
  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey={titleKey}
        backHref={backHref}
        hideCtaStrip
        showHubQuickActions
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
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
  const [platformDraft, setPlatformDraft] = useState<CanonicalAddressDraft | null>(null);

  const mapHandledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const incomingDraft =
      !idFromUrl && !mapBootstrapUrl ? readAddressPlatformV2Draft()?.draft ?? null : null;
    if (incomingDraft) {
      setPlatformDraft(incomingDraft);
      setMode("create");
      setEditTarget(null);
      setBootstrapping(false);
    }

    void (async () => {
      setLoadErr(null);
      setLoadErrMigrationHint(false);
      const result = await fetchMeAddressesListSingleFlight();
      if (cancelled) return;
      if (!result.ok) {
        setList([]);
        if (!incomingDraft) {
          setLoadErr(describeMeAddressesListFailure(result, t));
          setLoadErrMigrationHint(shouldShowMeAddressesListMigrationHint(result));
        }
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
          const fromPick = await resolveCanonicalAddressFromLatLng(
            pick.latitude,
            pick.longitude,
            pick.placeId ? { placeId: pick.placeId, placeName: null } : null,
          );
          if (cancelled) return;
          setPlatformDraft(fromPick);
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
          if (row) setPlatformDraft(draftFromSavedRow(row));
        } else {
          setMode("create");
          setEditTarget(null);
          const draft = incomingDraft ?? readAddressPlatformV2Draft()?.draft ?? null;
          if (draft) {
            setPlatformDraft(draft);
          } else if (shouldRedirectCreateDetailToSearch(idFromUrl, mapBootstrapUrl, draft)) {
            router.replace(buildMypageAddressSearchHref({ returnTo }));
            return;
          }
        }
      }

      setBootstrapping(false);
    })();

    return () => {
      cancelled = true;
    };
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
            onClick={() => router.replace(addressesListHref)}
          >
            {t("addr_ui_back_to_list")}
          </button>
        </div>
      </AddressEditorPageChrome>
    );
  }

  return (
    <AddressEditorPageChrome titleKey="addr_ui_address_detail_header" backHref={addressesListHref}>
      <AddressPlatformDetailClient
        mode={mode}
        initial={editTarget}
        draft={platformDraft}
        allAddresses={list}
        onSaved={async () => {
          try {
            clearAddressPlatformV2Draft();
            await commitUserAddressListAfterMutation();
          } finally {
            if (returnTo) writeAddressFlowExitHref(returnTo);
            router.replace(addressesListHref);
          }
        }}
      />
    </AddressEditorPageChrome>
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
