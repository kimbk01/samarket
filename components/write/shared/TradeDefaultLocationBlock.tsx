"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabel } from "@/lib/products/form-options";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

const ADDRESSES_HREF = "/mypage/addresses";

function coerceAddressRow(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) return o as UserAddressDTO;
  return rowToUserAddressDTO(o);
}

/** 글쓰기 기본 지역 — **대표(master)** 가 우선, 없으면 거래 기본(trade). @see `address-source-architecture.ts` */
function pickAddressForTradeWrite(defaults: { master?: unknown; trade?: unknown } | undefined): UserAddressDTO | null {
  const master = coerceAddressRow(defaults?.master ?? null);
  const trade = coerceAddressRow(defaults?.trade ?? null);
  if (master?.id) return master;
  if (trade?.id) return trade;
  return null;
}

type TradeDefaultLocationBlockProps = {
  /** 수정 모드여도 대표 주소는 `/api/me/address-defaults` 로 항상 맞춤(주소 관리 반영) */
  editPostId?: string;
  region: string;
  city: string;
  onSyncRegionCity: (regionId: string, cityId: string) => void;
  error?: string;
  /** 정책상 본문 잠금 시 주소 관리 이동 숨김 */
  readOnly?: boolean;
};

/**
 * 거래 글쓰기 — **대표 주소(master)** 한 줄 표시(없으면 거래 기본) + 주소 관리 이동.
 * 등록 시 `region`/`city`는 대표(또는 거래 기본)의 `app_region_id`/`app_city_id`로 맞춤.
 */
export function TradeDefaultLocationBlock({
  editPostId,
  region,
  city,
  onSyncRegionCity,
  error,
  readOnly = false,
}: TradeDefaultLocationBlockProps) {
  const pathname = usePathname();
  const [displayLine, setDisplayLine] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef(onSyncRegionCity);
  syncRef.current = onSyncRegionCity;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/address-defaults", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        defaults?: { master?: unknown; trade?: unknown };
      };
      if (!res.ok || !j.ok) {
        setDisplayLine(null);
        setReady(true);
        return;
      }
      const addr = pickAddressForTradeWrite(j.defaults);
      if (!addr?.id) {
        setDisplayLine(null);
        setReady(true);
        return;
      }
      const line = stripCountryFromAddressDisplayLine(
        buildTradePublicLine(addr),
        addr.countryName
      ).trim();
      setDisplayLine(line || null);
      /** DB에 app_region/city 가 비어 있어도 주소·우편번호로 id 추론 */
      const inferred = inferAppLocationIdsFromUserAddress(addr);
      if (inferred) syncRef.current(inferred.regionId, inferred.cityId);
    } catch {
      setDisplayLine(null);
    } finally {
      setReady(true);
    }
  }, []);

  /** 신규·수정 공통: 마운트·경로·탭 복귀·뒤로 가기 시 최신 대표 주소 반영 */
  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    const onPop = () => void load();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => void load();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  /** 수정 폼 스냅샷 라벨 — API 로딩 중 임시 표시·API 실패 시 폴백 */
  const snapshotLabel = editPostId && region && city ? getLocationLabel(region, city) : null;

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-2 text-[14px] font-medium text-sam-fg">
        거래 지역 <span className="text-red-500">*</span>
      </p>
      <p className="break-words text-[14px] leading-snug text-sam-fg">
        {!ready
          ? snapshotLabel ?? "…"
          : displayLine?.trim() ||
            snapshotLabel ||
            "대표 주소가 없습니다. 아래 「주소 관리로 변경」에서 대표 주소를 설정해 주세요."}
      </p>
      {!readOnly ? (
        <Link
          href={ADDRESSES_HREF}
          className="mt-3 inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 text-[14px] font-medium text-sam-fg hover:bg-sam-app"
        >
          주소 관리로 변경
        </Link>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-red-500">{error}</p> : null}
    </section>
  );
}
