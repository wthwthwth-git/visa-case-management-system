# Admin Auth Architecture

This document freezes the V1 Admin authentication architecture before implementation.

## 1. Strategy

V1 will use:

- Auth.js / NextAuth for Admin authentication.
- Admin session auth for back-office users.
- Portal token auth for customers.

Admin auth and Portal token auth are separate systems.

Rules:

- Admin users authenticate with a server-side session.
- Portal users do not register and do not log in.
- Portal access continues to use case-specific secure tokens.
- Admin session does not grant Portal token access.
- Portal token does not grant Admin access.
- `/api/admin/*` is protected by Admin session auth.
- `/api/portal/*` is protected by Portal token validation.
- Portal routes must not depend on Auth.js.
- Admin routes must not accept Portal tokens as authentication.

## 2. Auth.js Adapter Tables

V1 will use the Auth.js default adapter table strategy:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Important naming rule:

- `User` means Admin auth user.
- `Customer` means visa applicant/client.

These concepts must not be mixed.

Code and docs should use clear names:

- use `adminUser`, `adminId`, or `adminAuthUser` for Auth.js users.
- use `customer`, `customerId`, or `client` only for visa applicants.
- do not use `User` to mean a customer.

Prisma comments should explicitly state:

```text
User is the Auth.js Admin user model. It is not Customer.
Customer is the visa applicant/client model.
```

## 3. Admin User Fields

The Auth.js `User` model should include Admin-specific fields:

- `role`
- `status`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

V1 role strategy:

- only `admin` is active in V1.
- do not implement complex roles, teams, organizations, or multi-employee permission matrices in V1.

V1 status strategy:

- `active`
- `disabled`

Disabled Admin users must not be able to access Admin pages or Admin APIs.

## 4. AdminAuthAudit

V1 should add a business-owned auth audit table:

```text
AdminAuthAudit
```

It records security and access events, separate from case timeline events.

Recommended event types:

- `login_success`
- `login_failure`
- `logout`
- `session_expired`
- `csrf_failure`
- `rate_limit_triggered`
- `suspicious_admin_request`

Recommended result values:

- `success`
- `failure`
- `blocked`

Recommended fields:

- `id`
- `adminUserId`
- `email`
- `eventType`
- `result`
- `ipAddress`
- `userAgent`
- `requestPath`
- `method`
- `reason`
- `metadata`
- `createdAt`

Recommended indexes:

- `adminUserId + createdAt`
- `email + createdAt`
- `eventType + createdAt`
- `result + createdAt`
- `createdAt`

Retention:

- V1 may keep audit records indefinitely.
- Future production policy should define retention, for example 90-180 days or archive-based retention.

AdminAuthAudit must not store:

- password
- password hash
- session token
- CSRF token
- Portal token
- token hash
- signed URL
- raw `storagePath`
- raw `storageBucket`
- secrets
- raw cookies
- authorization header

## 5. requireAdminAuth Migration Strategy

The existing `requireAdminAuth(request)` entrypoint should remain.

Migration target:

- replace the placeholder implementation with real Auth.js session validation.
- keep Admin API routes calling `requireAdminAuth(request)`.
- return a stable Admin context.

Recommended return shape:

```ts
type AdminAuthContext = {
  adminId: string;
  email: string;
  role: "admin";
};
```

Rules:

- all `/api/admin/*` routes must continue route-level auth.
- route tests should keep verifying that Admin routes call `requireAdminAuth`.
- middleware must not replace route-level API auth.
- services must not perform session auth directly.

## 6. Middleware Strategy

Middleware improves user experience, but it is not the only security boundary.

Middleware should protect:

- `/admin/*`

Middleware behavior:

- unauthenticated Admin page request redirects to `/admin/login`.
- authenticated request to `/admin/login` redirects to `/admin/cases`.

API rules:

- `/api/admin/*` still requires route-level `requireAdminAuth`.
- `/api/portal/*` must not use Admin middleware.
- Portal token routes remain independent.

## 7. CSRF Strategy

CSRF protection is required for Admin mutations.

Protected Admin methods:

- `POST`
- `PATCH`
- `PUT`
- `DELETE`

Protected route family:

- `/api/admin/*`

CSRF does not apply to:

- `/api/portal/*`
- Portal token validation
- Portal uploads

Recommended strategy:

- double-submit CSRF token.
- Admin UI receives or reads a CSRF token.
- Admin mutation requests include:

```text
X-CSRF-Token
```

