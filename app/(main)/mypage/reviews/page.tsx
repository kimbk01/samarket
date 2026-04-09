import Link from "next/link";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageReviewsHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="후기 관리"
        subtitle="작성·받은 거래 후기"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <p className="text-[14px] leading-relaxed text-gray-600">
          <strong className="text-gray-900">내가 남긴 거래 후기</strong>는 아래에서 확인할 수 있어요. 새 후기는{" "}
          <Link href="/mypage/purchases" className="font-medium text-signature underline">
            구매내역
          </Link>
          에서 <strong className="text-gray-900">거래완료 확인</strong> 후 평가·후기를 작성할 수 있어요.
        </p>
        <MyWrittenReviewsView />
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="mb-2 text-[13px] font-medium text-gray-800">바로가기</p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/mypage/purchases"
                className="block rounded-lg border border-[#DBDBDB] bg-[#FAFAFA] px-3 py-2.5 text-[14px] font-medium text-[#262626]"
              >
                구매내역
              </Link>
            </li>
            <li>
              <Link
                href="/mypage/sales"
                className="block rounded-lg border border-[#DBDBDB] bg-[#FAFAFA] px-3 py-2.5 text-[14px] font-medium text-[#262626]"
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
