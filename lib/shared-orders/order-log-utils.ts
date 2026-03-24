import type { SharedActionType, SharedOrderLog, SharedOrderStatus } from "./types";

export function newSharedLogId() {
  return `slog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildSharedLog(p: {
  order_id: string;
  actor_type: SharedOrderLog["actor_type"];
  actor_name: string;
  action_type: SharedActionType;
  from_status: SharedOrderStatus | null;
  to_status: SharedOrderStatus | null;
  message: string;
  created_at?: string;
}): SharedOrderLog {
  return {
    id: newSharedLogId(),
    order_id: p.order_id,
    actor_type: p.actor_type,
    actor_name: p.actor_name,
    action_type: p.action_type,
    from_status: p.from_status,
    to_status: p.to_status,
    message: p.message,
    created_at: p.created_at ?? new Date().toISOString(),
  };
}
