# Government workflow goal report

Date: 2026-10-01. Starting commit: `f431f1a62809cb94dabb44a2048f06625116434b`. Branch: `codex/government-workflow`. The starting tree was clean. No applicable AGENTS.md was found in the workspace or ancestors.

The code is implemented and tested using isolated synthetic data. The owner subsequently explicitly requested permanent removal of all five legacy root folders and their contents. A database/private-file backup was restored and verified first; the removal and migrations were rehearsed on that restored copy, then applied to the live development database. The live installation now has six approved roots and its existing protected Main Admin mapped to V1, with the same identity/password. **Remaining legacy account/invitation mapping is blocked**; one old Viewer and five invitations are preserved without invented clearances. This report does not claim full migration or exhaustive verification.

## G01–G14 status

Complete denotes implemented code and the stated isolated evidence; it does not denote completion of the blocked production deployment.

| Goal | Status | Implementation and evidence |
|---|---|---|
| G01 | Complete | Separate role/clearance fields and central `api/server/lib/access.js`; shared frontend access helpers. Real PostgreSQL test covers Main, Admin V1/V2/V3 and Viewer V1/V2/V3/V4. Legacy labels have no implicit rank. |
| G02 | Complete | Current-user permission versions; ancestor/collection/object gates in categories/data/documents/imports/dashboard/reports/trash/audit. Direct IDs, authorized counts, report gates, whole-source access and restricted audit cursors tested. Storage keys and sensitive audit fields omitted; APIs private/no-store. |
| G03 | Complete | Six stable roots exist in the live installation; database/API/UI restrictions on create/move/archive/delete/root conversion, Main-only rename and current slot ordering. Actual root-menu and PostgreSQL tests. Owner-approved removal of the five legacy roots superseded the earlier mapping decision; protected workflow roots cannot use the legacy reset tool. |
| G04 | Complete | XLSX inspection/commit separation, typed records, retained source and highest-row authorization; permitted levels; PDF/JPG validation/private uploads; retry deduplication and transactional notices. Automated workbook/source tests and actual PDF upload/preview. Remaining manual file-format checks are noted under G13. |
| G05 | Complete | Scoped File Manager/Data visual tokens, Myanmar typography, breadcrumbs/destination/levels and dialog focus. Integration verifies pagination across 105 documents and completeness across 505 collections. Actual desktop/phone/long-name UI evidence. |
| G06 | Complete | `ProductionDashboard.jsx` uses persisted authorized roots, collections, rows, widgets and files. Search/filters/pagination/preview/download/export/source retrieval and refresh. Owner's blue header, logos, six Burmese names and lower-panel wording. Original Dashboard function unchanged and gated at `/dashboard/demo`; production `/dashboard` is standalone for Viewers. |
| G07 | Complete | Exact account matrix, protected Main identity, expiring single-use invitations/resets, regeneration/cancellation and permission/session revocation. PostgreSQL matrix/target tests. Owner will create initial Admin V1/V2/V3 accounts through User & Access; no production identities fabricated. |
| G08 | Complete | Main Admin Admins/Viewers tabs; V1 server-side Viewer-only scope; search/level/status filters; separate role/clearance chips and confirmation dialogs. Frontend tests and actual Main invitation options/Escape focus verification. |
| G09 | Complete | Atomic Notification/NotificationRead persistence and operation-key dedup; current recipient/target authorization; per-user reads; header-authenticated SSE/reconnect/poll fallback. Integration verifies retries, reads, source sensitivity, transaction rollback and a real HTTP SSE revocation. Actual upload notice/target/read state checked. |
| G10 | Complete | WorkflowHeader notifications, local timestamp, role/clearance and grapheme-safe initials. Actual Myanmar identity and phone layout checks. |
| G11 | Blocked | Three migrations, safe inventory, per-ID validation/dry run and transactional mapping prepared. Live schema migration followed an owner-authorized legacy-content removal with restored/verified backup. Main V1 mapping preserves identity/password. One legacy Viewer and five invitations still need explicit clearance mapping; their access is not broadened. Backup/order/rollback instructions in `docs/workflow-deployment.md`. |
| G12 | Deferred | No fake Power BI, public publication, nonfunctional production tab or cloud transfer. Hosting, licensing and approved classified-data handling remain unresolved. |
| G13 | Partial | Applicable API lint/typecheck/build/schema checks passed; 60 default API tests passed, 14 skipped. Dedicated PostgreSQL suite separately ran 12 tests, all passed. Frontend configured typecheck/build and 47 tests passed. Manual matrix/file-format and production deployment gaps remain. |
| G14 | Complete | Scoped implementation committed and pushed to codex/government-workflow. This separate report commit records the implementation SHA, actual checks and evidence; its SHA is provided in final delivery. No force push or default-branch merge. |

