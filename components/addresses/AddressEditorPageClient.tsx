"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { useUnsavedTraverseGuard } from "@/lib/navigation/use-unsaved-traverse-guard";
import { peekMemberAddressCallerContext } from "@/lib/addresses/member-address-caller-context";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
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
  clearAddressEditDraftV3,
  clearAddressPlatformV2Draft,
  clearMypageAddressSearchQuery,
  readAddressPlatformV2Draft,
  shouldRedirectCreateDetailToSearch,
} from "@/lib/addresses/canonical-address-draft-storage";
import { draftFromSavedRow, resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import { writeAddressFlowExitHref } from "@/lib/addresses/mypage-address-flow-exit";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { useRegionViewerUserId } from "@/hooks/useRegionViewerUserId";

function AddressEditorPageChrome(props: {
  titleKey: MessageKey;
  backHref: string;
  children: ReactNode;
  /** 지정 시 헤더 뒤로가 이 함수를 거친다(미저장 확인, S07) */
  onBack?: () => void;
}) {
  const { titleKey, backHref, children, onBack } = props;
  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey={titleKey}
        backHref={backHref}
        leftSlot={
          onBack ? <AppBackButton preferHistoryBack={false} onBack={onBack} ariaLabelKey="nav_back" /> : undefined
        }
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
  const viewerUserId = useRegionViewerUserId();
  const draftUserId = viewerUserId && viewerUserId !== "guest" ? viewerUserId : "";

  const mapHandledRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  /** 대표 지정 목적으로 들어온 경우(`set_default_master`) — 추가 시 대표 토글 기본 ON (S07 확인 필요 항목) */
  const [callerPrefersMaster] = useState(
    () => peekMemberAddressCallerContext()?.apply.kind === "set_default_master",
  );

  const leaveNow = useCallback(() => {
    runHistoryBackWithFallback(router, addressesListHref);
  }, [addressesListHref, router]);

  const requestLeave = useCallback(() => {
    if (dirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    leaveNow();
  }, [dirty, leaveNow]);

  /** Android 뒤로 — 변경 있으면 미저장 확인 */
  useOverlayHardwareBack(dirty && !leaveConfirmOpen, () => setLeaveConfirmOpen(true));
  /** 브라우저·기록 뒤로 — 기록 추가 없이 이동만 취소하고 확인 (BK-05) */
  const traverseGuard = useUnsavedTraverseGuard(dirty, () => setLeaveConfirmOpen(true));

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
          /** 좌표 없는 저장 행 — 재검색(UX-002)으로 받은 handoff draft 사용 */
          if (row) setPlatformDraft(draftFromSavedRow(row) ?? readAddressPlatformV2Draft()?.draft ?? null);
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
  }, [idFromUrl, mapBootstrapUrl, returnTo, router, t, reloadKey]);

  if (bootstrapping) {
    return (
      <AddressEditorPageChrome titleKey={headerTitleKey} backHref={addressesListHref}>
        <AddressEditorSkeleton />
      </AddressEditorPageChrome>
    );
  }

  if (loadErr) {
    return (
      <AddressEditorPageChrome titleKey={headerTitleKey} backHref={addressesListHref}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col`}>
          <MyStateView
            kind="error"
            template="form"
            error={{
              message: loadErr,
              onRetry: () => {
                setBootstrapping(true);
                setReloadKey((k) => k + 1);
              },
            }}
          />
          {loadErrMigrationHint ? (
            <p className="-mt-6 text-center sam-text-helper text-sam-muted">{t("addr_ui_migration_hint")}</p>
          ) : null}
        </div>
      </AddressEditorPageChrome>
    );
  }

  return (
    <AddressEditorPageChrome titleKey={headerTitleKey} backHref={addressesListHref} onBack={requestLeave}>
      <AddressPlatformDetailClient
        draftUserId={draftUserId}
        researchHref={buildMypageAddressSearchHref({ returnTo, id: mode === "edit" ? editTarget?.id : null })}
        mode={mode}
        initial={editTarget}
        draft={platformDraft}
        allAddresses={list}
        callerPrefersMaster={callerPrefersMaster}
        onDirtyChange={setDirty}
        onSaved={async () => {
          try {
            clearAddressPlatformV2Draft();
            clearAddressEditDraftV3(draftUserId, mode === "edit" ? editTarget?.id : null);
            /** 저장 성공 — 다음 주소 추가 시 이전 검색어가 남지 않게 (UX-001) */
            clearMypageAddressSearchQuery();
            await commitUserAddressListAfterMutation();
            invalidateMypageSummary();
          } finally {
            if (returnTo) writeAddressFlowExitHref(returnTo);
            router.replace(returnTo || addressesListHref);
          }
        }}
      />
      <MobileConfirmBottomSheet
        open={leaveConfirmOpen}
        title={t("mypage_s01_discard_title")}
        cancelLabel={t("mypage_s01_discard_keep")}
        confirmLabel={t("mypage_s01_discard_confirm")}
        confirmTone="danger"
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          setDirty(false);
          clearAddressEditDraftV3(draftUserId, mode === "edit" ? editTarget?.id : null);
          traverseGuard.release();
          leaveNow();
        }}
      />
    </AddressEditorPageChrome>
  );
}

/** 진입 부트스트랩 — 지도 240 회색 + 입력 3줄 (S07 구조 일치 스켈레톤) */
function AddressEditorSkeleton() {
  return (
    <div className={`${MYPAGE_BODY_COLUMN_CLASS} space-y-3 py-3`} aria-busy="true" data-testid="address-editor-skeleton">
      <div className="h-[240px] rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse md:h-[280px]" />
      <MyStateView kind="loading" template="form" rows={3} />
    </div>
  );
}

function AddressEditorPageFallback() {
  const addressesListHref = buildMypageAddressesHref(null);
  return (
    <AddressEditorPageChrome titleKey="addr_ui_add_title" backHref={addressesListHref}>
      <AddressEditorSkeleton />
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
