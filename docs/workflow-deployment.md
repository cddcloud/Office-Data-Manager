# Government workflow deployment

For installations retaining legacy content, deployment requires approved legacy classifications and root mappings. Do not invent mappings as a workaround for sign-in. The compatibility authentication path accepts existing passwords while content remains closed until the schema/account mapping is ready.

## Owner-approved live reset on 2026-10-01

The owner explicitly requested permanent removal of all five old folders and their contents. This superseded the earlier root/content preservation decision for those objects. After stopping the identified API writers, a custom PostgreSQL backup and all 9 private files were saved outside Git, restored into `office_workflow_backup_verify_20261001` and verified against counts and file hashes. The reset and migrations were rehearsed on that copy, then applied to the live database using `reset-legacy-content.js` and a private explicit plan. Users, invitations, original audit history and Main Admin identity/password were preserved. Six approved roots now exist; Main's existing identity was mapped to V1 with session revocation and an audit entry.

Recovery backup: `C:\Users\LwamKhaung\.codex\visualizations\2026\10\01\01a0f6b0-f221-7f82-a8fa-aa2f94df26d5\before-owner-reset-20261001`. Contains sensitive database/private-file/environment recovery material; do not publish it. The reset CLI refuses mapped workflow roots and is not a new normal root-deletion capability. Existing automatic retention/purge policy is unchanged.

At that stage one legacy Viewer and five invitations remained unmapped. The owner's later explicit demo-cleanup instruction removed all of these non-Main entries; see the latest cleanup below. No arbitrary clearance was assigned. The general retained-data procedure below applies to any future restoration/migration of legacy objects; do not rerun the reset against the protected six roots.

## Current inventory and required decisions

Read-only inventory on 2026-10-01 found 2 users, 5 invitations, 11 categories (5 roots), 5 collections, 15,093 records, 2 documents, 7 import jobs and 18 dashboard widgets. The private inventory is outside Git at:

`C:\Users\LwamKhaung\.codex\visualizations\2026\10\01\01a0f6b0-f221-7f82-a8fa-aa2f94df26d5\workflow-migration-inventory.json`

The inventory contains IDs and classification/relationship fields, without emails, passwords, token hashes, file names or record payloads. Treat IDs and relationship inventories as internal operational information. Re-export before deployment because the current application can still write new content.

For a retained-data migration, the owner must approve:

- Each existing User and AccountInvite ID: role ADMIN or VIEWER and clearance V1–V4. Admins may be V1–V3; preserve the existing primary administrator as ADMIN/V1.
- Every existing Category, DataCollection, DataRecord, Document, ImportJob and DashboardWidget ID: content level V1–V4. Legacy NORMAL/VIP/ADMIN labels are not automatically converted.
- Each of the five existing root Category IDs: a unique mainSlot 1–6. Their contents and IDs stay attached. The missing slot gets a new empty root. No arbitrary move, flattening or root deletion is performed.

The approved six names, in slot order, are:

1. မဟာဗျူဟာနှင့် မူဝါဒ
2. ဖွဲ့စည်းပုံနှင့်အင်အား
3. ဘဏ္ဍာရေး
4. ဝန်ကြီးဌာနများ ကော်မတီ၊ကော်မရှင်များ
5. မဟာမိတ်စုဖွဲ့မှု
6. ဖက်ဒရယ်ယူနစ်ဆိုင်ရာ

Name approval alone does not establish an existing ID-to-slot mapping. In the live reset, the old roots were removed by explicit owner instruction, so six new stable roots use these names. At an initial retained-data mapping the approved slot name replaces the legacy root name; subsequent Main Admin renames are preserved. The owner will create Admin V1/V2/V3 accounts through User & Access invitations; their names/emails are not a prerequisite for preparing this code.

## Mapping tool

Run from `api` with the intended connection supplied through the existing environment configuration. Never print the connection URL or credentials. The inventory command works before and after the workflow schema migrations.

```powershell
node server/scripts/workflow-mapping.js > C:\private\inventory.json
node server/scripts/workflow-mapping.js C:\private\approved-mapping.json
```

