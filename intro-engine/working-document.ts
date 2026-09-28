import type { IntroShowDocument } from "./document";
import { cloneIntroShowDocument } from "./document";

type Listener = () => void;

let working: IntroShowDocument | null = null;
let pointerActive = 0;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeWorkingDocument(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkingDocument(): IntroShowDocument | null {
  return working;
}

export function replaceWorkingDocument(next: IntroShowDocument): void {
  working = cloneIntroShowDocument(next);
  notify();
}

export function mutateWorkingDocument(mutator: (doc: IntroShowDocument) => IntroShowDocument): void {
  if (!working) return;
  working = cloneIntroShowDocument(mutator(working));
  notify();
}

export function beginPointerTransaction(): void {
  pointerActive += 1;
}

export function endPointerTransaction(): void {
  pointerActive = Math.max(0, pointerActive - 1);
}

export function isPointerTransactionActive(): boolean {
  return pointerActive > 0;
}

export function resetWorkingDocumentStore(): void {
  working = null;
  pointerActive = 0;
}
