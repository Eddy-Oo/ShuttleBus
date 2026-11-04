# Connect ShuttleTrack backend to Neon

The API uses Prisma with PostgreSQL. Neon works as the hosted database; the browser and Flutter app must call the ShuttleTrack API, not Neon directly.

## 1. Create a Neon database

1. Create a project in the Neon Console.
2. Open **Connect** and select the database, branch, and role.
3. Copy two connection strings:
   - **Pooled** connection string (hostname contains `-pooler`) for `DATABASE_URL`.
   - **Direct** connection string (hostname does not contain `-pooler`) for `DIRECT_URL`.
4. Keep both strings private. Do not commit them to GitHub or put them in frontend `VITE_*` variables.

Both strings should use TLS. Neon normally supplies `sslmode=require`. Keep the query parameters provided by Neon; add `&schema=public` only if the URL does not already specify a schema.

## 2. Configure the backend locally

From the repository root:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and replace the local database values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@YOUR-NEON-POOLER-HOST/DBNAME?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/DBNAME?sslmode=require"
JWT_SECRET="replace-with-a-random-secret-at-least-32-characters"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="use-a-strong-password-at-least-12-characters"
```

Use the exact Neon host, database, role and password from the Neon Console. If the supplied URLs contain additional query parameters, preserve them. Do not put angle-bracket placeholders in the real .env file.

## 3. Install and apply the database schema

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

- `db:generate` generates Prisma Client.
- `db:deploy` applies the committed Prisma migrations using `DIRECT_URL`.
- `db:seed` creates the initial admin and sample routes, stops and vehicles.

Do not run `npm run db:up` when using Neon; that command starts the local Docker PostgreSQL database instead.

## 4. Start and check the API

```bash
npm run dev:api
```

Open:

- `http://localhost:3000/health`
- `http://localhost:3000/api/routes`

The health endpoint should report both API and database status as healthy. If the API fails to start, check the terminal output and verify both Neon URLs, password encoding, database access and TLS query parameters.

## 5. Deploying the API with Neon

In the hosting provider's backend service settings, configure:

- `DATABASE_URL`: Neon pooled connection string.
- `DIRECT_URL`: Neon direct connection string.
- `JWT_SECRET`: private random value, at least 32 characters.
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: initial admin credentials.
- `CORS_ORIGINS`: exact deployed frontend origin.

Then deploy with the repository's build and migration commands:

```bash
npm ci
npm run build:api
npm run db:deploy
npm run seed:admin --workspace @shuttletrack/backend
npm run start:api
```

If you use the included Render Blueprint as written, it provisions Render PostgreSQL and sets both database variables to that database. To use Neon instead, change the API service's `DATABASE_URL` and `DIRECT_URL` environment values in Render to the two Neon strings after creating the service. Do not overwrite these secrets in GitHub.

## 6. Common errors

| Error | What to check |
|---|---|
| Prisma P1000 authentication failed | Username/password, correct Neon project/branch, URL-encode special password characters |
| P1001 can't reach database | Hostname, internet access, Neon project/branch availability |
| Migration connection errors | Use the direct (non-pooler) URL for `DIRECT_URL` |
| SSL/TLS error | Keep `sslmode=require` from the Neon connection string |
| API health reports database down | Check backend service logs and both environment variables |
| Frontend fetch fails | Check API URL and CORS; frontend must call the deployed API |

Never share a connection string or password in chat, screenshots, source code, or a public GitHub commit. If a credential was exposed, rotate it in Neon.
