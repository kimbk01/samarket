# Legacy IA — feature preservation matrix (pre-runtime)

| label (key) | route | permission | new group | delete | note |
|-------------|-------|------------|-----------|--------|------|
| trade active | sales | member | activity | 0 | KEEP |
| purchases | trade hub | member | activity | 0 | KEEP |
| favorites | favorites | member | activity | 0 | KEEP |
| offers | offers | member | activity | 0 | KEEP |
| recent | recent | member | activity | 0 | KEEP |
| reviews | reviews | member | activity | 0 | KEEP |
| store register | /stores/owner/apply | member | store_order | 0 | KEEP |
| store orders | store-orders | member | store_order | 0 | KEEP |
| rider | store/rider | member | store_order | 0 | KEEP |
| points card | (summary) | member | assets | 0 | MOVE after store |
| account | account href | member | account | 0 | KEEP |
| addresses | addresses | member | account | 0 | KEEP (home complete card removed) |
| payment | store/payment | member | account | 0 | KEEP |
| security | device-permissions | member | account | 0 | KEEP |
| notifications | notifications | member | account | 0 | KEEP |
| language | toggle | member | account | 0 | KEEP |
| region/country | country | member | account | 0 | KEEP |
| service rows | settings/* | member | service | 0 | KEEP (all SERVICE_ITEMS) |
| notices | notices | member | support | 0 | KEEP |
| CS | customer-center | member | support | 0 | KEEP |
| inquiries | /mypage/inquiries | member | support | 0 | KEEP |
| inbox | /mypage/inbox | member | support | 0 | KEEP |
| terms | settings/terms | member | policy | 0 | MOVE from support |
| privacy | /privacy | public | policy | 0 | MOVE |
| business | /business-info | public | policy | 0 | MOVE |
| leave | settings/leave | member | danger | 0 | MOVE from account |
| logout | modal menu_row | member | danger | 0 | MOVE from account |
| required complete card | — | — | — | UI hide | MOVE to account/sheets |
| required incomplete | sheets | member | under identity | 0 | KEEP compact |

writer clone = 0 · route clone = 0 · Admin/CMS = 0
