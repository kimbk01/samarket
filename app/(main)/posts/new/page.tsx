import Link from "next/link";
import { redirect } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

/**
 * 레거시 진입점 `/posts/new?type=…`
 * - community(기본): 필라이프 글쓰기로 통합
 * - service: 거래/서비스 카테고리 쓰기 허브(`/write`)로 안내
 */
export default async function NewPostPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const type = (sp.type ?? "community").trim().toLowerCase();

  if (type === "community") {
    redirect("/philife/write");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sam-border-soft bg-sam-surface px-4 py-3">
        <AppBackButton />
        <h1 className="text-[16px] font-semibold text-sam-fg">서비스·거래 글쓰기</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="mx-auto max-w-[480px] space-y-4 px-4 py-6">
        <p className="text-[14px] text-sam-muted">
          서비스 요청·중고거래 등은 카테고리를 고른 뒤 해당 쓰기 화면에서 등록할 수 있어요.
        </p>
        <Link
          href="/write"
          className="inline-flex w-full items-center justify-center rounded-ui-rect bg-sam-ink py-3 text-[14px] font-medium text-white"
        >
          글쓰기 메뉴로 이동
        </Link>
      </div>
    </div>
  );
}