The second command is a dry run. It rejects missing IDs, unknown IDs, invalid role/clearance pairs, attempts to change the Main Admin identity, duplicate root slots and child-to-root conversion. A mapping has table names at its top level and an object keyed by the existing IDs under each table. Example structure, using fictitious IDs:

```json
{
  "User": { "existing-main-id": { "role": "ADMIN", "clearance": "V1" } },
  "AccountInvite": {},
  "Category": { "existing-root-id": { "accessLevel": "V4", "mainSlot": 1 } },
  "DataCollection": {},
  "DataRecord": {},
  "Document": {},
  "ImportJob": {},
  "DashboardWidget": {}
}
```

This example is deliberately incomplete and cannot be applied to the populated installation. Every inventoried ID requires an approved entry. Mapping source workbooks must account for their highest-sensitivity rows; source downloads also recheck all associated rows at request time.

## Deployment order

1. Obtain the mapping approval and review the complete dry run against a restored staging copy. Keep approval and the mapping file outside the public repository.
2. Establish a maintenance window and stop every writer, API instance, worker and scheduled purge. Keep access to content closed during the schema/mapping transition.
3. Make a PostgreSQL custom-format backup using `pg_dump -Fc`, plus a consistent backup of private file storage, environment configuration and deployment revision. Verify restore into a separate database and verify stored-file retrieval. Use secure backup permissions and record backup identifiers without secrets.
4. Install the locked API/app dependencies with `npm ci`. Generate the Prisma client while API processes are stopped so Windows engine files are not locked. Run `npm run prisma:generate` in `api`.
5. Run `npm run prisma:migrate` in `api`. The enum addition is a separate migration before use of its new values. The workflow migration leaves populated legacy classifications unmapped. The subsequent name migration only renames deterministic new-install roots still bearing temporary names.
6. Re-export the inventory under maintenance, review any changes from the approved inventory and rerun the dry run. Resolve all new/unmapped entries before continuing.
7. Only with approved mapping and a verified backup, apply:

   ```powershell
   node server/scripts/workflow-mapping.js C:\private\approved-mapping.json --apply
   ```

   Application takes table locks, revalidates the complete inventory, updates mappings in one transaction, preserves the protected primary identity and existing content IDs, creates missing root slots, increments user permission versions and revokes refresh sessions. It does not rewrite file storage or record payloads.
8. Run the API verification, app checks and role/clearance smoke checks against staging. Confirm six roots, invitation/reset behavior, authorized source retrieval, notifications and current-session revocation. Build the frontend and API, then start the intended deployment.
9. Require a new sign-in after mapping. Main Admin can invite the requested Admin V1/V2/V3 accounts through User & Access. Recipients set their own passwords through expiring single-use links.

For an empty installation, migrate first, then use `npm run admin:create` with a supplied ADMIN_EMAIL and ADMIN_PASSWORD for the initial Main Admin. The script requires a password of at least 12 characters. It never resets an existing primary administrator, grants a second primary identity or silently claims a populated installation. All subsequent account creation uses invitations.

## Rollback and operational limitations

Stop writers before rollback. Restore the verified database backup and matching private storage, and deploy the matching previous application/client revision. An application-only rollback is insufficient after enum, classification or root-identity changes. There is no automatic reverse mapping to NORMAL/VIP/ADMIN, and destructive enum removal is not provided.

Retain audit history and backup evidence. Existing retention/purge behavior remains unchanged; this implementation adds no new government retention policy. Power BI hosting, licensing and classified-data handling remain deferred. Do not use Publish to web or introduce a cloud transfer.

The two workflow verification databases contain synthetic data. A third private verification database restored the real backup to rehearse the authorized reset; treat it as sensitive and internal. The temporary synthetic UI server on 3101/5174 was stopped before live migration. Normal development was restarted on 3001/5173. Main credentials were neither reset nor exposed.

## Strategy/Policy department setup

The latest owner-approved layout supersedes the initial direct 17-department setup. Run `node server/scripts/setup-strategy-classifications.js` from `api`. Under main slot 1 it creates four ordinary parent folders: ထိပ်တန်းလျှို့ဝှက် (V1), လျှို့ဝှက် (V2), ကန့်သတ် (V3), and အများပြည်သူ (V4). Each contains two ordered card folders: the policy folder and the ministry policy folder. The ministry folder contains 17 ordered departments. Dashboard renders the names of these actual card folders, appending their parent's current name in parentheses. There is no extra classification card. V4 still requires authentication; the folder's display name does not enable anonymous access.

