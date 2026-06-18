type LogPayload = Record<string, unknown>;

function logLine(prefix: string, event: string, payload?: LogPayload): void {
  const msg = payload ? `${prefix} ${event} ${JSON.stringify(payload)}` : `${prefix} ${event}`;
  console.info(msg);
}

export function logNotifyMessage(event: string, payload?: LogPayload): void {
  logLine("[notify-message]", event, payload);
}

export function logNotifyBadge(event: string, payload?: LogPayload): void {
  logLine("[notify-badge]", event, payload);
}

export function logNotifyOpen(event: string, payload?: LogPayload): void {
  logLine("[notify-open]", event, payload);
}

export function logMissedCall(event: string, payload?: LogPayload): void {
  logLine("[missed-call]", event, payload);
}
