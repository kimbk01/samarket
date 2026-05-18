import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { PostsNewServiceHubClient } from "./PostsNewServiceHubClient";

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

/**
 * 레거시 진입점 `/posts/new?type=…`
 * - community(기본): 필라이프 글쓰기로 통합
 * - service: 거래/서비스 카테고리 쓰기 허브(`/write`)로 안내
 */
export default function NewPostPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <NewPostPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function NewPostPageBody({ searchParams }: PageProps) {
  const sp = await searchParams;
  const type = (sp.type ?? "community").trim().toLowerCase();

  if (type === "community") {
    return redirect("/philife/write");
  }

  return <PostsNewServiceHubClient />;
}
