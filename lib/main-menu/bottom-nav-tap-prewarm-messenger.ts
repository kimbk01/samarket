"use client";

import { scheduleWarmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client-loader";

export function prewarmBottomNavMessengerTab(): void {
  scheduleWarmMessengerListBootstrapClient();
}
