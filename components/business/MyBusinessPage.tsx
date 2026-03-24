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
import { buildMyBusinessNavGroups } from "@/lib/business/my-business-nav";
import { MyBusinessNavList } from "@/components/business/MyBusinessNavList";
import { MyBusinessHubStickyHeader } from "@/components/business/MyBusinessHubStickyHeader";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchStoreOrderCountsDeduped } from "@/lib/business/fetch-store-order-counts-deduped";

function computeCanSell(row: StoreRow): boolean {
  return (
    !!row.sales_permission &&
    row.sales_permission.allowed_to_sell === true &&
    row.sales_permission.sales_status === "approved"
  );
}

function hubNavGroups(row: StoreRow, orderAlertsBadge: number) {
  return buildMyBusinessNavGroups({
    storeId: row.id,
    slug: row.slug ?? "",
    approvalStatus: String(row.approval_status),
    isVisible: !!row.is_visible,
    canSell: computeCanSell(row),
    orderAlertsBadge,
  });
}

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

export function MyBusinessPage() {
  const searchParams = useSearchParams();
  const preferredStoreId = searchParams.get("storeId")?.trim() ?? "";

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [orderAlertsBadge, setOrderAlertsBadge] = useState(0);
  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio(alertStoreIdRef.current ?? undefined);
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
      const row =
        byPreferred ??
        stores.find((s) => String(s.approval_status) === "approved") ??
        stores[0]!;
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

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  const orderCountsStoreId =
    state.kind === "remote" &&
    state.row.approval_status === "approved" &&
    state.row.is_visible === true &&
    computeCanSell(state.row)
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
    }, 25_000);
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
        <div className="flex items-center gap-2 border-b border-amber-200/80 pb-3">
          <AppBackButton backHref="/my" ariaLabel="내 정보로" />
          <span className="text-[15px] font-semibold text-amber-950">매장 관리</span>
        </div>
        <p>로그인(또는 개발용 테스트 로그인) 후 매장 신청을 이용할 수 있습니다.</p>
        <p className="text-[13px] text-amber-800">
          Supabase 계정 또는 로컬에서 테스트 계정으로 로그인한 뒤 다시 열어 주세요.
        </p>
      </div>
    );
  }

  if (state.kind === "config") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <AppBackButton backHref="/my" ariaLabel="내 정보로" />
          <span className="text-[15px] font-semibold text-gray-900">매장 관리</span>
        </div>
        <p>서버에 Supabase 환경 변수가 없어 DB 매장을 불러올 수 없습니다.</p>
        <MockBusinessFallback />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <AppBackButton backHref="/my" ariaLabel="내 정보로" />
          <span className="text-[15px] font-semibold text-gray-900">매장 관리</span>
        </div>
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
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <AppBackButton backHref="/my" ariaLabel="내 정보로" />
          <h1 className="text-lg font-semibold text-gray-900">매장 관리</h1>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-gray-600">
          <li>로그인 완료</li>
          <li className="font-medium text-gray-900">매장(비즈) 신청</li>
          <li>심사·프로필·메뉴 등록 → 판매 승인 후 운영</li>
        </ol>
        <p className="text-[14px] text-gray-600">
          등록된 매장이 없습니다. 사업자 정보를 제출하면 심사 후 매장이 공개됩니다.
        </p>
        <Link
          href="/my/business/apply"
          className="block rounded-lg bg-signature py-3 text-center text-[15px] font-medium text-white"
        >
          매장(비즈) 신청하기
        </Link>
      </div>
    );
  }

  const { row, profile } = state;

  if (row.approval_status === "revision_requested") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <MyBusinessHubStickyHeader shopName={profile.shopName} publicStoreHref={null} />
        <MyBusinessNavList groups={hubNavGroups(row, orderAlertsBadge)} />
        <BusinessOperationalChecklistRevision storeId={row.id} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
          <p className="mt-2 text-[14px] text-amber-900">관리자 보완 요청 상태입니다.</p>
          {profile.adminMemo ? (
            <p className="mt-2 whitespace-pre-wrap text-[13px] text-gray-800">{profile.adminMemo}</p>
          ) : null}
          <Link
            href={`/my/business/profile?storeId=${encodeURIComponent(row.id)}`}
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
        <MyBusinessHubStickyHeader shopName={profile.shopName} publicStoreHref={null} />
        <MyBusinessNavList groups={hubNavGroups(row, orderAlertsBadge)} />
        <BusinessOperationalChecklistPending storeId={row.id} shopName={profile.shopName} />
        <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
          <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
          <p className="text-[14px] text-gray-600">심사 중입니다. 승인 후 매장이 공개됩니다.</p>
          <span className="inline-block rounded bg-amber-100 px-2 py-1 text-[13px] text-amber-800">
            {BUSINESS_STATUS_LABELS.pending}
          </span>
          <Link
            href={`/my/business/profile?storeId=${encodeURIComponent(row.id)}`}
            className="inline-block rounded-lg border border-gray-200 px-4 py-2 text-[14px] font-medium text-gray-800"
          >
            매장 프로필·이미지 입력 (승인 후 공개 페이지에 반영)
          </Link>
        </div>
      </div>
    );
  }

  if (profile.status === "rejected") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
        <MyBusinessHubStickyHeader shopName={profile.shopName} publicStoreHref={null} />
        <MyBusinessNavList groups={hubNavGroups(row, orderAlertsBadge)} />
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">신청이 반려되었습니다.</p>
        {profile.adminMemo ? (
          <p className="text-[13px] text-gray-700">사유: {profile.adminMemo}</p>
        ) : null}
        <span className="inline-block rounded bg-red-50 px-2 py-1 text-[13px] text-red-700">
          {BUSINESS_STATUS_LABELS.rejected}
        </span>
        <p className="text-[13px] text-gray-500">반려 후 재신청은 별도 정책에 따라 가능합니다.</p>
      </div>
    );
  }

  if (profile.status === "paused") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} rounded-lg bg-white p-4`}>
        <MyBusinessHubStickyHeader shopName={profile.shopName} publicStoreHref={null} />
        <MyBusinessNavList groups={hubNavGroups(row, orderAlertsBadge)} />
        <h2 className="text-[16px] font-semibold text-gray-900">{profile.shopName}</h2>
        <p className="text-[14px] text-gray-600">운영이 정지된 매장입니다.</p>
        <span className="inline-block rounded bg-gray-200 px-2 py-1 text-[13px] text-gray-700">
          {BUSINESS_STATUS_LABELS.paused}
        </span>
      </div>
    );
  }

  const canSell = computeCanSell(row);

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <MyBusinessHubStickyHeader
        shopName={profile.shopName}
        publicStoreHref={
          row.approval_status === "approved" && row.is_visible === true && row.slug
            ? `/stores/${encodeURIComponent(row.slug)}`
            : null
        }
      />
      <p className="text-[12px] leading-relaxed text-gray-500">
        아래 목록에서 주문·문의·정산·상품 등으로 이동합니다.
      </p>
      <MyBusinessNavList groups={hubNavGroups(row, orderAlertsBadge)} />
      {row.approval_status === "approved" && !canSell && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          고객에게 &quot;판매중&quot;으로 보이려면 관리자 <strong>판매 승인</strong>이 필요합니다. 그 전에는{" "}
          <strong>초안·숨김</strong> 상태로 메뉴를 미리 등록해 두세요. (
          <code className="rounded bg-amber-100/80 px-1">/admin/stores</code>)
        </p>
      )}
    </div>
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
