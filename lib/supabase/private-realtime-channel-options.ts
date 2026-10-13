/**
 * Private Realtime channel options (Public access OFF → every join must be `config.private: true`).
 * Domain-neutral SSOT: messenger, support, store and admin channels all use this shape; topic
 * authorization lives in `internal.cm_realtime_can_read_topic`.
 * The same topic must always be opened with the same options (realtime-js reuses channels by topic).
 */
export function privateRealtimeChannelOptions(broadcast?: { ack?: boolean; self?: boolean }): {
  config: { private: true; broadcast: { ack: boolean; self: boolean } };
} {
  return {
    config: {
      private: true,
      broadcast: { ack: broadcast?.ack === true, self: broadcast?.self === true },
    },
  };
}
