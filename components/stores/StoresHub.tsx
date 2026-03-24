"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRegion } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
import { StoresIndustryGrid } from "@/components/stores/browse/StoresIndustryGrid";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { useOwnerHubBadgeTotal } from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";

export type PublicStoreRow = {
  id: string;
  store_name: string;
  slug: string;
  region: string | null;
  city: string | null;
  district: string | null;
  profile_image_url: string | null;
  description: string | null;
  is_open: boolean | null;
  created_at?: string;
};

export function StoresHub() {
  const { primaryRegion } = useRegion();
  const [stores, setStores] = useState<PublicStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ source?: string; sorted_by?: string } | null>(null);
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [showOwnerManage, setShowOwnerManage] = useState(false);
  const ownerHubBadge = useOwnerHubBadgeTotal();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { maximumAge: 300_000, timeout: 10_000 }
    );
  }, []);

  const querySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (d) q.set("district", d);
    if (userGeo) {
      q.set("user_lat", String(userGeo.lat));
      q.set("user_lng", String(userGeo.lng));
    }
    if (debouncedQ.length >= 2) q.set("q", debouncedQ);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [primaryRegion?.regionId, primaryRegion?.barangay, userGeo, debouncedQ]);

  const loadStores = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/stores${querySuffix}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.stores)) {
          setStores(json.stores);
          setMeta(json.meta ?? null);
        }
      } catch {
        if (!silent) setStores([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [querySuffix]
  );

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useRefetchOnPageShowRestore(() => void loadStores({ silent: true }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
        if (cancelled || res.status === 401) {
          if (!cancelled) setShowOwnerManage(false);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setShowOwnerManage(false);
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: unknown };
        const list = Array.isArray(j?.stores) ? j.stores : [];
        if (!cancelled) setShowOwnerManage(list.length > 0);
      } catch {
        if (!cancelled) setShowOwnerManage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerManageLink =
    showOwnerManage ? (
      <Link
        href="/my/business"
        className="relative inline-flex shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold leading-tight text-gray-800 shadow-sm active:bg-gray-50"
        aria-label={ownerHubBadge > 0 ? `매장 관리, 확인 필요 ${ownerHubBadge}건` : "매장 관리"}
      >
        매장 관리
        {ownerHubBadge > 0 ? (
          <span
            className={`${OWNER_HUB_BADGE_DOT_CLASS} -right-2 -top-2 ring-white`}
            aria-hidden
          >
            {ownerHubBadge > 99 ? "99+" : ownerHubBadge}
          </span>
        ) : null}
      </Link>
    ) : null;

  return (
    <div className="min-h-[50vh]">
      <section className="space-y-3">
        <StoresIndustryGrid headerTrailing={ownerManageLink} />

        <h2 className="pt-1 text-sm font-semibold text-gray-800">동네 등록 매장</h2>
        <p className="-mt-2 text-[11px] text-gray-500">Supabase에 승인된 실매장이 여기에 표시됩니다.</p>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <label htmlFor="stores-search" className="sr-only">
            매장 검색
          </label>
          <input
            id="stores-search"
            type="search"
            enterKeyHint="search"
            placeholder="매장 이름 검색 (2자 이상)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-[#F7F7F7] px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow-sm">
          <Link
            href="/my/business"
            className="inline-flex flex-1 min-w-[140px] items-center justify-center rounded-lg bg-signature px-3 py-2.5 text-center text-sm font-medium text-white"
          >
            내 매장 · 사업자 신청
          </Link>
          <Link
            href="/regions"
            className="inline-flex flex-1 min-w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-medium text-gray-800"
          >
            동네 설정
          </Link>
        </div>

        {meta?.source === "supabase_unconfigured" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Supabase가 연결되지 않았거나 매장 테이블이 아직 없습니다. SQL 마이그레이션 적용 후
            데이터가 표시됩니다.
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">불러오는 중…</p>
        ) : stores.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
            <p className="text-sm text-gray-600">아직 노출 중인 매장이 없습니다.</p>
            <p className="mt-1 text-xs text-gray-400">
              사업자 인증 후 매장이 승인되면 이곳에 나타납니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 pb-4">
            {stores.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/stores/${encodeURIComponent(s.slug)}`}
                  className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm active:bg-gray-50"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {s.profile_image_url ? (
                       
                      <img
                        src={s.profile_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                        매장
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-gray-900">{s.store_name}</span>
                      {s.is_open === false && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                          준비중
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {formatStoreLocationLine(s) ?? "위치 미등록"}
                    </p>
                    {s.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">{s.description}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
