"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { fetchCommunityMyHubPostsDeduped } from "@/lib/community/fetch-community-my-hub-posts-deduped";
import { philifeAppPaths } from "@domain/philife/paths";

export function CommunityMyHubClient({ userId }: { userId: string }) {
  const [mine, setMine] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const result = await fetchCommunityMyHubPostsDeduped(userId);
      const j = result.json as { ok?: boolean; posts?: NeighborhoodFeedPostDTO[]; error?: string };
      if (result.status < 200 || result.status >= 300 || !j.ok) {
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
        <h2 className="sam-text-body font-semibold text-sam-fg">관심이웃 글만 보기</h2>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          피드 상단에서 「관심이웃」 필터를 켜면 이웃 글 위주로 볼 수 있어요.
        </p>
        <Link
          href={philifeAppPaths.home}
          className="mt-3 inline-block rounded-ui-rect bg-sam-ink px-3 py-2 sam-text-body-secondary font-medium text-white"
        >
          커뮤니티 열기
        </Link>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">내가 쓴 글</h2>
        {err ? <p className="mt-2 sam-text-body-secondary text-red-600">{err}</p> : null}
        <ul className="mt-3 divide-y divide-sam-border-soft">
          {mine.length === 0 && !err ? (
            <li className="py-3 sam-text-body text-sam-muted">글이 없습니다.</li>
          ) : (
            mine.map((p) => (
              <li key={p.id} className="py-3">
                <Link href={philifeAppPaths.post(p.id)} className="sam-text-body font-medium text-sky-800">
                  {p.title}
                </Link>
                <p className="sam-text-helper text-sam-muted">{p.category_label}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">모임</h2>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">참여 중인 모임은 글 상세에서 계속 확인할 수 있어요.</p>
      </section>
    </div>
  );
}
