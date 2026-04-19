"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MyPostAdList } from "@/components/ads/MyPostAdList";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { AdminPostAdRow, MePostAdsMeta } from "@/lib/ads/types";

export default function MyAdsPageClient() {
  const [ads, setAds] = useState<AdminPostAdRow[]>([]);
  const [meta, setMeta] = useState<MePostAdsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAuthHint(null);
    try {
      const res = await fetch("/api/me/post-ads", { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as {
        ok?: boolean;
        ads?: AdminPostAdRow[];
        meta?: MePostAdsMeta;
      };
      if (res.status === 401) {
        setAuthHint("로그인 후 이용할 수 있습니다.");
        setAds([]);
        setMeta(null);
        return;
      }
      if (j.ok && Array.isArray(j.ads)) {
        setAds(j.ads);
        setMeta(j.meta ?? null);
      } else {
        setAds([]);
        setMeta(null);
      }
    } catch {
      setAds([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="내 광고"
        subtitle="게시글·커뮤니티 노출"
        backHref="/mypage"
        section="store"
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        {authHint ? (
          <p className="mb-4 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            {authHint}{" "}
            <Link href="/login" className="font-semibold text-signature underline">
              로그인
            </Link>
          </p>
        ) : null}

        <div className="mb-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-[12px] text-sam-muted">
          <p className="font-semibold text-sam-fg">무엇이 여기에 보이나요?</p>
          <ul className="list-inside list-disc space-y-1 text-[11px] leading-relaxed">
            <li>
              <strong className="text-sam-fg">커뮤니티·동네 피드 게시글 광고</strong> — 글 단위로 신청한 내역(
              <code className="rounded bg-sam-surface-muted px-1">post_ads</code>)이 표시됩니다. 신청은 글 작성·수정 흐름의
              광고 신청과 연결됩니다.
            </li>
            <li>
              <strong className="text-sam-fg">어드민</strong>{" "}
              <Link href="/admin/post-ads" className="text-signature underline">
                광고 신청 관리
              </Link>
              에서 같은 건을 승인·반려합니다(DB 연결 시).
            </li>
            <li>
              <strong className="text-sam-fg">홈·검색 배너(베타)</strong>는 별도 샘플 폼(
              <Link href="/my/ads/apply" className="text-signature underline">
                /my/ads/apply
              </Link>
              )이며, 아직 DB와 연동되지 않았습니다.
            </li>
          </ul>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/philife"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-center text-[14px] font-medium text-sam-fg"
          >
            커뮤니티에서 글 쓰기
          </Link>
          <Link
            href="/my/ads/apply"
            className="rounded-ui-rect bg-sam-surface-muted px-4 py-2 text-center text-[14px] font-medium text-sam-fg"
          >
            홈 노출 신청(베타)
          </Link>
        </div>

        {loading ? (
          <p className="py-10 text-center text-[14px] text-sam-muted">불러오는 중…</p>
        ) : (
          <MyPostAdList ads={ads} metaSource={meta?.source} onRefresh={() => void load()} />
        )}
      </div>
    </div>
  );
}
