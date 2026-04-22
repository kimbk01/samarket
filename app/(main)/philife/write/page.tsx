import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { WriteForm } from "@/components/community/WriteForm";

interface PhilifeWritePageProps {
  searchParams: Promise<{
    category?: string;
  }>;
}

export default function PhilifeWritePage({ searchParams }: PhilifeWritePageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeWritePageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function PhilifeWritePageBody({ searchParams }: PhilifeWritePageProps) {
  const { category } = await searchParams;
  if (category?.trim().toLowerCase() === "meetup") {
    /** 모임 UX는 Philife meetup 글쓰기가 아닌 메신저 `open_chat`·오픈그룹 시트로 통일 */
    redirect("/community-messenger?section=open_chat&open=public-group-find");
  }
  return <WriteForm initialCategory={category} />;
}
