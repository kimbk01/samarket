import { redirect } from "next/navigation";

/** 거래 후기 없음(Owner 2026-10-28) — 판매자는 구매자를 지정하지 않으므로 후기가 성립하지 않는다. 예전 주소는 /philife 로 보낸다. */
export default function PhilifeReviewsPage() {
  redirect("/philife");
}
