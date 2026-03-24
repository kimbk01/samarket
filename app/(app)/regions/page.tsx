import { redirect } from "next/navigation";

/** 9단계: 지역 설정을 내 동네 설정으로 통일 */
export default function RegionsPage() {
  redirect("/my/regions");
}
