import { redirect } from "next/navigation";

/** CONTRACT: Large-group experimental axis — user-facing SSOT is CM private_group. */
export default function GroupChatHomePage() {
  redirect("/community-messenger?section=chats&filter=private_group");
}
