# Government workflow deployment

For installations retaining legacy content, deployment requires approved legacy classifications and root mappings. Do not invent mappings as a workaround for sign-in. The compatibility authentication path accepts existing passwords while content remains closed until the schema/account mapping is ready.

## Owner-approved live reset on 2026-10-01

The owner explicitly requested permanent removal of all five old folders and their contents. This superseded the earlier root/content preservation decision for those objects. After stopping the identified API writers, a custom PostgreSQL backup and all 9 private files were saved outside Git, restored into `office_workflow_backup_verify_20261001` and verified against counts and file hashes. The reset and migrations were rehearsed on that copy, then applied to the live database using `reset-legacy-content.js` and a private explicit plan. Users, invitations, original audit history and Main Admin identity/password were preserved. Six approved roots now exist; Main's existing identity was mapped to V1 with session revocation and an audit entry.

Recovery backup: `C:\Users\LwamKhaung\.codex\visualizations\2026\10\01\01a0f6b0-f221-7f82-a8fa-aa2f94df26d5\before-owner-reset-20261001`. Contains sensitive database/private-file/environment recovery material; do not publish it. The reset CLI refuses mapped workflow roots and is not a new normal root-deletion capability. Existing automatic retention/purge policy is unchanged.

One legacy Viewer and five invitations remain unmapped. They were not arbitrarily assigned new clearance. The general retained-data procedure below applies to any future restoration/migration of legacy objects; do not rerun the reset against the protected six roots.

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

After the protected six roots and existing Main Admin are ready, run `node server/scripts/setup-strategy-departments.js` from `api` to create the requested 17 department child folders under main slot 1. This is explicit setup; Dashboard reads never create folders. New folders inherit the root's classification and receive numeric ordering and normal creation audit entries. The setup runs in one transaction, reuses an existing complete ordered set (including renamed folders), and refuses to guess a mapping for an unexpected child structure. It does not replace any existing content or create extra root folders. Dashboard uses the ordinary authorized category tree and document APIs; menu labels follow current folder names and file previews remain private.
