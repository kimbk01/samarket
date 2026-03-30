import { redirect } from "next/navigation";

/** 신뢰/배터리 화면은 `/my/trust`로 통합. */
export default function LegacyMypageTrustRedirect() {
  redirect("/my/trust");
}
