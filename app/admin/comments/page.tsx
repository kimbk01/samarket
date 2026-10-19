import { redirect } from "next/navigation";

/** 레거시 댓글 화면 (브라우저 직접 삭제 — C-24) 종료. 커뮤니티 댓글 관리로 이동한다. */
export default function AdminCommentsLegacyRedirectPage() {
  redirect("/admin/community/comments");
}
