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
| G04 | Complete | XLSX inspection/commit separation, typed records, retained source and highest-row authorization; permitted levels; PDF/JPG validation/private uploads; retry deduplication and transactional notices. Automated workbook/source tests plus actual two-row XLSX inspect/commit, valid JPG preview and two-page PDF navigation. |
| G05 | Complete | Scoped File Manager/Data visual tokens, Myanmar typography, breadcrumbs/destination/levels and dialog focus. Integration verifies pagination across 105 documents and completeness across 505 collections. Actual desktop/phone/long-name UI evidence. |
| G06 | Complete | `ProductionDashboard.jsx` uses persisted authorized roots, collections, rows, widgets and files. Search/filters/pagination/preview/download/export/source retrieval and refresh. Owner's blue header, logos and six Burmese names. Slot 1 now opens a full-page Strategy/Policy view with Back and 17 actual department folders in a vertical menu; authorized JPG/PDF previews work within Dashboard. Original Dashboard function unchanged and gated at `/dashboard/demo`; production `/dashboard` is standalone for Viewers. |
| G07 | Complete | Exact account matrix, protected Main identity, expiring single-use invitations/resets, regeneration/cancellation and permission/session revocation. PostgreSQL matrix/target tests. Owner will create initial Admin V1/V2/V3 accounts through User & Access; no production identities fabricated. |
| G08 | Complete | Main Admin Admins/Viewers tabs; V1 server-side Viewer-only scope; search/level/status filters; separate role/level badges and confirmation dialogs. One Add entry point and passwordless role/level modal. Actual Main and V1 UI checks. Every row has a visible kebab with Reset Login/Deactivate; protected or unavailable operations remain disabled. See follow-up scope exception below. |
| G09 | Complete | Atomic Notification/NotificationRead persistence and operation-key dedup; current recipient/target authorization; per-user reads; header-authenticated SSE/reconnect/poll fallback. Integration verifies retries, reads, source sensitivity, transaction rollback and a real HTTP SSE revocation. Actual upload notice/target/read state checked. |
| G10 | Complete | WorkflowHeader notifications, local timestamp, role/clearance and grapheme-safe initials. Actual Myanmar identity and phone layout checks. |
| G11 | Blocked | Three migrations, safe inventory, per-ID validation/dry run and transactional mapping prepared. Live schema migration followed an owner-authorized legacy-content removal with restored/verified backup. Main V1 mapping preserves identity/password. One legacy Viewer and five invitations still need explicit clearance mapping; their access is not broadened. Backup/order/rollback instructions in `docs/workflow-deployment.md`. |
| G12 | Deferred | No fake Power BI, public publication, nonfunctional production tab or cloud transfer. Hosting, licensing and approved classified-data handling remain unresolved. |
| G13 | Partial | Applicable API lint/typecheck/build/schema checks passed; latest default API tests: 60 passed, 19 skipped. Dedicated PostgreSQL runs: previous government suite 13 passed plus new strategy suite 4 passed. Frontend configured typecheck/build and 47 tests passed. Main/V1/Viewer UI, desktop/phone, XLSX commit, JPG and multi-page PDF checked. Old E2E and broader manual matrix/deployment gaps remain. |
| G14 | Complete | Earlier implementation was committed and pushed to the original repository's codex/government-workflow branch. Current Home/drawer/accounts changes are in local commit be4d07d. After the requested new destination rejected publication, the owner explicitly canceled GitHub pushing and authorized remaining implementation to continue locally. The report and scoped local delivery are retained; no new-repository publication is claimed. |

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

Frontend routes: `/dashboard`, `/dashboard/demo`, `/manage/overview`, `/manage/categories`, `/manage/entry`, `/manage/accounts`. Existing `/api/categories`, `/api/data`, `/api/documents`, `/api/dashboard` and admin/report/trash/audit APIs share current authorization. `/api/admin/home` supplies current authorized file counts, six monthly points and recent activity. `/api/sources/:id/download` checks the complete associated workbook. Notification routes/read/stream are in `api/server/modules/notifications`; SSE tokens use headers, never URLs.

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
| `npm run verify` in api | Passed ESLint, configured TypeScript, esbuild, tests and Prisma validation. 18 files passed, 2 skipped; 60 tests passed, 15 skipped. |
| `RUN_DATABASE_TESTS=true`, isolated DATABASE_URL, `vitest run tests/government-workflow.integration.test.js` | Real PostgreSQL 17: 1 file, 13 passed, latest duration 12.65s. Database `office_workflow_verify_suite_20261001`. |
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

