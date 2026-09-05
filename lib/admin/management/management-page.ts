/**
 * Shared management page anatomy — order & meaning.
 * Sections are optional per page; order is the contract.
 */
export const MANAGEMENT_PAGE_ANATOMY = [
  "breadcrumb",
  "title",
  "description",
  "primaryAction",
  "summary",
  "searchFilter",
  "bulkBar",
  "tableViewport",
  "resultCountPagination",
] as const;

export type ManagementPageSection = (typeof MANAGEMENT_PAGE_ANATOMY)[number];

export const MANAGEMENT_FILTER_ORDER = [
  "search",
  "status",
  "domainFilters",
  "date",
  "sort",
  "resetRefresh",
] as const;

/** data-* markers for proof / prod-light */
export const MANAGEMENT_DATA_ATTRS = {
  root: "data-aro-ops-ux-001-w1",
  tableViewport: "data-admin-mgmt-table-viewport",
  bulkBar: "data-admin-mgmt-bulk-bar",
  selectionHeader: "data-admin-mgmt-select-all",
  rowSelect: "data-admin-mgmt-row-select",
} as const;
