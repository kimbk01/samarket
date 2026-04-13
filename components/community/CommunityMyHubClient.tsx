"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { philifeAppPaths } from "@domain/philife/paths";

export function CommunityMyHubClient({ userId }: { userId: string }) {
  const [mine, setMine] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const url = buildPhilifeNeighborhoodFeedClientUrl({
        globalFeed: true,
        authorUserId: userId,
        limit: 30,
        offset: 0,
      });
      const res = await fetch(url, { cache: "no-store" });
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
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-sam-fg">관심이웃 글만 보기</h2>
        <p className="mt-1 text-[13px] text-sam-muted">
          피드 상단에서 「관심이웃」 필터를 켜면 이웃 글 위주로 볼 수 있어요.
        </p>
        <Link
          href={philifeAppPaths.home}
          className="mt-3 inline-block rounded-ui-rect bg-sam-ink px-3 py-2 text-[13px] font-medium text-white"
        >
          커뮤니티 열기
        </Link>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-sam-fg">내가 쓴 글</h2>
        {err ? <p className="mt-2 text-[13px] text-red-600">{err}</p> : null}
        <ul className="mt-3 divide-y divide-sam-border-soft">
          {mine.length === 0 && !err ? (
            <li className="py-3 text-[14px] text-sam-muted">글이 없습니다.</li>
          ) : (
            mine.map((p) => (
              <li key={p.id} className="py-3">
                <Link href={philifeAppPaths.post(p.id)} className="text-[14px] font-medium text-sky-800">
                  {p.title}
                </Link>
                <p className="text-[12px] text-sam-muted">{p.category_label}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-sam-fg">모임</h2>
        <p className="mt-1 text-[13px] text-sam-muted">참여 중인 모임은 글 상세에서 계속 확인할 수 있어요.</p>
      </section>
    </div>
  );
}