## Implemented permissions

| Account | Readable content | Input | Account management | Demo |
|---|---|---|---|---|
| Protected Main Admin | V1–V4 | V1–V4 | Other Admins V1–V3; Viewers V1–V4 | Yes |
| Admin V1 | V1–V4 | V1–V4 | Viewers V1–V4 only | Yes |
| Admin V2 | V2–V4 | V2–V4 | No | No |
| Admin V3 | V3–V4 | V3–V4 | No | No |
| Viewer V1 | V1–V4 | None | No | No |
| Viewer V2 | V2–V4 | None | No | No |
| Viewer V3 | V3–V4 | None | No | No |
| Viewer V4 | V4 | None | No | No |

Being Admin does not bypass clearance. Every ancestor and collection must also authorize its objects. Main identity remains `isPrimaryAdmin`; promoting another Admin to V1 does not confer Main status. V1 account lists/details/invitations/resets/activation cannot target Admins. Viewers remain Dashboard-only with permitted read-only download/export. Lowering content sensitivity is rejected without an approved declassification policy.

## Files, routes and schema

Frontend work is in `App.jsx`, Categories, FilteredModules, AccountsAccess, ProductionDashboard and shared access/header/dialog-focus/workflow CSS. Supplied branding assets are retained unmodified and cropped through CSS. Unrelated App.css and original Dashboard function are preserved.

Frontend routes: `/dashboard`, `/dashboard/demo`, `/manage/categories`, `/manage/entry`, `/manage/accounts`. Existing `/api/categories`, `/api/data`, `/api/documents`, `/api/dashboard` and admin/report/trash/audit APIs share current authorization. `/api/sources/:id/download` checks the complete associated workbook. Notification routes/read/stream are in `api/server/modules/notifications`; SSE tokens use headers, never URLs.

Prisma adds separate clearance, permissionVersion, protected unique mainSlot, document/import operation keys, Notification/NotificationRead and relevant indexes. Legacy enum labels remain for explicit mapping. Migrations are `20261001000000_workflow_enums`, `20261001010000_government_workflow`, `20261001020000_approved_dashboard_names`. PostgreSQL enum additions commit separately before use. Populated categories stay unmapped; root IDs, ownership, payloads and storage are preserved.

One exact dependency, `pdfjs-dist@6.3.289`, was added for private blob PDF canvas rendering with a local bundled worker. The in-app browser's native PDF iframe was blank; actual canvas rendering was verified. No existing dependency/framework was upgraded. Build emits a 1.27MB worker and 430KB PDF chunk before gzip, loaded on demand.

## Inventory and production blocker

Before removal, read-only inventory found 2 users, 5 invitations, 11 categories including 5 roots, 5 collections, 15,093 NORMAL records, 2 documents, 7 import jobs and 18 dashboard widgets. The owner's screenshot confirmed Main sign-in succeeded while workflow columns/migrations were absent.

The original safe per-ID inventory is outside Git at `C:\Users\LwamKhaung\.codex\visualizations\2026\10\01\01a0f6b0-f221-7f82-a8fa-aa2f94df26d5\workflow-migration-inventory.json`. It excludes emails, credentials, file names and payloads. The owner clarified that the account is Main Admin, then explicitly instructed: remove the old folders and their contents permanently. This supersedes preservation/mapping of those content objects; it does not approve a classification mapping for other accounts.

