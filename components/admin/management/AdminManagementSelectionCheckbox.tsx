"use client";

import { useEffect, useRef } from "react";
import type { SelectionHeaderState } from "@/lib/admin/management/selection";
import { bindIndeterminate } from "./useAdminManagementSelection";

export function AdminManagementSelectionCheckbox(props: {
  state?: SelectionHeaderState;
  onToggle: () => void;
  disabled?: boolean;
  "aria-label": string;
  role: "header" | "row";
  checked?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { onToggle, disabled, role } = props;
  const headerState = props.state ?? "none";

  useEffect(() => {
    if (role === "header") bindIndeterminate(ref.current, headerState);
  }, [role, headerState]);

  const checked = role === "header" ? headerState === "all" : Boolean(props.checked);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onToggle}
      aria-label={props["aria-label"]}
      data-admin-mgmt-select-all={role === "header" ? "1" : undefined}
      data-admin-mgmt-row-select={role === "row" ? "1" : undefined}
    />
  );
}
