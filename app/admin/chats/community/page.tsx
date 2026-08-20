import { redirect } from "next/navigation";

/** ALIAS — no CM domain `community`. Canonical = general_direct. */
export default function AdminChatsCommunityPage() {
  redirect("/admin/chats/general");
}
