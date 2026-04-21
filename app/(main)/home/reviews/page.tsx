import Link from "next/link";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export const dynamic = "force-dynamic";

export default function HomeReviewsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader title="후기 관리" backHref="/home" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <p className="sam-text-body leading-relaxed text-sam-muted">
          <strong className="text-sam-fg">내가 남긴 거래 후기</strong>는 아래에서 확인할 수 있어요. 새 후기는{" "}
          <Link href="/home/purchases" className="font-medium text-signature underline">
            구매내역
          </Link>
          에서 <strong className="text-sam-fg">거래완료 확인</strong> 후 평가·후기를 작성할 수 있어요.
        </p>
        <MyWrittenReviewsView />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
          <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">바로가기</p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/home/purchases"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                구매내역
              </Link>
            </li>
            <li>
              <Link
                href="/home/sales"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                판매내역
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
