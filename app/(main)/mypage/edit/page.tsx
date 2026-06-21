import { redirect } from "next/navigation";

export default function MypageEditRedirectPage() {
  redirect("/mypage?sheet=profile-edit");
}
