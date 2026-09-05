# ARO-OPS-UX-002-B6 — Support / Notification surface inventory

| Surface | Route / API | Entity | Actor | Mutation owner | Status | Notification | Deeplink | Notes |
|---|---|---|---|---|---|---|---|---|
| Admin Support root | `/admin/support` | support_cases | Admin | support-case-service | OPEN/WAITING_*/RESOLVED/ARCHIVED | — | self | **Canonical root** |
| Case detail | `/admin/support/[caseId]` | support_cases + messages | Admin | same | same | — | exact case | Workspace |
| Archive | `/admin/support/archive` | legacy inquiries | Admin | archive only | — | — | archive | History |
| List API | `GET /api/admin/support/cases` | support_cases | Admin | read | filter | — | — | |
| Detail API | `GET/PATCH /api/admin/support/cases/[id]` | cases+messages | Admin | reply/status | — | emit on reply | — | |
| Summary | `GET /api/admin/support/summary` | counts | Admin | read | actionable OPEN\|WAITING_ADMIN | badge | — | A2-2 |
| Member intake | Support FAB / modal | support_cases | Member | createCase | OPEN | support_case_created (member-facing) | member UI | A2-1 |
| Owner intake | Owner Support FAB | support_cases + store_id | Owner | createCase | OPEN | same family | owner UI | A2-1 |
| Admin reply | POST message | support_messages | Admin | appendMessage | → WAITING_USER | to requester | — | |
| Resolve/reopen | PATCH status | support_cases | Admin | updateStatus | RESOLVED / WAITING_ADMIN | support_case_resolved/reopened | — | reply≠resolve |
| Action Center | `/admin` common-support | queue count | — | — | supportActionableCount | — | `/admin/support` | needs `#action-required` |
| Domain dashboards | delivery/trade/… | support_actionable | — | — | — | — | `/admin/support` | filter deeplink |
| Context hrefs | `support-reference-admin-href` | order/store/ad/finance | — | — | — | — | B3/B4/B5/order | existing |
| Admin ops sound | registry | reports etc. | — | — | — | existing | — | preserve; Support if mapped |
| Messenger | — | — | — | — | — | — | — | **NOT Support** |

NEW DB / Notification system / Messenger merge: **FORBIDDEN**
