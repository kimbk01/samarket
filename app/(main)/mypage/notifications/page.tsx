import { redirect } from "next/navigation";

/** Legacy path — Gate 3 Step 8 canonical Notification Center is /notifications */
export default function MypageNotificationsRedirectPage() {
  redirect("/notifications");
}
