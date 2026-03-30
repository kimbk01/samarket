import { redirect } from "next/navigation";

/** 레거시 URL — 모임(오리지널)은 `/philife/write?category=meetup` 에서만 생성 */
export default function PhilifeOpenChatCreateRedirectPage() {
  redirect("/philife/write?category=meetup");
}
