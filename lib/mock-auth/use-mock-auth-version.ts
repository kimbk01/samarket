"use client";

import { useSyncExternalStore } from "react";
import { getMockAuthVersion, subscribeMockAuth } from "./mock-auth-store";

export function useMockAuthVersion() {
  return useSyncExternalStore(subscribeMockAuth, getMockAuthVersion, getMockAuthVersion);
}