`reset-legacy-content.js` requires an explicit private deletion plan, a restored-and-verified backup, exact root IDs and unchanged counts. It locks tables, refuses protected workflow roots, rejects orphaned/cyclic categories, removes dependent legacy data in one transaction, preserves users/invitations/audits and appends a purge audit event. Only referenced private files are removed after commit. The initial restored-copy attempt caught an invalid audit enum and rolled back; it was corrected to the existing CATEGORY_PURGED action before a successful rehearsal and live apply.

The verified backup is at `C:\Users\LwamKhaung\.codex\visualizations\2026\10\01\01a0f6b0-f221-7f82-a8fa-aa2f94df26d5\before-owner-reset-20261001` (custom database dump, private storage, private environment copy and verification manifest). It contains sensitive recovery data and is outside Git. Restore matched all table counts and SHA-256 hashes for all 9 storage files. Original 79 audit entries were preserved. Live post-change counts: 6 roots/categories, 0 records/documents/collections/imports/widgets, 2 users, 5 invitations, exactly 1 primary Admin; its clearance is V1. One Viewer and five old invitations remain unmapped.

The six owner-approved names are documented in [deployment instructions](../workflow-deployment.md). Main Admin will create initial Admin V1/V2/V3 accounts through User & Access. Main identity/password was compared before/after and preserved. Main permissionVersion was incremented, refresh sessions revoked and an access-change audit recorded; the owner must sign in again. Normal retention/purge policy remains unchanged; this was an explicit one-time owner-requested removal, not a new automatic retention rule.

## Actual verification results

| Check | Result |
|---|---|
| `npm run verify` in api | Passed ESLint, configured TypeScript, esbuild, tests and Prisma validation. 18 files passed, 2 skipped; 60 tests passed, 14 skipped. |
| `RUN_DATABASE_TESTS=true`, isolated DATABASE_URL, `vitest run tests/government-workflow.integration.test.js` | Real PostgreSQL 17: 1 file, 12 passed, latest duration 17.37s. Database `office_workflow_verify_suite_20261001`. |
| `npm run typecheck` in app | Passed repository `tsconfig.categories.json` scope; not a full-app strict TypeScript audit. |
| `npm test` in app | 6 files, 47 passed. |
| `npm run build` in app | Vite build passed including PDF worker. |
| `npm run prisma:migrate` | All 14 migrations applied to isolated verification DBs; the three workflow migrations subsequently applied to live office_data_manager after approved legacy removal. |
| `npm run prisma:generate` | Passed after stopping the identified API processes; earlier Windows engine-DLL EPERM resolved. |
| Existing database login wrong-password probe, port 3001 | 401 INVALID_CREDENTIALS after fix, replacing prior missing-clearance 500. No password printed or reset. |
| Original Dashboard comparison to starting commit | Identical function after CRLF normalization. |
| Whitespace review | Changed tracked files passed. Staged default check flagged one EOF blank line in the already-applied enum migration; it was retained to preserve migration checksums. `git -c core.whitespace=trailing-space,space-before-tab,-blank-at-eof diff --cached --check` passed. |
| Restored legacy reset rehearsal | Verified preserved Main identity/password, 2 users, 5 invitations, all 79 original audit entries, 6 new roots and zero old content objects; 9 referenced files removed only from the rehearsal storage copy. |
| Live Main authenticated API smoke checks | `/api/auth/me`, `/api/categories`, `/api/dashboard`, `/api/data/collections`, `/api/notifications`, `/api/admin/users`: all 200. A short-lived locally signed test token was used without printing/persisting it; this is an API check, not password-entry verification. |

The default skipped tests comprise the 12 new opt-in database tests, executed separately above, and 2 old opt-in backend E2E tests that were not run. Mocked unit tests are not represented as real integration. The dedicated suite uses real Prisma queries/transactions and a real HTTP SSE connection; storage is an in-memory adapter with rollback fault injection. Actual UI upload uses separate local private storage.

