# PA2 Test Report

Crispen Chachengwa · COP 5818

Testing completed October 31, 2026. Five validation tests and 98 explicit integration checks plus equality assertions passed using Node.js 24.22.1, real HTTP, SQLite and a jsdom frontend harness. The user also ran the included Playwright evidence script successfully on Windows. The five resulting browser screenshots and browser-results.json were supplied and reviewed. These browser checks supplement the API/DOM checks; not every scenario was manually repeated in a browser.

| Check | Status | Observed result |
| --- | --- | --- |
| 1 | Pass | Two fictional users registered; duplicate normalized email 409; invalid email/password 400; registration did not log in; incorrect login generic 401. |
| 2 | Pass | Unauthenticated reads and valid-token mutation 401; missing/wrong CSRF 403 before and after login; incorrect Origin 403; no mutation. |
| 3 | Pass | DOM form submission through real HTTP created two purchases and displayed $146.50. |
| 4 | Pass | Reload restored live session; server process restart lost session, then login restored both SQLite purchases and $146.50. Browser screenshots before and after restart both show two purchases and $146.50. |
| 5 | Pass | DOM edit changed quantity to 4 and total to $162.00; delete left one purchase and $62.00. |
| 6 | Pass | B saw zero A records; direct PUT/DELETE of A returned 404; injected ownerId/id/costCents ignored and A record unchanged. Browser screenshots show A with two records and B with zero; browser-results.json confirms PUT/DELETE 404 and unchanged owner records. |
| 7 | Pass | Invalid POST/PUT types and bounds, non-object bodies, and invalid IDs returned 400; missing record 404; no stored changes. |
| 8 | Pass | DOM rendering preserved literal &lt;b&gt;Example&lt;/b&gt; with no b element. Repeated names produced separate records. |
| 9 | Pass | Stopped-server DOM save showed connection error, retained inputs and restored button. Cancel and invalid precision made no mutation. Inspect history before retrying an uncertain save. |
| 10 | Pass | Malformed JSON returned JSON 400; unknown API route returned JSON 404; Argon2id hashes verified; logout cleared private DOM and totals. ZIP exclusions verified separately. |

## Reviewed browser evidence

The successful Windows evidence run used temporary fictional accounts and a temporary SQLite database. The following images were visually reviewed:

| File | Evidence |
| --- | --- |
| persistence-before-restart.png | User A, two purchases, total $146.50 before restart. |
| persistence-after-restart.png | User A, same purchases and total after server restart and login. |
| ownership-user-a.png | User A can view their fund and stock purchases. |
| ownership-user-b.png | User B has zero purchases and a $0.00 total. |
| mobile-layout.png | Narrow layout stacks account, summary, form and history with readable text and controls. |

browser-results.json reports unowned PUT = 404, unowned DELETE = 404, ownerRecordsUnchanged = true, User A count = 2, User B count = 0, persistence total = $146.50. The successful capture script also checks that the mobile document width does not exceed the viewport. The screenshots contain fictional emails, without passwords, cookies or CSRF tokens.

## Repeatable tests

```sh
npm ci
npm test
npm run test:integration
npx playwright install chromium
npm run evidence
```

Use Node.js 24.15.0 or later within the 24.x line for the supplied test dependencies. The original automated checks used 24.22.1. The integration suite uses an isolated temporary database on port 3197; the browser evidence script uses port 3198. Neither deletes your application database.

## Additional observations

- Registration stores Argon2id hashes, does not automatically log in, and rejects duplicate normalized emails.
- Login regenerates the session; the client refreshes its CSRF token. Logout clears private history and totals.
- Cancel edit and a price with three decimal places caused no mutation.
- A stopped-server save retained inputs, displayed connection feedback, and restored the button. A connection loss after a server commit can have an uncertain outcome; inspect history before retrying.
- Repeated names are separate purchases, and markup-like names display as literal text.
- A fresh installation recreated zero users, zero purchases and the Fund, Stock and Other categories; see fresh-install.txt.
- The final submission contains source, lockfile, setup files, explanations, five screenshots, observed test results and actual local Git history. It excludes .env, node_modules, .git, databases and unrelated local files.

## Scope of evidence

API and DOM coverage is documented in integration-results.json. Browser ownership, restart persistence and mobile layout coverage is documented by the supplied screenshots and browser-results.json. No claim is made that all ten scenarios were independently manually tested in a browser.
