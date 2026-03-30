import { Suspense } from "react";
import { ChatsPhilifeHubMainTier1Sync } from "@/components/chats/ChatsPhilifeHubMainTier1Sync";
import { ChatsPhilifeHubClient } from "./ChatsPhilifeHubClient";

export default function ChatsPhilifeHubPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen animate-pulse bg-background" aria-hidden />}
    >
      <div className="min-h-screen bg-background">
        <ChatsPhilifeHubMainTier1Sync />
        <ChatsPhilifeHubClient />
      </div>
    </Suspense>
  );
}