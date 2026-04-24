import Link from "next/link";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageReviewsHubPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="후기 관리"
        subtitle="작성·받은 거래 후기"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-4 py-4">
        <p className="sam-text-body leading-relaxed text-sam-muted">
          <strong className="text-sam-fg">내가 남긴 거래 후기</strong>는 아래에서 확인할 수 있어요. 새 후기는{" "}
          <Link href="/mypage/purchases" className="font-medium text-signature underline">
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
                href="/mypage/purchases"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                구매내역
              </Link>
            </li>
            <li>
              <Link
                href="/mypage/sales"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                판매내역
              </Link>
            </li>
          </ul>
        </div>
        </div>
      </div>
    </div>
  );
}
