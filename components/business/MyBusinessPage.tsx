"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import {
  getBusinessProfileByOwnerUserId,
  CURRENT_USER_ID,
} from "@/lib/business/mock-business-profiles";
import { BUSINESS_STATUS_LABELS } from "@/lib/business/business-utils";
import { BusinessProfileView } from "./BusinessProfileView";
import {
  BusinessOperationalChecklistPending,
  BusinessOperationalChecklistRevision,
} from "./BusinessOperationalChecklist";
import { BusinessProductList } from "./BusinessProductList";
import { getBusinessProducts } from "@/lib/business/mock-business-products";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  dbStoreProductToBusinessProduct,
  dbStoreToBusinessProfile,
  type StoreProductRow,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";
import { BusinessAdminDashboard } from "@/components/business/admin/dashboard/BusinessAdminDashboard";
import type { MyBusinessServerInitial } from "@/lib/business/load-my-business-server";

type LoadState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | {
      kind: "remote";
      row: StoreRow;
      profile: BusinessProfile;
      products: BusinessProduct[];
    };

function loadStateFromServerInitial(s: MyBusinessServerInitial): LoadState {
  switch (s.kind) {
    case "unauth":
      return { kind: "unauth" };
    case "config":
      return { kind: "config" };
    case "error":
      return { kind: "error", message: s.message };
    case "empty":
      return { kind: "empty" };
    case "remote":
      return { kind: "remote", row: s.row, profile: s.profile, products: s.products };
  }
}

