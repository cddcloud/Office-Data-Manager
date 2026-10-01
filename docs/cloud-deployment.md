# Netlify, Railway and Supabase

The prepared topology is Netlify for the React app, Railway for the Express API, and Supabase Postgres for the database. Existing API authorization, passwords, invitations and private downloads remain in Express. Supabase Auth is not used. These files prepare deployment; no cloud environment has been deployed or connected yet.

## Railway API

Connect `cddcloud/Office-Data-Manager` and the published branch. Keep Railway's root directory at the repository root and its config path `/railway.json`. The config selects `api/Dockerfile`, applies committed Prisma migrations before startup, and checks `/api/ready`. The image generates its own Linux Prisma client with Node 24 and OpenSSL; local Windows dependencies are excluded. The build-only database URI is a dummy value and does not connect to a database.

Set these service variables in Railway, using actual values:

| Variable | Value / purpose |
| --- | --- |
| `DATABASE_URL` | Supabase session-mode connection URI, port 5432, with `sslmode=require`; keep secret |
| `JWT_SECRET` | A long random secret, minimum 24 characters; keep secret and stable across restarts |
| `NODE_ENV` | `production` (also supplied by the image) |
| `CORS_ORIGINS` | The exact Netlify HTTPS site origin, no path or trailing slash; comma-separated if explicitly needed |
| `APP_BASE_URL` | The Netlify HTTPS site origin, used for setup/reset links |
| `TRUST_PROXY_HOPS` | `1` for the Railway edge (image default); verify proxy headers in the deployed topology |
| `STORAGE_DRIVER` | `local` for the volume configuration below, or existing private `s3` storage |
| `STORAGE_LOCAL_DIR` | `/data/storage` for the volume configuration |

Railway supplies `PORT`; production uses it before the `API_PORT` fallback. Local development continues using `API_PORT`, so an unrelated inherited `PORT` cannot move the local API away from Vite's proxy. The server binds to `0.0.0.0`. Do not publish `.env` files or set database/JWT/storage credentials in Netlify client variables.

With local storage, attach a Railway volume mounted at `/data` before starting the service. Keep one API replica when using this volume. Railway mounts volumes only at runtime, so pre-deploy migration does not use private storage. Startup refuses Railway local storage outside its mounted persistent volume. Existing private file paths/keys must be transferred consistently with any database restore; a database backup alone does not contain PDF/JPG/Excel bytes. Existing S3 storage is supported by the current `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` configuration; it must remain private.

Configuration follows [Railway config as code](https://docs.railway.com/config-as-code/reference), [healthchecks](https://docs.railway.com/deployments/healthchecks) and [persistent volumes](https://docs.railway.com/volumes). Volume-backed redeployments can have downtime. No scheduled purge or retention policy is changed.

## Supabase database

Use a dedicated production database/project. This project uses Prisma 6; keep the committed schema/client/migrations rather than copying Prisma 7 setup examples. For this long-running API, copy the session-mode URI from Supabase Connect (port 5432) or its direct connection URI if the deployment has compatible network access. Both support the migration workflow. Add `sslmode=require`. Do not use the transaction pooler on port 6543 for the prepared migration command. See [Supabase Prisma connection guidance](https://supabase.com/docs/guides/database/prisma).

Use this database through Express only. Disable Supabase's Data API for this Prisma-only project before loading protected content; the official guide recommends this topology. Do not expose the application's public-schema tables through anonymous or authenticated Supabase REST access, which would bypass Express's clearance checks. No Supabase API/service-role key belongs in the frontend.

For a new empty installation, migrations create six protected root folders but no demo users or content. Create the first Main Admin once with the existing `npm run admin:create` command and supplied `ADMIN_EMAIL`, `ADMIN_PASSWORD` (minimum 12 characters) and optional `ADMIN_NAME`, then remove those bootstrap variables. Main creates later accounts through User & Access. Run `setup-strategy-classifications.js` and `setup-structure-departments.js` once using that existing Main identity for the folder layout. Their normal reruns are idempotent. None of these account/folder scripts runs automatically on every deploy.

For the existing installation, preserve its Main identity, password, folder IDs, audits and private files through the backup/restore procedure in [workflow deployment](workflow-deployment.md). Do not create a replacement Main Admin or run destructive database reset / `db push --force-reset`. The owner-approved local demo cleanup removed the sole non-Main legacy account and five invitations; it did not assign invented clearances or change Main credentials.

## Netlify frontend

Import the same repository/branch. Root `netlify.toml` sets base `app`, publish directory `dist`, Node 24 and `npm run build:netlify`. In Netlify's build environment set:

```text
NETLIFY_API_ORIGIN=https://YOUR-ACTUAL-RAILWAY-SERVICE.up.railway.app
VITE_API_URL=/api
```

The Railway origin is a public service address, not a secret. Replace the placeholder with the generated HTTPS origin, without `/api`, credentials, query parameters or fragments. `VITE_API_URL` may also be unset. Build refuses missing/invalid proxy destinations or a cross-origin `VITE_API_URL`.

The build writes `dist/_redirects`, putting the `/api/*` proxy ahead of the SPA fallback. Login, refresh cookies, account links, document downloads and notification requests use the same browser origin. This keeps the existing Secure/HttpOnly/SameSite=Lax refresh-cookie policy. Netlify proxies are described in [Netlify rewrites and proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/). Notifications retain their existing reconnect and 20-second polling fallback if an intermediary ends the SSE stream.

## Verify after deployment

1. Confirm Railway pre-deploy migrations and `/api/ready` succeed, then verify the Netlify site's `/api/ready` proxy and direct refresh of `/dashboard`, `/manage/categories`, `/account/setup` and `/account/reset`.
2. Sign in as the retained Main Admin, refresh the page and sign out. Test invitation/reset links, cookie refresh after access-token expiry, and Viewer management-page denial.
3. Upload one approved PDF/JPG and one Excel file, check private previews/downloads and notifications, then redeploy Railway and verify those files persist.
4. Verify current V1–V4 omission and direct-ID access checks on the actual cloud environment. Do not use production classified files for an initial unverified cloud smoke test.

Local builds/tests and routing generation can be verified without cloud credentials. Docker build, real Netlify proxy/cookies/SSE, Railway volume persistence and Supabase connectivity still need the real service settings and a deployed smoke check. Docker is unavailable in the current Windows workspace; no container or cloud deployment success is claimed.
