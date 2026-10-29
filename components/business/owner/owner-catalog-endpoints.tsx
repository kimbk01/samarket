"use client";

/**
 * 3-C §9-3 — 오너 메뉴 편집 컴포넌트(상품 허브·상품 폼·메뉴 카테고리)의 API·화면 경로.
 * 기본값 = 오너 경로 (`/api/me/stores/{id}` · `/stores/owner/**`) — Provider 가 없으면 기존 동작 그대로.
 * 관리자 샘플 편집은 같은 컴포넌트를 `/api/admin/stores/{id}/sample-catalog` · `/admin/business/{id}/sample-menu/**`
 * 경로로만 바꿔 재사용한다 (새 편집기 없음).
 */
import { createContext, useContext, type ReactNode } from "react";

export type OwnerCatalogEndpoints = {
  /** 저장 API 기준 경로 — 뒤에 `/products`·`/menu-sections`·`/upload-image` 를 붙인다 */
  apiBase: (storeId: string) => string;
  productsHubHref: (storeId: string) => string;
  /** `extraQuery` = `&draft=1&menuSectionId=…` 형태 (앞의 & 포함) */
  newProductHref: (storeId: string, extraQuery: string) => string;
  editProductHref: (storeId: string, productId: string) => string;
  categoriesHref: (storeId: string) => string;
};

const enc = encodeURIComponent;

export const OWNER_CATALOG_ENDPOINTS: OwnerCatalogEndpoints = {
  apiBase: (sid) => `/api/me/stores/${enc(sid)}`,
  productsHubHref: (sid) => `/stores/owner/products?storeId=${enc(sid)}`,
  newProductHref: (sid, extra) => `/stores/owner/products/new?storeId=${enc(sid)}${extra}`,
  editProductHref: (sid, pid) => `/stores/owner/products/${enc(pid)}/edit?storeId=${enc(sid)}`,
  categoriesHref: (sid) => `/stores/owner/menu-categories?storeId=${enc(sid)}`,
};

/** 관리자 샘플 매장 편집 경로 (서버가 business 권한 + store_kind='sample' 재검증). */
export const ADMIN_SAMPLE_CATALOG_ENDPOINTS: OwnerCatalogEndpoints = {
  apiBase: (sid) => `/api/admin/stores/${enc(sid)}/sample-catalog`,
  productsHubHref: (sid) => `/admin/business/${enc(sid)}/sample-menu`,
  newProductHref: (sid, extra) =>
    `/admin/business/${enc(sid)}/sample-menu/products/new${extra ? `?${extra.replace(/^&/, "")}` : ""}`,
  editProductHref: (sid, pid) => `/admin/business/${enc(sid)}/sample-menu/products/${enc(pid)}/edit`,
  categoriesHref: (sid) => `/admin/business/${enc(sid)}/sample-menu/categories`,
};

const Ctx = createContext<OwnerCatalogEndpoints>(OWNER_CATALOG_ENDPOINTS);

export function OwnerCatalogEndpointsProvider({
  value,
  children,
}: {
  value: OwnerCatalogEndpoints;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwnerCatalogEndpoints(): OwnerCatalogEndpoints {
  return useContext(Ctx);
}
