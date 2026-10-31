# Investment Purchase Tracker — PA2

Crispen Chachengwa · COP 5818

A local classroom application for fictional investment purchases. The purple PA1 header, summary cards, form, purchase history, and responsive layout are retained. PA2 adds Express, SQLite, user accounts, categories, editing and deletion. This records purchase costs, not current market prices or returns.

## Install and run

Tested with Node.js 24.22.1 and npm 11.9.0. Use Node.js 24.15.0 or later within the 24.x line; native modules and test dependencies must support your Node version.

1. Extract this ZIP and open a terminal inside the project folder containing package.json.
2. Run `npm ci` to install the versions in package-lock.json.
3. Copy `.env.example` to `.env` (`copy .env.example .env` in Windows Command Prompt, or `cp .env.example .env` on macOS/Linux).
4. Run `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Paste the generated value into SESSION_SECRET in your local .env, replacing the placeholder. Do not submit this secret.
5. Run `npm start` and visit **http://localhost:3000**. Keep this exact hostname; APP_ORIGIN must match the browser origin.
6. Register a fictional account with an 8–128 character password. Registration does not log you in; enter the password again and click Log in.
7. Add purchases, choose a category, and use Edit / Save changes or Delete. Cancel edit makes no request. Log out when finished.

Run `npm test` for the validation tests and `npm run test:integration` for isolated HTTP/DOM checks. To capture required real-browser screenshots on your PC, run `npx playwright install chromium` then `npm run evidence`; review the output. The submitted evidence has already been captured and reviewed. Run the steps in test-report.md to check API and browser behavior. Stop the server with Ctrl+C. The database is created automatically on startup with Fund, Stock, and Other categories; no purchases or users are bundled.

Do not open public/index.html directly. It needs the Express server. If you change the port, change both PORT and APP_ORIGIN in .env. Never use real financial records or credentials.

## One Add Purchase request, end to end

A browser submit event prevents navigation. JavaScript checks the four fields, converts a valid dollar price to integer cents, and calls the shared api helper. JSON.stringify serializes the request. Fetch sends POST /api/purchases with JSON, the same-origin session cookie, and X-CSRF-Token. Express parses JSON, runs the supplied session and CSRF middleware, and requireAuth checks login. The route validates the JSON types, bounds, and category against SQLite. A parameterized INSERT binds the session user ID and validated fields; the browser cannot choose an owner. A JOIN reads back the complete new record and computes quantity × unit_price_cents. Express returns JSON with HTTP 201. The browser checks response.ok, reloads GET /api/purchases, and rebuilds history, count, and total from the authoritative response.

Node.js is the runtime that executes server.js. npm installs dependencies and runs package scripts. package-lock.json records the resolved dependency tree, so npm ci can reproduce it. Async/await suspends the current async function while its promise is pending; it does not make the entire server synchronous. Argon2 hashing and verification are awaited. better-sqlite3 queries themselves run synchronously, which is acceptable for this small local exercise.

## Relational design

- `purchases.id` is a primary key identifying one purchase. Duplicate investment names remain separate records.
- `purchases.owner_id` is a foreign key referencing `users.id`.
- `purchases.category_id` is a foreign key referencing `categories.id`.
- The quantity CHECK requires SQLite integer storage and a value between 1 and 10,000; other CHECKs constrain name and cent price.
- Foreign keys are enabled. Categories and users exist independently of individual purchases. JOIN combines the category label with each purchase, while every record query filters by owner and lists records by ID ascending.

A document-style NoSQL design could put a purchase array inside each user's document or store separate purchase documents containing user and category IDs. Embedded purchases make a user's history convenient to read together, but a growing array complicates individual updates. Copying category names into documents duplicates labels and requires coordinated changes when a category is renamed. SQLite fits this application because foreign keys, constraints, JOINs, and small structured records provide a clear way to keep related data consistent.

## Security and API contract

Authentication answers who is logged in, using an Argon2id password hash and a session. Authorization answers which purchases that user may access. In the two-user test, User B can authenticate successfully but still receives 404 for PUT/DELETE of User A's purchase. Every read and mutation derives ownership from the session and parameterizes SQL; ownerId, id and costCents in the JSON body are ignored.

Client-side validation provides convenient feedback, but a caller can bypass the form. Server validation rejects invalid JSON types and bounds without mutation; SQLite adds foreign-key and CHECK constraints. Names are rendered with textContent rather than interpreted as HTML.

GET /api/csrf establishes the session token before a mutation. POST /api/login regenerates and saves the session, so the client discards the old token and fetches a new one. The supplied middleware checks tokens on registration, login, logout and purchase mutations, and checks Origin when present. Session cookies are httpOnly, SameSite=Lax, path=/ and expire after one hour. Logout destroys the session and clears its cookie. Local HTTP uses secure=false. HTTPS would require secure cookies; this project is not a deployment configuration. MemoryStore loses sessions after a restart; SQLite retains purchases.

| Route | Success |
| --- | --- |
| GET /api/health | 200 {ok:true} |
| GET /api/csrf | 200 {csrfToken} |
| POST /api/register | 201 {id,email}, no automatic login |
| POST /api/login | 200 {id,email} |
| GET /api/me | 200 {id,email} |
| POST /api/logout | 200 {ok:true} |
| GET /api/categories | 200 array of {id,name} |
| GET /api/purchases | 200 array of owned records |
| POST /api/purchases | 201 complete created record |
| PUT /api/purchases/:id | 200 complete updated record |
| DELETE /api/purchases/:id | 200 {ok:true} |

Purchase records contain id, name, quantity, unitPriceCents, categoryId, categoryName and costCents. Errors use {error:"message"}. Invalid fields, malformed JSON and invalid positive-integer route IDs return 400; missing login returns 401 after a valid mutation CSRF check; unowned/missing records return 404; duplicate registration returns 409. Security middleware rejects invalid CSRF or Origin with 403 before routes execute. Oversized bodies return 413. Unexpected errors return a generic 500 without stack traces.

## Error handling and limits

Fetch does not reject merely because an HTTP response is 400 or 500, so the client checks response.ok and preserves the server's error message. Network failures receive separate connection feedback. Pending buttons are disabled and restored in finally; failed inputs remain. A connection loss after a server commit can leave the client unsure whether the save happened. Inspect purchase history after reconnecting before retrying; this app does not promise exactly-once writes. If the server confirms a save but the following list refresh fails, the UI explicitly explains that state.

The application intentionally uses fictional data, local HTTP, in-memory sessions and the supplied basic security design. It has no JWTs, social login, reset flow, market-data feed, trading, or deployment.

## Git, evidence and assistance

`git-log.txt` records actual local development commits for setup/schema, backend CRUD/authentication, frontend integration, and security/testing/documentation. No public repository is required. The local commit email is a placeholder, not a verified contact address. `.git` is excluded from the ZIP as required.

The test report documents the automated API/DOM results and the successful Windows browser evidence run. Five reviewed screenshots and browser-results.json demonstrate ownership isolation, restart persistence, and the mobile layout. Evidence uses fictional accounts only. The ZIP excludes node_modules, .git, .env, SQLite databases/sidecars and real credentials. A fresh install creates an empty database and seeded categories.

AI assistance was used to implement, explain and test the changes to the supplied starter and PA1 design. Review the code and follow the instructor's academic-integrity and AI-disclosure rules before submitting; this note does not claim an independent student-only implementation.

## References

- Class PA2 assignment, supplied schema/security helper, and PA1 design.
- better-sqlite3 API: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- express-session: https://github.com/expressjs/session
- node-argon2: https://github.com/ranisalt/node-argon2
