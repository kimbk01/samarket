import { redirect } from "next/navigation";

/** @deprecated `/admin/community/posts` 로 이동했습니다. */
export default function AdminPostsPageRedirect() {
  redirect("/admin/community/posts");
}
