import { redirect } from "next/navigation";

/**
 * CI `verify:routes` 가 요구하는 `app/(main)/home` 세그먼트.
 * 실제 랜딩은 루트 `app/page.tsx` 및 제품 기본 탭과 동일하게 Philife 로 통일한다.
 */
export default function HomeSegmentPage() {
  redirect("/philife");
}
