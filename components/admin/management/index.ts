/**
 * Shared Admin management UI primitives (ARO-OPS-UX-001-W1).
 * Extends existing Admin tree — not a parallel redesign system.
 */
export { AdminManagementTableViewport } from "./AdminManagementTableViewport";
export { AdminManagementBulkBar, AdminManagementCta } from "./AdminManagementBulkBar";
export { AdminManagementSelectionCheckbox } from "./AdminManagementSelectionCheckbox";
export { AdminManagementSurfaceRoot } from "./AdminManagementSurfaceRoot";
export {
  useAdminManagementSelection,
  bindIndeterminate,
} from "./useAdminManagementSelection";