export function MyBusinessPage({
  initialServerState,
}: {
  initialServerState?: MyBusinessServerInitial | null;
} = {}) {
  const searchParams = useSearchParams();
  const preferredStoreId = searchParams.get("storeId")?.trim() ?? "";

  const [state, setState] = useState<LoadState>(() =>
    initialServerState != null ? loadStateFromServerInitial(initialServerState) : { kind: "loading" }
  );
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);
  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const onStoreOrderInsert = useCallback((row: Record<string, unknown>) => {
    if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
    playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
  }, []);

  const loadRemote = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const { status, json: rawStores } = await fetchMeStoresListDeduped();
      const json = rawStores as { ok?: boolean; error?: string; stores?: StoreRow[] };
      if (status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        setState({ kind: "config" });
        return;
      }
      if (!json?.ok) {
        setState({
          kind: "error",
          message: typeof json?.error === "string" ? json.error : "load_failed",
        });
        return;
      }
      const stores = (json.stores ?? []) as StoreRow[];
      if (stores.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      const byPreferred =
        preferredStoreId.length > 0 ? stores.find((s) => s.id === preferredStoreId) : undefined;
      const row = byPreferred ?? pickPreferredOwnerStore(stores) ?? stores[0]!;
      let products: BusinessProduct[] = [];
      if (row.approval_status === "approved") {
        const pr = await fetch(`/api/me/stores/${row.id}/products`, {
          credentials: "include",
        });
        const pj = await pr.json();
        if (pj?.ok && Array.isArray(pj.products)) {
          products = pj.products.map((p: StoreProductRow) =>
            dbStoreProductToBusinessProduct(p, row.id)
          );
        }
      }
      const baseProfile = dbStoreToBusinessProfile(row);
      const profile: BusinessProfile = {
        ...baseProfile,
        productCount: products.length,
      };
      setState({ kind: "remote", row, profile, products });
    } catch {
      setState({ kind: "error", message: "network_error" });
    }
  }, [preferredStoreId]);

  const skipFirstRemoteRef = useRef(initialServerState != null);

  useEffect(() => {
    if (skipFirstRemoteRef.current) {
      skipFirstRemoteRef.current = false;
      return;
    }
    void loadRemote();
  }, [loadRemote]);

  const orderCountsStoreId =
    state.kind === "remote" &&
    state.row.approval_status === "approved" &&
    state.row.is_visible === true &&
    storeRowCanSell(state.row)
      ? state.row.id
      : null;

  useLayoutEffect(() => {
    alertStoreIdRef.current = orderCountsStoreId;
  }, [orderCountsStoreId]);

  useSupabaseStoreOrdersRealtime(orderCountsStoreId, onStoreOrderInsert);

  useEffect(() => {
    if (!orderCountsStoreId) {
      setOrderAlertsBadge(0);
      prevPendingDeliveryRef.current = null;
      return;
    }
    prevPendingDeliveryRef.current = null;
    let cancelled = false;

    const tick = async () => {
      try {
        const { json: rawCounts } = await fetchStoreOrderCountsDeduped(orderCountsStoreId);
        const j = rawCounts as {
          ok?: boolean;
          refund_requested_count?: unknown;
          pending_accept_count?: unknown;
          pending_delivery_count?: unknown;
        };
        if (cancelled) return;
        if (j?.ok) {
          const refund = Math.max(0, Math.floor(Number(j.refund_requested_count) || 0));
          const pending = Math.max(0, Math.floor(Number(j.pending_accept_count) || 0));
          const delivery = Math.max(0, Math.floor(Number(j.pending_delivery_count) || 0));
          setOrderAlertsBadge(refund + pending);
          const prev = prevPendingDeliveryRef.current;
          if (prev !== null && delivery > prev) {
            playDeliveryOrderAlertDebounced(orderCountsStoreId);
          }
          prevPendingDeliveryRef.current = delivery;
        } else {
          setOrderAlertsBadge(0);
          prevPendingDeliveryRef.current = null;
        }
      } catch {
        if (!cancelled) {
          setOrderAlertsBadge(0);
          prevPendingDeliveryRef.current = null;
        }
      }
    };

    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void tick();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderCountsStoreId]);

  if (state.kind === "loading") {
    return <p className="text-[14px] text-gray-500">불러오는 중…</p>;
  }

  if (state.kind === "unauth") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-amber-50 p-4 text-[14px] text-amber-900`}>
        <p>로그인 후 매장 신청과 주문 운영을 바로 시작할 수 있습니다.</p>
        <Link
          href="/login?next=%2Fmypage%2Fbusiness"
          className="inline-flex w-fit rounded-lg border border-amber-200 bg-white px-4 py-2 text-[14px] font-medium text-amber-900"
        >
          로그인하고 매장 시작하기
        </Link>
      </div>
    );
  }

  if (state.kind === "config") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
        <p>지금은 매장 데이터를 불러오지 못하고 있습니다. 잠시 후 다시 시도해 주세요.</p>
        <MockBusinessFallback />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="text-[14px] text-red-600">매장 정보를 불러오지 못했습니다. ({state.message})</p>
        <button
          type="button"
          onClick={() => void loadRemote()}
          className="rounded-lg border border-gray-200 px-4 py-2 text-[14px] text-gray-700"
        >
          다시 시도
        </button>
        <MockBusinessFallback />
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <div className="rounded-[20px] bg-[#111827] px-5 py-5 text-white shadow-lg md:px-6 md:py-6">
          <p className="text-[12px] font-medium text-white/70">배달 매장 시작</p>
          <h2 className="mt-1 text-[20px] font-bold leading-tight md:text-[26px]">
            주문·문의·메뉴를 한곳에서 운영해 보세요.
          </h2>
          <p className="mt-2 text-[13px] text-white/75">
            매장을 등록하면 심사 후 운영 센터에서 바로 관리할 수 있어요.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/mypage/business/apply"
            className="rounded-2xl border border-signature/30 bg-signature/5 px-4 py-4 text-[15px] font-semibold text-gray-900 shadow-sm"
          >
            매장 신청하기
          </Link>
          <Link
            href="/mypage/store-orders"
            className="rounded-2xl border border-gray-200 bg-white px-4 py-4 text-[15px] font-semibold text-gray-800 shadow-sm"
          >
            내 주문 보기
          </Link>
        </div>
      </div>
    );
  }

  const { row, profile, products } = state;
  const canSell = storeRowCanSell(row);
  const managementQuery = `storeId=${encodeURIComponent(row.id)}`;

  if (row.approval_status === "revision_requested") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <BusinessOperationalChecklistRevision storeId={row.id} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
          <p className="mt-2 text-[14px] text-amber-900">관리자 보완 요청 상태입니다.</p>
          {profile.adminMemo ? (
            <p className="mt-2 whitespace-pre-wrap text-[13px] text-gray-800">{profile.adminMemo}</p>
          ) : null}
          <Link
            href={`/my/business/profile?${managementQuery}`}
            className="mt-3 inline-block rounded-lg bg-signature px-4 py-2.5 text-center text-[14px] font-medium text-white"
          >
            매장 프로필 보완하기
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void loadRemote()}
          className="text-[14px] text-signature underline"
        >
          새로고침
        </button>
      </div>
    );
  }

  if (profile.status === "pending") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <BusinessOperationalChecklistPending storeId={row.id} shopName={profile.shopName} />
        <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4 shadow-sm`}>
          <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
          <p className="text-[14px] text-gray-600">심사 중입니다. 승인 후 매장이 공개됩니다.</p>
          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-[13px] text-amber-800">
            {BUSINESS_STATUS_LABELS.pending}
          </span>
          <Link
            href={`/my/business/profile?${managementQuery}`}
            className="mt-3 inline-block rounded-lg border border-gray-200 px-4 py-2 text-[14px] font-medium text-gray-800"
          >
            매장 프로필·이미지 입력
          </Link>
        </div>
      </div>
    );
  }

  if (profile.status === "rejected") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4 shadow-sm`}>
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">신청이 반려되었습니다.</p>
        {profile.adminMemo ? (
          <p className="text-[13px] text-gray-700">사유: {profile.adminMemo}</p>
        ) : null}
        <span className="inline-block rounded bg-red-50 px-2 py-1 text-[13px] text-red-700">
          {BUSINESS_STATUS_LABELS.rejected}
        </span>
      </div>
    );
  }

  if (profile.status === "paused") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4 shadow-sm`}>
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">운영이 정지된 매장입니다.</p>
        <span className="inline-block rounded bg-gray-200 px-2 py-1 text-[13px] text-gray-700">
          {BUSINESS_STATUS_LABELS.paused}
        </span>
      </div>
    );
  }

  return (
    <BusinessAdminDashboard
      row={row}
      profile={profile}
      products={products}
      canSell={canSell}
      orderAlertsBadge={orderAlertsBadge}
      loadRemote={loadRemote}
    />
  );
}

