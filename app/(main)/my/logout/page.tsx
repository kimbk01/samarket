import { redirect } from "next/navigation";

export default function LogoutPage() {
  redirect("/mypage/logout");
}
