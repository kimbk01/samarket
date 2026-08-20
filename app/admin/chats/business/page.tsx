import { redirect } from "next/navigation";

/** ALIAS — no CM domain `business`. Canonical = store_order via order-chats LIVE. */
export default function AdminChatsBusinessPage() {
  redirect("/admin/order-chats");
}
