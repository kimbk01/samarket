/**
 * @deprecated Post-commit best-effort projection removed.
 * Messenger status is updated inside gift_certificate_{accept|reject|cancel} TX
 * via gift_transfer_project_message_status_in_tx (migration 20261202180000).
 * Acceleration bump is published from executeGiftTransferTransition.
 */
export async function projectGiftTransferMessengerStatus(): Promise<void> {
  return;
}