function MockBusinessFallback() {
  const profile = getBusinessProfileByOwnerUserId(CURRENT_USER_ID);
  if (!profile) return null;
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="mb-2 text-[12px] font-medium text-gray-500">로컬 목업 미리보기</p>
      <MockBusinessBody profile={profile} />
    </div>
  );
}

function MockBusinessBody({ profile }: { profile: BusinessProfile }) {
  if (profile.status === "pending") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">심사 중입니다. 승인 후 상점이 공개됩니다.</p>
        <span className="inline-block rounded bg-amber-100 px-2 py-1 text-[13px] text-amber-800">
          {BUSINESS_STATUS_LABELS.pending}
        </span>
      </div>
    );
  }
  if (profile.status === "rejected") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">신청이 반려되었습니다.</p>
        <span className="inline-block rounded bg-red-50 px-2 py-1 text-[13px] text-red-700">
          {BUSINESS_STATUS_LABELS.rejected}
        </span>
      </div>
    );
  }
  if (profile.status === "paused") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">일시중지된 상점입니다.</p>
        <span className="inline-block rounded bg-gray-200 px-2 py-1 text-[13px] text-gray-700">
          {BUSINESS_STATUS_LABELS.paused}
        </span>
      </div>
    );
  }
  const products = getBusinessProducts(profile.id);
  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <BusinessProfileView profile={profile} isOwner />
      <div className="flex justify-end">
        <Link
          href="/my/business/edit"
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
        >
          상점 정보 수정
        </Link>
      </div>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-gray-900">내 상점 상품</h2>
        <BusinessProductList
          products={products}
          shopSlug={profile.slug}
          emptyMessage="등록된 상품이 없습니다. 상품을 등록하면 여기에 표시됩니다."
        />
      </div>
    </div>
  );
}