The default skipped tests comprise the 13 new opt-in database tests, executed separately above, and 2 old opt-in backend E2E tests that were not run. Mocked unit tests are not represented as real integration. The dedicated suite uses real Prisma queries/transactions and a real HTTP SSE connection; storage is an in-memory adapter with rollback fault injection. Actual UI upload uses separate local private storage.

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

Remaining legacy Viewer/invitation mapping, old opt-in E2E tests and exhaustive manual checks for every role/action are unperformed. Manual XLSX commit, JPG preview and multi-page PDF navigation were subsequently verified in the follow-up below. A full accessibility audit and production workload benchmark were not performed. The 505-collection list is complete but fetched as a full authorized list rather than a new paged protocol.

Correct-password live sign-in was initially unverified because the owner's password was unavailable. The owner supplied a successful Main sign-in screenshot before migration. Main's password hash and identity are unchanged; authenticated live APIs now work after migration. Manual password-entry sign-in into the migrated Dashboard awaits the owner; no password was requested or exposed. The remaining unmapped legacy Viewer still sees migration pending and receives no content access.

Changed-file/diff review found scoped requested frontend, shared header/identity and required backend policy/schema/test/deployment work, plus the explicit owner-requested legacy reset utility. App.css, unrelated overview/sample logic, original Dashboard function, private-storage implementation and automatic retention policy were not redesigned. The user-approved legacy removal is the documented data-preservation exception. No .env, credentials, private inventory, removal plan, backup or production files are included in the Git update.

## GitHub delivery