New `auth-schema-compatibility.test.js` checks valid sign-in/self-service with absent schema and with present-but-unmapped accounts, then rejects content without invented clearance. `workflow-mapping.test.js` checks missing/unknown IDs, Main preservation, root slot uniqueness and child-root rejection. The 12 PostgreSQL cases cover all account combinations, direct-ID/count/report/ancestor gates, Viewer mutation denial with reads, root and child operations, upload levels/dedup, XLSX inspection/commit/highest-row source restrictions, management matrix and old-token revocation, 105-document/505-collection lists, live Dashboard aggregates/archive/restore/demo gating, invitation/reset/activation target restrictions, SSE deactivation, transaction rollback and authorized audit/cursors.

Earlier failures exposed missing current actors in widget archive/preview, stale legacy selectors, native PDF preview, dialog focus/Escape and old-schema authentication. They were repaired; latest relevant checks passed. Earlier failed runs are not counted as passes.

## Actual UI evidence

Synthetic database `office_workflow_verify_20261001`, API 3101, Vite 5174 and separate private storage were used. That temporary UI server was stopped before the live migration and its browser tab closed. The actual API was restarted on 3001; frontend remains 5173. Viewport overrides were reset. The actual sign-in page was opened for the owner to enter the existing password.

- [Desktop Dashboard](ui-evidence/dashboard-desktop.png): 1920px blue design, supplied emblems, six names and lower panels.
- [Phone Dashboard](ui-evidence/dashboard-phone.png): 390px, six tabs; document width measured 390px with no horizontal overflow.
- [Protected root menu](ui-evidence/protected-root-menu.png): Main rename, no root move/cut/delete; toolbar root restrictions.
- [Main invitation dialog](ui-evidence/main-admin-invite-dialog.png): account tabs and Admin V1–V3 choices. Escape/focus checked after repair.
- [PDF inspection controls](ui-evidence/pdf-inspection.png): selected file, destination and level options. Predates native-iframe repair; evidence for controls only.
- [Persisted notice](ui-evidence/notification-upload.png): one unread notice from actual upload; target opened Dashboard PDF and marked read.
- [Rendered PDF](ui-evidence/dashboard-pdf-preview.png): local PDF.js visibly displays synthetic PDF retrieved by authorized private request.
- [Demo reference](ui-evidence/demo-reference.png): sample-only label and unchanged original Dashboard.
- [Viewer direct URL denial](ui-evidence/viewer-management-denied.png): real synthetic Viewer V4 sign-in succeeded, User & Access URL denied, Dashboard return worked without management controls.
- [Actual sign-in ready](ui-evidence/actual-login-ready.png): live frontend 5173 after migration/API restart, ready for the owner's existing credentials.

Long Myanmar user/folder names, qualitative multiline record text, numeric values and record preview were checked. Screenshots contain no production data or passwords.

## Remaining gaps and scope review

Remaining legacy Viewer/invitation mapping, old opt-in E2E tests and exhaustive manual checks for every role/action are unperformed. Manual XLSX commit, JPG preview and multi-page PDF navigation remain unverified. A full accessibility audit and production workload benchmark were not performed. The 505-collection list is complete but fetched as a full authorized list rather than a new paged protocol.

Correct-password live sign-in was initially unverified because the owner's password was unavailable. The owner supplied a successful Main sign-in screenshot before migration. Main's password hash and identity are unchanged; authenticated live APIs now work after migration. Manual password-entry sign-in into the migrated Dashboard awaits the owner; no password was requested or exposed. The remaining unmapped legacy Viewer still sees migration pending and receives no content access.

Changed-file/diff review found scoped requested frontend, shared header/identity and required backend policy/schema/test/deployment work, plus the explicit owner-requested legacy reset utility. App.css, unrelated overview/sample logic, original Dashboard function, private-storage implementation and automatic retention policy were not redesigned. The user-approved legacy removal is the documented data-preservation exception. No .env, credentials, private inventory, removal plan, backup or production files are included in the Git update.

## GitHub delivery

Branch: [codex/government-workflow](https://github.com/lwamkhaung1422002-wq/Office-DashBoard/tree/codex/government-workflow). Implementation commit: `42f58e13b15aa9c15cba9b42af95b169bf9599b3`, pushed successfully with normal `git push -u origin codex/government-workflow`. The separate report commit SHA and confirmed final push result are supplied in the final delivery message, avoiding a self-referential report hash. No force push or default-branch merge is performed.
