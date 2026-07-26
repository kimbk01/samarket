import { redirect } from "next/navigation";

/** Legacy `/my/benefits` — canonical `/mypage/benefits`. */
export default function MyBenefitsLegacyRedirectPage() {
  redirect("/mypage/benefits");
}
