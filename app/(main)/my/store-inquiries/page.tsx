import { redirect } from "next/navigation";

/** Legacy `/my/store-inquiries` — canonical `/mypage/store-inquiries`. */
export default function LegacyMyRedirectPage() {
  redirect("/mypage/store-inquiries");
}
