"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  neighborhoodLocationLabelFromRegion,
} from "@/lib/neighborhood/location-key";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { philifeNeighborhoodFeedUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";

export function CommunityMyHubClient({ userId }: { userId: string }) {
  const { currentRegion } = useRegion();
  const locationKey = neighborhoodLocationKeyFromRegion(currentRegion);
  const locationMeta = neighborhoodLocationMetaFromRegion(currentRegion);
  const locationLabel = neighborhoodLocationLabelFromRegion(currentRegion);
  const locationCity = locationMeta?.city ?? "";
  const locationDistrict = locationMeta?.district ?? "";
  const locationName = locationMeta?.name ?? "";
  const regionLabel = currentRegion?.label ?? "";
  const [mine, setMine] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!locationKey) {
      setErr("지역을 먼저 선택해 주세요.");
      setMine([]);
      return;
    }
    setErr("");
    try {
      const p = new URLSearchParams();
      p.set("locationKey", locationKey);
      p.set("city", locationCity);
      p.set("district", locationDistrict);
      p.set("name", locationName || locationLabel || regionLabel);
      p.set("authorId", userId);
      p.set("limit", "30");
      p.set("offset", "0");
      const res = await fetch(philifeNeighborhoodFeedUrl(p.toString()), { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; posts?: NeighborhoodFeedPostDTO[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "불러오기 실패");
        setMine([]);
        return;
      }
      setMine(j.posts ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [locationKey, locationLabel, locationCity, locationDistrict, locationName, regionLabel, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">관심이웃 글만 보기</h2>
        <p className="mt-1 text-[13px] text-gray-600">
          피드 상단에서 「관심이웃」 필터를 켜면 이웃 글 위주로 볼 수 있어요.
        </p>
        <Link
          href={philifeAppPaths.home}
          className="mt-3 inline-block rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-medium text-white"
        >
          커뮤니티 열기
        </Link>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">내가 쓴 글 (현재 동네)</h2>
        {err ? <p className="mt-2 text-[13px] text-red-600">{err}</p> : null}
        <ul className="mt-3 divide-y divide-gray-100">
          {mine.length === 0 && !err ? (
            <li className="py-3 text-[14px] text-gray-500">글이 없습니다.</li>
          ) : (
            mine.map((p) => (
              <li key={p.id} className="py-3">
                <Link href={philifeAppPaths.post(p.id)} className="text-[14px] font-medium text-sky-800">
                  {p.title}
                </Link>
                <p className="text-[12px] text-gray-500">{p.category_label}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">오픈채팅</h2>
        <p className="mt-1 text-[13px] text-gray-600">참여 중인 오픈채팅은 글 상세·채팅 화면에서 이어갈 수 있어요.</p>
      </section>
    </div>
  );
}