Recommended route order:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request, adminContext)`
3. call `adminServices`

Admin `GET` routes need session auth but do not need CSRF protection.

## 8. Deployment Requirements

Production requires:

- HTTPS.
- secure HTTP-only cookies.
- `NEXTAUTH_SECRET`.
- correct Auth.js URL/trusted host configuration.
- `TOKEN_HASH_SECRET`.
- Supabase database and storage environment variables.
- no real production database connected to preview deployments.
- provider secrets stored only in encrypted deployment environment variables.

Cookies in production must be:

- `httpOnly`
- `secure`
- `sameSite` configured intentionally
- scoped to the correct domain

Logs must not contain:

- session token
- CSRF token
- Portal token
- signed URL
- secrets
- raw cookies

## 9. Production Blockers

Current production blockers:

- production OAuth callback / secure cookie runtime verification is not complete.
- production Upstash-backed rate limit smoke verification is required.
- production deployment and rollback runbook still needs final confirmation.
- preview/staging/production database and storage isolation must be verified before public deployment.

## 10. Testing Strategy

Unit tests:

- valid Admin session passes `requireAdminAuth`.
- missing session fails.
- expired session fails.
- disabled Admin user fails.
- `requireAdminAuth` returns `adminId`, `email`, and `role`.
- CSRF guard accepts valid Admin mutation requests.
- CSRF guard rejects missing/mismatched token.
- CSRF guard does not affect Portal routes.
- AdminAuthAudit metadata guard rejects sensitive fields.

Route tests:

- all `/api/admin/*` routes call `requireAdminAuth`.
- Admin mutation routes call CSRF guard.
- service is not called when auth fails.
- service is not called when CSRF fails.
- auth/CSRF errors use safe responses.

Middleware tests:

- unauthenticated `/admin/*` redirects to `/admin/login`.
- authenticated `/admin/login` redirects to `/admin/cases`.
- `/api/portal/*` is unaffected.

Integration tests:

- login creates session.
- logout clears session.
- disabled user cannot access Admin.
- session expiration blocks Admin pages and APIs.
- audit events are written for login success/failure/logout/session expiration/CSRF failure.

## 11. Risks

- `User` may be confused with `Customer`.
- Admin session and Portal token concepts may be mixed.
- pages may be protected while APIs remain unprotected.
- middleware may be mistaken as sufficient API security.
- CSRF may be skipped after cookie sessions are added.
- audit metadata may accidentally store session token, Portal token, or signed URL.
- preview deployments may connect to production database.
- role field may expand into multi-employee permissions before V1 scope changes are documented.

## 12. Phase 8-3C Implementation Status

Initial Admin auth is implemented:

- Google OAuth through NextAuth/Auth.js.
- Prisma adapter with database sessions.
- `/api/auth/[...nextauth]`.
- `/admin/login`.
- `/admin/*` middleware redirect for unauthenticated UI access.
- route-level `requireAdminAuth(request)` backed by real session validation.
- `ADMIN_EMAIL_ALLOWLIST` enforcement.
- disabled `User.status` blocks API access.
- Admin shell displays the signed-in admin email and provides logout.
- minimal `AdminAuthAudit` writes for `login_success`, `login_failure`, and `logout`.

The Portal token architecture is unchanged.

Middleware remains UX-only:

- it checks for a NextAuth session cookie and redirects to `/admin/login` when missing.
- it does not validate the database session.
- `/api/admin/*` routes must continue calling `requireAdminAuth`.

Implemented after this phase:

- CSRF protection for Admin mutations.
- route-level rate limiting with memory and Upstash backends.
- Auth audit writes for login/logout, CSRF failures, and rate-limit events.

Still required before production:

- full production deployment validation.
- OAuth provider production callback verification.

Production blockers after later auth hardening phases:

- secure cookie / callback URL production smoke test.
- Upstash-backed staging/production rate-limit smoke test.
- formal staging-to-production auth rollout runbook.

## 13. Phase 8-4B CSRF Implementation Status

Admin mutation CSRF protection is implemented.

Strategy:

- double-submit cookie.
- cookie name: `admin_csrf_token`.
- request header: `X-CSRF-Token`.
- token generation: 32 random bytes encoded with `base64url`.
- cookie is readable by Admin UI JavaScript, uses `SameSite=Lax`, `Path=/`, and `Secure` in production.

Protected:

- `POST /api/admin/*`
- `PATCH /api/admin/*`
- future `PUT /api/admin/*`
- future `DELETE /api/admin/*`

Not protected by Admin CSRF:

- `/api/portal/*`
- `/api/auth/*`
- Admin readonly `GET /api/admin/*`

Route order for Admin mutations:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request)`
3. parse request body or `FormData`
4. call `adminServices`

`GET /api/admin/csrf`:

- requires Admin auth.
- sets `admin_csrf_token` if missing.
- returns only `{ data: { ok: true } }`.
- never returns the token in the response body.

CSRF failure:

- returns `ADMIN_CSRF_REQUIRED`.
- HTTP status `403`.
- safe message: `Invalid admin request.`
- writes `AdminAuthAudit` event `csrf_failure`.
- audit metadata includes only safe reason/path/method.
- cookie/header token values are never written to audit, logs, response body, or timeline.

Remaining production blockers:

- rate limit.
- production OAuth callback / secure cookie validation.
- formal staging-to-production auth rollout runbook.

## 14. Phase 8-5B Rate Limit Contract Freeze

This section freezes the rate limit contract. No limiter implementation or Redis/KV dependency is introduced in this phase.

### 14.1 Goals

Rate limiting is required before production to reduce:

- Portal token guessing.
- Portal upload abuse.
- signed URL abuse.
- Admin auth brute force attempts.
- Admin mutation abuse.

### 14.2 Route Groups

Portal route groups:

- `portal_case`
- `portal_signed_url`
- `portal_upload`
- `portal_confirmation`

Admin route groups:

- `admin_mutation`
- `admin_destructive`
- `admin_token_mutation`
- `admin_upload`

Auth route groups:

- `admin_login`
- `auth_callback`

### 14.3 Key Strategy

Admin:

- authenticated Admin requests use `adminId + routeGroup`.
- unauthenticated Admin auth/login attempts use `IP + routeGroup`.

Portal:

- pre-validation Portal requests use `IP + routeGroup`.
- post-validation Portal requests use `tokenId/caseId + routeGroup`.

Upload:

- Portal upload uses `tokenId + requirementId`.
- Admin upload uses `adminId + requirementId`.

Rules:

- never use plaintext Portal token as a rate limit key.
- never write `tokenHash` to rate limit audit metadata.
- never write session token, CSRF token, provider token, signed URL, raw cookie, authorization header, `storagePath`, or `storageBucket` to audit metadata.

### 14.4 Error Contract

Reserved error:

```text
RATE_LIMITED
```

HTTP status:

```text
429
```

API message:

```text
Too many requests. Please try again later.
```

If retry timing is available, the API should include:

```text
Retry-After
```

Admin UI Chinese message:

```text
Chinese UI copy: \u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002
```

### 14.5 Audit Contract

Rate limit events use `AdminAuthAudit`:

```text
rate_limit_triggered
```

Allowed metadata:

- `routeGroup`
- `method`
- `path`
- `keyType`
- `limit`
- `windowSeconds`
- `retryAfterSeconds`
- `reason`

Forbidden metadata:

- plaintext Portal token
- `tokenHash`
- session token
- CSRF token
- provider token
- signed URL
- `storagePath`
- `storageBucket`
- raw cookie
- authorization header
- secrets

### 14.6 V1 Implementation Recommendation

Local/dev may use an optional in-memory limiter only for smoke testing behavior.

Production must use a shared external limiter store, preferably:

- Upstash Redis
- Vercel KV

Do not use business PostgreSQL as the long-term rate limit store.

Default unit tests must not depend on external rate limit infrastructure.

### 14.7 Production Blocker

Before production, a real Redis/KV-backed rate limiter is required.

Until that exists, the system is suitable only for development or controlled internal demo environments, not public production traffic.

## 15. Phase 8-5D In-memory Dev Rate Limit Guard

The first rate limit guard is implemented for development and controlled demo use.

Implemented backend:

- in-memory adapter.
- no Redis/KV dependency.
- no schema or migration change.
- no Portal token architecture change.

Protected Admin route groups:

- `admin_token_mutation`
- `admin_upload`
- `admin_destructive`

Protected Portal route groups:

- `portal_case`
- `portal_signed_url`
- `portal_upload`

Admin route order:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request)`
3. rate limit guard
4. `adminServices`

Portal route order:

1. pre-validation IP limiter
2. Portal token validation
3. post-validation token/case limiter
4. `portalServices`

Error behavior:

- `RATE_LIMITED`
- HTTP `429`
- safe message: `Too many requests. Please try again later.`
- `Retry-After` header when retry timing is available.

Audit behavior:

- writes `AdminAuthAudit` event `rate_limit_triggered`.
- metadata contains only safe route group, method, path, key type, limit, window seconds, retry-after seconds, and reason.
- audit failures must not fail the request.

Known limitations:

- in-memory limiter does not work across serverless instances.
- in-memory limiter resets on process restart.
- OAuth callback and `/admin/login` are not limited in this phase.
- Admin readonly `GET` routes are not limited in this phase.
- production still requires Redis/KV-backed limiter.

## 16. Phase 8-6C Upstash Rate Limit Adapter

Production-grade backend selection is now defined for the existing route-level limiter.

Backends:

- `RATE_LIMIT_BACKEND=memory`
  - local/dev/demo only.
  - not allowed when `NODE_ENV=production`.
- `RATE_LIMIT_BACKEND=upstash`
  - required for staging/production public traffic.
  - requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Upstash behavior:

- uses the official Upstash Redis REST client.
- uses an atomic Redis script for `INCR`, first-hit `EXPIRE`, and `TTL`.
- maps Redis TTL to `retryAfterSeconds` and `resetAt`.
- does not log Redis URLs, tokens, limiter keys, Portal tokens, token hashes, signed URLs, or storage fields.

Route behavior is unchanged:

- Admin mutation order remains auth, CSRF, rate limit, service.
- Portal order remains pre-validation limiter, token validation, post-validation limiter, service.
- `RATE_LIMITED` and `Retry-After` behavior remains the same.
- audit still writes only the frozen safe `rate_limit_triggered` metadata.

Deployment rule:

- production must not run with the in-memory backend.
- default unit tests must not contact Upstash.
- staging must run a separate runtime smoke test before production rollout.
