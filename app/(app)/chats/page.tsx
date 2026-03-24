import { ChatsHubStickyAppBar } from "@/components/chats/ChatsHubStickyAppBar";
import { ChatsPageClient } from "./ChatsPageClient";

export default function ChatsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <ChatsHubStickyAppBar segment="trade" />
      <ChatsPageClient />
    </div>
  );
}