Setup runs in one transaction with a root-row lock. A complete existing hierarchy is reused, including renamed folders. The previously provisioned 17 empty V4 departments may be moved under the V4 ministry folder while preserving their IDs and classifications; every move is audited. Populated, classified differently, archived or unexpectedly arranged old folders cause a mapping error before any mutation. Setup never guesses a content classification or creates additional roots. The original `setup-strategy-departments.js` is for the earlier direct-department layout and must not be rerun on the new hierarchy.

For the latest approved Structure/Strength page, run `node server/scripts/setup-structure-departments.js`. Under main slot 2 it provisions 17 departments, 17 team folders per department, and two leaf tabs per team (884 child folders total). It also supports upgrading a complete 17-by-17 hierarchy by adding its 578 missing leaf folders. New folders inherit their parent's classification and have numeric ordering and creation audits. A root-row lock prevents duplicate concurrent setup; renamed ordered identities are preserved. Mixed or unexpected partial leaf structures require an explicit mapping. Dashboard renders a 25% / 25% / 50% desktop card row, with an ongoing card and ongoing status for leaf tabs as requested.

The owner explicitly reduced the previous 20 teams to 17. For that complete earlier 17-by-20-by-2 structure only, `node server/scripts/setup-structure-departments.js --reduce-teams-to-17` removes teams 18–20 and their two tabs (153 folders). It first checks all excess folders, including archived content, for records, documents, collections, imports, unexpected children or changed generated names/descriptions. Any conflict aborts the transaction without removing anything. Only empty generated folders are removed; the first 17 teams, department IDs, their data and existing audits are retained. Each removal gets a CATEGORY_PURGED audit with the approved reason. This explicit reconciliation does not change scheduled retention/purge policy. Back up before reconciliation; removed empty folders require backup restoration to recover their original IDs.

Both Strategy and Structure menus omit visible column titles. Structure initially displays only departments. Department hover/click reveals its teams; team activation reveals its two tabs. Selecting another parent discards deeper selections. Keyboard focus alone does not expand a branch. ArrowRight enters a branch, ArrowLeft returns, and Escape closes with trigger focus restored. Small screens show one step with a Back button. Menus choose above/below placement based on available space and scroll within their viewport bounds.

Both operations are explicit Main-only provisioning. Reads never create folders. Re-running either complete setup returns created 0. Folder management, authorized omission, private PDF/JPG preview and file pagination continue to use the existing APIs and persisted identities. No new production users, passwords or sample files are created.

## Latest demo-account cleanup and cloud preparation

The owner explicitly approved removal of every non-Main entry in User & Access. A read-only ownership check found no folders, documents, collections, records, imports or widgets owned by the one non-Main user. Before removal, users, invitations, associated sessions/reset tokens and relevant audit/read state were encrypted with Windows DPAPI and saved outside the repository at `%LOCALAPPDATA%\OfficeDataManager\private-backups\demo-accounts-20261001.dpapi`. Keep that recovery material private; recovery requires the same Windows user or its protected recovery environment.

A locked transaction checked the approved identities/counts again, added safe removal audits, then removed one non-Main user and five invitations. Its related sessions/reset tokens were revoked. Final live verification found one account row, the protected Main Admin, and zero invitations. Main's ID, role, clearance and password hash were compared in memory and preserved. The six main roots are unchanged. This was a one-time owner-requested cleanup, not a new account-deletion endpoint or a change to normal retention policy.

The demo Dashboard route remains available to authorized roles; its drawer entry was removed. File Manager and Data now have a Collapse all folders button that changes expansion only. The other four main Dashboard tabs show ဆောင်ရွက်ဆဲ on hover/focus/click, while Strategy and Structure retain their folder-backed views.

For the prepared Netlify frontend, Railway API and Supabase database configuration, follow [cloud deployment](cloud-deployment.md). The repository includes deployment files and validated local builds, but no real cloud connection, container build or cloud smoke check is claimed. Use a consistent current database/private-file backup for the actual transfer; the older pre-reset backup represents an earlier state.
