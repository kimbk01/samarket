import { redirect } from "next/navigation";

/** 내 활동 글 화면은 `/my/community-posts`로 통합. */
export default function LegacyMypageCommunityPostsRedirect() {
  redirect("/my/community-posts");
}