Branch: [codex/government-workflow](https://github.com/lwamkhaung1422002-wq/Office-DashBoard/tree/codex/government-workflow). Implementation commit: `42f58e13b15aa9c15cba9b42af95b169bf9599b3`, pushed successfully with normal `git push -u origin codex/government-workflow`. The separate report commit SHA and confirmed final push result are supplied in the final delivery message, avoiding a self-referential report hash. No force push or default-branch merge is performed.

## Dashboard header follow-up — 2026-10-01

The owner requested a Back arrow, user identity on the left, and search, notification bell and Logout on the right. The management text button was removed. Back and identity have additional spacing; Main Admin displays without the V1–V4 chip. Search now sits immediately beside the bell with a responsive width and 44px height matching the bell and Logout. On phones, identity and actions occupy separate rows. Other account clearance labels and existing authorization rules are retained.

Changes are confined to `app/src/App.jsx`, `app/src/viewer/ProductionDashboard.jsx`, `app/src/shared/WorkflowHeader.jsx` and `app/src/shared/workflow.css`. Back clears Dashboard content/search navigation before returning an Admin to File Manager; Viewer landing Back remains disabled when there is no Dashboard history. The notification icon is now an SVG bell, with the existing persisted unread/dropdown behavior.

Verification: app typecheck and final production build passed; app tests passed (6 files, 47 tests); `git diff --check` passed. Actual browser checks used the synthetic `office_workflow_verify_20261001` database and temporary ports 3101/5174. Main Admin Back opened File Manager, search returned one authorized synthetic record and Back cleared it, notifications opened and closed with Escape, and Logout returned the login form. Desktop and 390px phone layouts were visually checked; search, bell and Logout measured 44px high, with no phone horizontal overflow. No production account or database changes were made for this follow-up. The temporary server and browser tab were stopped after verification.

- [Updated desktop header](ui-evidence/dashboard-header-desktop.png)
- [Updated phone header](ui-evidence/dashboard-header-phone.png)

These checks cover this header change; the broader verification gaps above remain unchanged.

## Home, drawer and User & Access follow-up — 2026-10-01

The owner explicitly expanded UI scope to the Home reference image, the app drawer and User & Access. Home now shows four cards, a monthly line chart, a file-type donut and recent activity using `/api/admin/home`. It counts permitted completed Excel source files and active PDF/JPG documents, not record rows. The same folder/collection/whole-workbook authorization is used as downloads; archived rows are still checked when deciding whether the complete source is readable. The chart groups currently available files by original completion/upload month; it is not a historical snapshot of the archive. The requested explanatory paragraph has been removed. The original sample Overview remains unused; the original Dashboard function is unchanged.

Dashboard branding now says Central Data Department. The drawer uses the supplied right-hand logo, the same #0070bc blue and matching SVG navigation icons, and Data replaces the old Myanmar navigation label. The owner delegated sizing to UX judgment: expanded desktop branding uses an 84px logo and 20px two-line title within the existing 360px drawer; collapsed navigation stays 88px. Phone branding uses a 72px logo. This retains menu space instead of a 500px square area. The version/copyright text below Logout has been removed. The shared management header is white with blue icons and notification, identity and Logout aligned on the right.

User & Access uses four white summary cards, Admins/Viewers buttons, a search/filter toolbar and a seven-column table. One Add button opens a 560px pale-blue modal with name/email, account type and Level, and no requested helper paragraphs. Main can choose Admin V1–V3 or Viewer V1–V4; ordinary V1 Admin sees Viewers only. Level replaces Clearance in visible table/form labels while the existing API field remains clearance. Role, level and status badges have darker text and colored borders; unknown/missing values show a plain hyphen. Inactive counts users requiring a login reset; no new Suspended backend status was invented. Pending invitations remain visibly Setup Required, and deactivated users remain Deactivated.

The owner's latest request supersedes the previous row-menu design: every row now has a visible kebab containing only Reset Login and Deactivate. Eligible accounts can use these actions; Main, invitation and disabled rows display disabled items with an explanation. The UI therefore no longer exposes Reactivate or invitation regeneration/cancellation in that menu; the existing protected APIs and setup/reset flow remain in place. No new production account, password or clearance was created or changed during this follow-up. Dialogs focus Full Name, trap keyboard focus, close with Escape and restore focus; row menus support arrows and Escape. Myanmar names wrap within their column. Phones use two-column summary cards, stacked filters and an internally scrolling table rather than page-wide overflow.

Additional PostgreSQL test `shows real Home file totals and activity without leaking gated documents or whole-workbook sources` proves inspection does not count as published Excel, a restricted associated row hides its entire source, a restricted ancestor hides a JPG and its activity, Viewers receive 403, six monthly points end at the total, archive reduces counts and storage keys are absent. All 13 database cases passed. Latest frontend checks: 47 tests passed, configured typecheck passed, production build passed. API verify passed with 60 tests and 15 default skips, of which 13 were executed separately against PostgreSQL. The two legacy E2E cases remain unrun and still expect the obsolete legacy role model.

Actual UI checks used synthetic `office_workflow_verify_20261001`, temporary API/Vite ports 3101/5174 and separate local storage. A real two-row XLSX with Myanmar text was inspected: no records or success notice existed before commit. Commit created two typed rows and one authorized source. A real 720×360 JPG preview loaded at its natural size; a real two-page PDF visibly rendered both pages via Next/Previous. Each successful operation produced one unread notice, and notification targets/read state worked. Home moved from 1 PDF to Total Data 4 / Excel 1 / PDF 2 / JPG 1 with matching activity and 25%/50%/25% distribution. Main search/status filters, V1 Viewer-only listing/Add options, Add role options, missing-level hyphens, menu options, Escape/focus and 390px layouts were checked. All screenshot content is synthetic, without passwords or setup/reset tokens.

- [Home desktop](ui-evidence/home-reference-desktop.png), [Home phone](ui-evidence/home-reference-phone.png)
- [Drawer desktop](ui-evidence/drawer-brand-expanded.png), [Drawer phone](ui-evidence/drawer-brand-phone.png)
- [User & Access desktop](ui-evidence/accounts-reference-desktop.png), [phone](ui-evidence/accounts-reference-phone.png)
- [Add Account desktop](ui-evidence/account-add-reference-desktop.png), [phone](ui-evidence/account-add-reference-phone.png), [V1 Viewer-only Add](ui-evidence/v1-admin-viewer-add.png)
- [Reset/Deactivate menu](ui-evidence/accounts-reset-deactivate-menu.png), [protected Main menu](ui-evidence/accounts-protected-menu.png)
- [XLSX inspection](ui-evidence/xlsx-inspection.png), [JPG preview](ui-evidence/dashboard-jpg-preview.png), [rendered PDF page two](ui-evidence/dashboard-pdf-second-page.png)

Remaining account/invitation migration and Power BI decisions are unchanged. This follow-up does not claim full goal completion or exhaustive accessibility/security UI verification.

## Requested repository destination — 2026-10-01

The owner initially requested that these existing changes first be published to `cddcloud/Office-Data-Manager`, followed by a new full-page Strategy/Policy Dashboard with a vertical 17-department menu linked to real File Manager folders. The original destination above remains historical. After the authorization failure below, the owner explicitly instructed that GitHub pushing be canceled and remaining changes continue. This removed the publication prerequisite; no additional GitHub push was made after that instruction.

Initially the requested private repository could not be resolved through Git or GitHub API by the signed-in `lwamkhaung1422002-wq` account. After the owner requested another check, GitHub returned the repository as public, with no existing branches and viewerPermission READ. `git push --dry-run https://github.com/cddcloud/Office-Data-Manager.git HEAD:refs/heads/codex/government-workflow` returned HTTP 403: permission denied to that account. This account still needs write authorization for publication. The scoped changes and report are prepared locally; successful publication is not claimed until a push is confirmed.

The restored account kebab was checked again in the isolated browser: all five synthetic Admin/invitation rows have a button, the active-account menu has precisely two usable items, ArrowDown reaches Deactivate, Escape closes the menu, and the protected Main account's two operations are disabled. An inherited danger-button margin was reset only within the account-menu popup to keep both items aligned. Final frontend tests again passed all 47 cases, production build passed, and diff whitespace validation passed.

## Full-page Strategy/Policy and real department folders — 2026-10-01

The owner confirmed that the 17 department entries must open real File Manager folders and their JPG/PDF files. Selecting main slot 1 now opens `StrategyDashboard.jsx` as a full-page Dashboard view, retaining the shared white identity/notification/Logout header and authorized global search. The blue title bar contains a left Back arrow. The classification headings and gray explanatory blocks from the supplied sketch are absent. Two blue cards remain: the Strategy/Policy card shows ဆောင်ရွက်ဆဲ on hover/focus/click, and the adjacent ministry card opens a single vertical department menu on mouse hover or click. Keyboard ArrowDown opens it; arrows, Home/End and Escape navigate/close it. Menu height follows available viewport space, with an internal scrollbar.

The existing tree and document APIs supply folder identities, current names and files. Selecting a department uses its actual category ID and includes authorized nested folder files; paginated file loading, private PDF/JPG previews and authorized downloads are reused. Switching folders clears the previous file display immediately. Back returns from department files to the strategy menu, then to the six main tabs. Empty/loading/error states remain visible. Restricted departments are omitted by the server rather than shown as locked placeholders; there are no fake file cards or operational counts.

Live read-only inventory initially confirmed slot 1 had no children or documents. Explicit `setup-strategy-departments.js` then created 17 empty child folders named ဌာန ၁–၁၇, ordered numerically, under that existing root. They inherit its V4 classification and receive normal creation audit entries. Six root identities and existing account identities remain intact. A second setup run returned created 0 / departmentFolders 17. No production sample file was uploaded. The helper is Main-only, transactional, reuses the ordered folder identities after rename, and rejects unexpected existing children instead of guessing a mapping. Dashboard reads do not provision folders. Deployment instructions document this setup.

New real PostgreSQL suite `strategy-departments.integration.test.js` ran four passing cases against `office_workflow_verify_strategy_20261001`: atomic 17-folder creation/audit/root preservation, idempotence after rename and non-Main denial, restricted department omission plus nested branch document filtering, and unchanged data on an unexpected mapping conflict. Latest API verify passed lint, typecheck, build, schema validation and 60 default tests, with 19 default skips (13 government database cases previously verified, these 4 strategy cases verified separately, and 2 legacy E2E cases still unrun). Frontend tests passed all 47 cases; configured typecheck and production build passed.

Actual isolated UI checks used temporary ports 3101/5174 and synthetic Main/Admin/Viewer accounts. Main saw 17 entries, all with the same horizontal position in one column. Native mouse movement opened the department menu and the ongoing status without clicking. Keyboard End reached department 17 and Escape restored trigger focus. Department 2 displayed only its two actual fixtures: a valid two-page PDF and a 720×360 JPG; both previewed, and PDF page 2 rendered. Department 17 showed the empty state. Back returned to the six tabs. The 390px phone page had no horizontal overflow. Viewer V2 saw 16 entries with restricted department 1 absent, read department 2's files within Dashboard, and received a management-page denial on a direct URL. Retained search returned zero matches for the restricted fixture. User & Access's visible kebab again contained only Reset Login and Deactivate. Evidence is synthetic and contains no production file data or credentials.

- [Final desktop department menu](ui-evidence/strategy-departments-desktop.png), [phone](ui-evidence/strategy-departments-phone.png)
- [Ongoing hover](ui-evidence/strategy-ongoing-desktop.png), [department files](ui-evidence/strategy-department-files.png)
- [PDF page two](ui-evidence/strategy-pdf-preview.png), [Viewer file view](ui-evidence/strategy-viewer-files.png), [account kebab](ui-evidence/strategy-account-kebab.png)

GitHub publication was canceled by the owner. Legacy Viewer/invitation mapping, deferred Power BI and the broader verification limitations above remain unresolved; this delivery does not claim full goal completion.
