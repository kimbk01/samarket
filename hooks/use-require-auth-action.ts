"use client";

import { useCallback } from "react";
import {
  requireAuthAction,
  type RequireAuthActionOptions,
  type RequireAuthActionType,
} from "@/lib/auth/require-auth-action";

export function useRequireAuthAction() {
  return useCallback(
    (
      actionType: RequireAuthActionType,
      nextAction: () => void | Promise<void>,
      options?: RequireAuthActionOptions,
    ) => requireAuthAction(actionType, nextAction, options),
    [],
  );
}
