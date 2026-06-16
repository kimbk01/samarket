export type CallLogChannel = "runtime" | "state" | "agora" | "native";

const PREFIX: Record<CallLogChannel, string> = {
  runtime: "[call-runtime]",
  state: "[call-state]",
  agora: "[call-agora]",
  native: "[call-native]",
};

export function logCall(channel: CallLogChannel, event: string, payload?: Record<string, unknown>): void {
  console.info(`${PREFIX[channel]} ${event}`, payload ?? {});
}
