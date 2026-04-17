import { Suspense } from "react";
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
  return <WriteForm initialCategory={category} />;
}
