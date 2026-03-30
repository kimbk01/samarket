import { redirect } from "next/navigation";

/** 비즈 허브는 기존 매장 탭(`/stores`)과 동일 진입으로 유지 */
export default function BizRedirectPage() {
  redirect("/stores");
}
