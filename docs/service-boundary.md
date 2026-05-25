# Service Boundary

This document defines the Phase 4 service-layer boundaries for V1. It must be read before implementing API routes or pages.

V1 has three service namespaces:

- `adminServices`
- `portalServices`
- `sharedServices`

API routes must use the correct namespace. Do not bypass these services with direct Prisma responses.

## 1. Admin Services Boundary

Admin services are for back-office API routes only.

Rules:

- Admin API routes must call `adminServices`.
- Admin API routes must not return raw Prisma models directly.
- Admin services may read internal fields when needed for office work.
- Admin services may write timeline events for important actions.
- Admin services are not authentication. The API route layer must still enforce back-office access before calling them.
- Portal API routes must not import or call `adminServices`.

Admin service responsibilities currently include:

- Portal token creation, regeneration, and revocation.
- Admin file upload.
- Requirement review and status changes.
- Case phase changes.
- Immigration additional requirement creation.
- Application confirmation version creation.
- Admin case, requirement, template, and timeline queries.

## 2. Portal Services Boundary

Portal services are for customer token access only.

Rules:

- Portal API routes must call `portalServices`.
- Portal services must validate the portal token before accessing case data.
- Portal services must derive `caseId` from the token.
- Portal services must not trust a frontend-provided `caseId`.
- Portal services must only access the token's case.
- Portal services must never return raw Prisma models.
- Portal services must return DTOs built from explicit whitelists.
- Portal services must not import or call `adminServices`.
- Portal services must not return complete timeline data.

Portal service responsibilities currently include:

- Token validation.
- Portal case DTO retrieval.
- Portal file upload and explicit material submission.
- Portal file signed URL retrieval.
- Portal application confirmation confirmation and revision request.
- Portal application confirmation signed URL retrieval.

## 3. Shared Services Boundary

Shared services are only for permission-neutral utilities.

Shared services may include:

- Timeline event helper.
- Sensitive metadata guard.
- Token hash utilities.
- Upload policy validation.
- Storage path construction.
- Supabase Storage wrappers.

Shared services must not become a mixed permission surface.

Important current note:

- `shared/signed-url.ts` contains both admin and portal signed URL helpers.
- Because it mixes permission semantics, it is not exported from `sharedServices`.
- Future cleanup may split signed URL helpers into admin and portal service files.

## 4. Portal DTO Forbidden Fields

Normal Portal DTOs must not contain:

- `internalNote`
- `storagePath`
- `storageBucket`
- `tokenHash`
- plaintext token
- `passportNumber`
- `residenceCardNumber`
- `originalFileName`
- `metadata`
- `actorId`
- `actorType`
- internal operator info
- `signedUrl`

`originalFileName` is not returned to Portal. If the product later needs a customer-visible file name, add a server-generated `displayName` instead of exposing the original file name.

Portal DTOs must be treated as response whitelists, not as filtered Prisma objects.

## 5. Signed URL Exception

`signedUrl` is forbidden in normal Portal DTOs.

The only allowed exception is a dedicated signed URL service or API response. That response may contain only:

- `signedUrl`
- `expiresAt`

Signed URL responses must still not contain:

- `storagePath`
- `storageBucket`
- raw storage bucket names
- raw storage object paths

Signed URLs must not be written to:

- timeline metadata
- logs
- console output

Portal signed URL services must validate the portal token and derive `caseId` from that token before generating a URL.

## 6. Implemented Service Summary

### Portal Token Validation

- Plaintext tokens are accepted only as request input.
- The database stores only `tokenHash`.
- Invalid tokens return a unified invalid-token error.
- Portal requests derive `caseId` from the token.

### Admin Token Management

- Plaintext token is returned only once when created or regenerated.
- Regeneration revokes the previous active token.
- A case may have only one active token at a time.
- Token events write timeline entries without plaintext token or token hash.

### File Upload

- File body is stored in Supabase Storage.
- `DocumentFile` stores metadata only.
- Storage upload must succeed before `DocumentFile` is written.
- If DB write fails after Storage upload, the service attempts to delete the uploaded object.
- Portal upload stores files as editable customer uploads and does not submit the requirement.
- Portal upload does not return `storagePath`, `storageBucket`, or `originalFileName`.
- Upload writes `file_uploaded` timeline metadata without storage fields or original file name.
- Customers may remove their uploaded files before submission or while the requirement is in `needs_more`.
- `submitPortalDocumentRequirement` is the only Portal action that moves the requirement to `submitted`.
- Submit writes `requirement_status_changed` timeline metadata and creates the Admin notification.

### Requirement Review

- Admin-only.
- Portal cannot directly review or approve requirements.
- Portal can only explicitly submit a customer-visible requirement after at least one file has been uploaded.
- Review service handles `submitted`, `needs_more`, `approved`, and `not_applicable`.
- `approved` must display to Portal as `accepted`.
- `internalNote` never enters Portal DTO or timeline metadata.

### Case Phase

- Admin-only.
- Case phase and requirement status are separate.
- Missing required requirements can produce warnings before `submitted`.
- Warnings do not block phase changes.
- Phase changes write `case_phase_changed`.

### Immigration Additional Requirements

- Admin-only.
- Created as `CaseDocumentRequirement`.
- `sourceType` is always `immigration_request`.
- They do not depend on templates.
- `setCasePhase=true` may move the case to `collecting_documents`.
- This does not automatically create other requirements or files.

### Application Confirmation

- Supports multiple versions.
- Admin can create a new confirmation version.
- New versions may supersede older pending versions.
- Portal can operate only on the latest actionable version:
  - latest `pending`
  - or latest `needs_revision`
- Confirmed versions cannot be changed again.
- If changes are needed after confirmation, admin must create a new version.
- `needs_revision` comment is currently not stored long-term in structured form.
- `needs_revision` comment must not be written to timeline metadata.

## 7. API Route Development Rules

Future API route implementation must follow these rules:

- Admin API routes must use `adminServices`.
- Portal API routes must use `portalServices`.
- Shared utilities may be used only when they do not bypass admin or portal boundaries.
- Root service imports must use namespaces:
  - `adminServices`
  - `portalServices`
  - `sharedServices`
- Do not directly mix admin and portal exports in the root service entrypoint.
- API routes must not directly return Prisma models.
- Portal API routes must not receive or trust `caseId`.
- Portal API routes must derive `caseId` through token validation.
- Portal API routes must not import `adminServices`.
- Normal Portal API responses must not contain the forbidden fields listed above.
- File downloads and application confirmation previews must use dedicated signed URL APIs.
- Signed URL APIs may return only `signedUrl` and `expiresAt`.
- Important mutations must write timeline events through the service layer.

## 8. Risks

- API routes may accidentally return Prisma models and bypass DTO whitelists.
- Portal routes may accidentally import admin services.
- A frontend-provided `caseId` may be trusted by mistake.
- `originalFileName` may be reintroduced into Portal DTOs.
- Signed URLs may be embedded into normal DTOs instead of dedicated responses.
- Signed URLs, storage paths, or token values may be written to timeline metadata or logs.
- Shared services may accumulate permission-specific behavior and blur boundaries.
- ApplicationConfirmation `needs_revision` comment may be mistaken for a persisted structured field.

## 9. Phase 5 Route Boundary Addendum

This section records the route-level boundaries implemented in Phase 5.

### 9.1 Implemented Portal Routes

- `GET /api/portal/[token]/case`
- `POST /api/portal/[token]/files/[fileId]/signed-url`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/signed-url`
- `POST /api/portal/[token]/requirements/[requirementId]/files`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/confirm`
- `POST /api/portal/[token]/application-confirmations/[confirmationId]/request-revision`

Portal route rules:

- Must call only `portalServices`.
- Must not import `adminServices`.
- Must not import `prisma`.
- Must not receive or trust `caseId`.
- Must ignore `caseId` from JSON body or `FormData`.
- Must not directly return Prisma models.
- Normal responses must not contain forbidden Portal DTO fields.
- Signed URL responses are the only responses allowed to contain `signedUrl`.

### 9.2 Implemented Admin Readonly Routes

- `GET /api/admin/cases`
- `GET /api/admin/cases/[caseId]`
- `GET /api/admin/cases/[caseId]/requirements`
- `GET /api/admin/cases/[caseId]/timeline`

Admin route rules:

- Must call `requireAdminAuth`.
- Must call only `adminServices`.
- Must not import `portalServices`.
- Must not import `prisma`.
- Must not directly return Prisma models.
- Admin readonly DTOs may include back-office fields, including:
  - `internalNote`
  - storage metadata
  - timeline metadata

### 9.3 Response Format

Success:

```json
{
  "data": {}
}
```

Error:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request."
  }
}
```

Signed URL:

```json
{
  "data": {
    "signedUrl": "...",
    "expiresAt": "..."
  }
}
```

### 9.4 Error Codes

- `INVALID_PORTAL_TOKEN`
- `FILE_NOT_ACCESSIBLE`
- `CONFIRMATION_NOT_ACCESSIBLE`
- `INVALID_UPLOAD`
- `INVALID_REQUEST`
- `ADMIN_AUTH_REQUIRED`
- `INTERNAL_ERROR`

Error responses must not reveal token status, resource existence, storage paths, storage buckets, token hashes, or internal implementation details.

### 9.5 Admin Auth Boundary

`requireAdminAuth` is now backed by Auth.js session validation.

Every `/api/admin/*` route must still call `requireAdminAuth(request)` at route level. Middleware is UX-only and must not be treated as API security.

Future admin mutation routes must also use CSRF and rate-limit guards before calling services.

### 9.6 Test Split

- `npm run test`: unit tests only; no database or network dependency.
- `npm run env:check`: redacted local/staging runtime configuration readiness check.
- `npm run test:integration`: DB integration tests; must run only against safe dev/staging data.
- `npm run test:token-constraint`: PostgreSQL partial unique index test.

Unit tests must continue checking route import boundaries, Portal DTO forbidden fields, signed URL response shape, and safe error mapping.

### 9.7 Next Admin Mutation Routes

Planned admin mutation routes:

- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`
- `POST /api/admin/requirements/[requirementId]/files`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `POST /api/admin/cases/[caseId]/application-confirmations`

These routes must call `requireAdminAuth`, call only `adminServices`, avoid direct Prisma access, avoid `portalServices`, and return explicit DTOs.

## 10. Phase 5-10 Addendum: Admin Mutation Boundary and Coverage

This section updates the service boundary document after implementing the first Admin mutation API set.

### 10.1 Implemented Admin Mutation Routes

- `POST /api/admin/cases/[caseId]/token/regenerate`
- `POST /api/admin/cases/[caseId]/token/revoke`
- `PATCH /api/admin/requirements/[requirementId]/status`
- `POST /api/admin/cases/[caseId]/immigration-requests`
- `PATCH /api/admin/cases/[caseId]/phase`
- `POST /api/admin/cases/[caseId]/application-confirmations`
- `POST /api/admin/requirements/[requirementId]/files`

### 10.2 Unified Admin Mutation Boundary

Admin mutation routes must:

- call `requireAdminAuth`
- call only `adminServices`
- not import `prisma`
- not import `portalServices`
- not directly write DB records
- not directly write Storage objects
- not directly write timeline events
- not directly return Prisma models
- not merge request body or `FormData` directly into responses

Admin mutation routes are thin adapters. Business checks, Storage operations, DB writes, timeline writes, and compensation behavior belong in the admin service layer.

### 10.3 API-Specific Service Boundaries

Token regenerate:

- Route calls the admin token regeneration service.
- This is the only Admin API allowed to return `plaintextToken`.
- Response must not include `tokenHash`.
- Route must not log plaintext token.

Token revoke:

- Route calls the admin token revoke service.
- Response must not include `plaintextToken`.
- Response must not include `tokenHash`.

Requirement status:

- Route calls `reviewCaseDocumentRequirement`.
- Route must not write timeline events.
- Route must not directly change files or case phase.

Immigration request:

- Route calls `addImmigrationAdditionalRequirement`.
- Route cannot control `sourceType`.
- Service must fix `sourceType` to `immigration_request`.
- Route must not create template records or files.

Case phase:

- Route calls `changeCasePhase`.
- Route must not implement the phase state machine.
- Route must not change requirement status.
- Route must not automatically create immigration request requirements.

Application confirmation:

- Route calls `createApplicationConfirmationVersion`.
- Route may pass `storageBucket` and `storagePath` into the admin service.
- Route response must not expose `storageBucket` or `storagePath`.
- Route must not upload files or generate signed URLs.

Admin file upload:

- Route calls `uploadAdminDocumentFile`.
- Route may read only `caseId` and `file` from `FormData`.
- Route uses the route `requirementId` and ignores `FormData.requirementId`.
- Route must not directly upload to Storage.
- Route must not directly write `DocumentFile`.
- Route must not directly write timeline events.
- Route must not perform upload policy business checks.

### 10.4 Admin Mutation Response Forbidden Fields

Admin mutation responses must not include:

- `tokenHash`
- raw `storagePath`
- raw `storageBucket`
- `signedUrl`
- plaintext token, except the token regenerate response
- request body `metadata`
- Prisma internal object structure

Admin DTOs may include intentionally exposed back-office fields, but they must be shaped by services and not returned as raw Prisma objects.

### 10.5 Admin Auth Boundary

Admin routes use Auth.js-backed `requireAdminAuth(request)`.

Before production, the remaining auth-related requirements are runtime verification of production OAuth callback URLs, secure cookies, environment isolation, and staging smoke tests.

Admin mutation APIs must continue to call auth, CSRF, and rate-limit guards before business services.

### 10.6 Current API Coverage

The API layer currently covers:

- Portal readonly
- Portal signed URL
- Portal mutation
- Admin readonly
- Admin token regenerate/revoke
- Admin requirement review
- Admin immigration additional requirement creation
- Admin case phase changes
- Admin application confirmation version creation
- Admin file upload

The current coverage verifies the main service-layer safety boundaries, but it does not yet cover the complete back-office case setup workflow.

### 10.7 Missing API

Still missing:

- Admin case creation API
- Admin case basic information update API
- Admin Customer create/update API
- Admin template list/detail/import/edit/version management API
- Admin create case from template flow or equivalent copied requirement creation API
- Admin custom requirement API
- Admin file delete/replace API
- Admin application confirmation signed URL or back-office preview API
- Formal admin auth API, session, or middleware

### 10.8 Next Phase Recommendation

The next phase should not jump directly into the full UI.

Recommended order:

1. Add Admin case creation, template selection, and copied requirement creation APIs.
2. Add any missing template and customer APIs needed by that creation flow.
3. Start UI work after the core creation workflow has an API surface.

If UI work starts earlier, it should be limited to a readonly shell and should not claim to support the full business workflow.

### 10.9 Risks

- Admin mutation routes may become unsafe if future routes skip auth, CSRF, or rate-limit guards.
- New routes may accidentally bypass services and write directly to DB, Storage, or timeline.
- Raw storage fields may leak if service DTOs are not used.
- `plaintextToken` may leak outside the single regenerate response if future code reuses token service results carelessly.
- Starting UI before create-case APIs exist may create false workflow assumptions.

## 11. Phase 6-1F Addendum: Case Creation Service and Route Boundary

This section records the service and route boundaries for the minimum case creation flow.

### 11.1 Case Creation Flow Order

The intended Admin flow is:

1. `POST /api/admin/cases`
2. `POST /api/admin/cases/[caseId]/apply-template`
3. `POST /api/admin/cases/[caseId]/token/create`

The steps are separate so draft cases can exist before template application or Portal token creation.

### 11.2 `createCase` Boundary

Service:

- `adminServices.createCase`

Route:

- `POST /api/admin/cases`

Rules:

- Creates a Customer or reuses an existing Customer.
- Creates the Case.
- Generates `caseNumber`.
- Sets `casePhase = draft`.
- Does not apply templates.
- Does not create `CaseDocumentRequirement`.
- Does not create `CustomerAccessToken`.
- Does not return passport number, residence card number, token fields, storage fields, signed URLs, or `internalNote`.
- Route must not directly create Customer or Case records.
- Route must not write timeline events.

### 11.3 `applyDocumentTemplateToCase` Boundary

Service:

- `adminServices.applyDocumentTemplateToCase`

Route:

- `POST /api/admin/cases/[caseId]/apply-template`

Rules:

- Copies `DocumentTemplateItem` records into `CaseDocumentRequirement` records.
- Sets `sourceType = template`.
- Writes `sourceTemplateId`, `sourceTemplateVersion`, and `sourceTemplateItemId`.
- Does not live-reference template content.
- Does not modify `CasePhase`.
- Does not create a token.
- Does not return `internalNote`, `customerInstruction`, storage fields, token fields, or signed URLs.
- Route must not copy template items.
- Route must not create `CaseDocumentRequirement`.
- Route must not write timeline events.

### 11.4 `createPortalTokenForCase` Boundary

Service:

- `adminServices.createPortalTokenForCase`

Route:

- `POST /api/admin/cases/[caseId]/token/create`

Rules:

- Creates the first Portal token for a case.
- If an active token already exists, returns `INVALID_REQUEST`.
- `plaintextToken` may be returned only once, in this response.
- Does not return `tokenHash`.
- Does not return storage fields or signed URLs.
- Route must not generate token.
- Route must not hash token.
- Route must not write timeline events.

### 11.5 Current Minimum Back-Office Loop

The current API and service surface supports:

- create case
- apply template
- create Portal token
- Portal view/upload/application confirmation actions
- Admin review/upload/case phase/immigration additional requirement/application confirmation version actions

This is a minimum workflow loop, not a complete production back-office product.

### 11.6 UI Pre-Check Gaps

Still missing before complete UI work:

- Admin template readonly API
- Admin customer search API
- Admin case update API
- Admin custom requirement API
- Admin file delete/replace API
- formal admin auth

### 11.7 UI Recommendation

Recommended sequence:

1. Build Admin template readonly API.
2. Build Admin customer search API.
3. Then start a UI shell.

The UI shell may start after those APIs, but production UI must wait for real admin authentication.

### 11.8 Risks

- Placeholder admin auth cannot be shipped.
- `plaintextToken` can only be shown once after token create.
- The three-step creation flow can partially fail; UI must clearly show which step succeeded.
- Without template list and customer search APIs, the create case UI will force manual IDs or brittle input.

## 12. Phase 7-3 Addendum: Environment Readiness and Secret Handling

This section records environment rules added after the Admin UI QA pass.

### 12.1 Required Token Secret

`TOKEN_HASH_SECRET` is required by token creation and token validation.

Rules:

- The application must never store plaintext Portal tokens.
- The database stores only `tokenHash`.
- `TOKEN_HASH_SECRET` is used to create and validate that hash.
- The secret value must not be logged.
- The secret value must not be written to timeline metadata.
- The secret value must not be returned from API responses.
- The code must not generate a fallback secret in development, test, or production.
- Changing `TOKEN_HASH_SECRET` makes existing Portal tokens unverifiable.

### 12.2 Configuration Error Boundary

If a required environment variable is missing, services throw `MissingEnvironmentVariableError`.

API routes map this to:

```json
{
  "error": {
    "code": "SERVER_CONFIGURATION_ERROR",
    "message": "Server configuration error."
  }
}
```

The response must not include:

- environment variable values
- `TOKEN_HASH_SECRET`
- stack trace
- internal error details

### 12.3 Environment Helper

Environment values must be read through the shared helper when a service needs an explicit runtime check.

Current helper functions:

- `getRequiredEnv(name)`
- `getOptionalEnv(name)`
- `getRequiredNumberEnv(name)`

The helper validates only when called. It must not force all Storage configuration to exist during unrelated readonly flows.

### 12.4 Storage Environment

Storage-related variables remain checked by the Storage service path, not globally at app startup:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `STORAGE_SIGNED_URL_EXPIRES_IN_SECONDS`
- `MAX_UPLOAD_FILE_SIZE_MB`
- `ALLOWED_UPLOAD_MIME_TYPES`

This keeps readonly Admin UI and token-independent flows from failing because optional Storage paths are not configured locally.

### 12.5 Risks

- Missing `TOKEN_HASH_SECRET` makes token create/validate fail.
- Auto-generating a local fallback would hide deployment mistakes and break token stability.
- Overly detailed error responses could leak deployment configuration.
- Rotating `TOKEN_HASH_SECRET` requires a planned token revocation/regeneration process.

## 13. Phase 7-10 Addendum: Admin UI Boundary

This section records the current Admin UI boundary after the Phase 7 UI shell and interaction work.

### 13.1 Implemented Admin UI Pages

- `/admin/cases`
- `/admin/cases/new`
- `/admin/cases/[caseId]`

### 13.2 UI-to-API Rule

Admin UI components must call API routes only.

Admin UI components must not:

- import Prisma
- import `adminServices`
- import `portalServices`
- call service functions directly
- write timeline events
- directly access Supabase Storage
- generate signed URLs
- cache signed URLs
- persist plaintext Portal tokens

### 13.3 Current Admin UI Capabilities

The Admin UI currently supports:

- case list
- case creation
- Customer search/reuse
- template application
- first Portal token creation
- case detail view
- requirement review
- Admin file upload
- immigration additional requirement creation
- case phase changes
- application confirmation version creation
- Portal token regeneration
- Portal token revocation

### 13.4 Token UI Rules

- `plaintextToken` is shown only once after token create or regenerate.
- UI must not save `plaintextToken` to localStorage, sessionStorage, IndexedDB, URL, logs, or timeline.
- Regenerate shows the new plaintext token in the modal and keeps the modal open so the operator can copy it.
- Closing the modal clears the plaintext token from React state.
- Revoke never displays plaintext token.
- Regenerate revokes the previous active token.

### 13.5 UI Response Safety

Admin UI must not display:

- `tokenHash`
- raw storage fields in normal display surfaces
- signed URLs in normal display surfaces
- raw metadata JSON
- stack traces
- raw error JSON
- secret values

Exception:

- Application confirmation create UI may accept `storageBucket` and `storagePath` as Admin-only inputs to register an existing file, but the normal case detail display must not show those raw storage fields.

### 13.6 Demo Boundary

The current UI is suitable for an internal development demo and controlled staging review.

It is not production-ready until:

- production OAuth callback and secure cookie behavior are smoke-tested.
- production/staging database, storage, and Redis isolation are verified.
- public deployment, monitoring, and rollback procedures are confirmed.

Demo must clearly label unfinished areas:

- production auth/runtime verification
- Portal UI polish
- file delete/replace
- application confirmation preview/download
- template management UI
- customer detail/update UI
- real search/notification
- email/send-link flow

### 13.7 Risks

- UI could accidentally bypass API routes and import services directly.
- Plaintext token could be copied into persistent browser storage by future changes.
- Signed URL preview/download work could accidentally cache signed URLs.
- Storage fields could leak into normal display views.
- Demo users could mistake the staging auth setup for production-ready deployment.

## 14. Phase 8-1D Addendum: Admin Auth Boundary Freeze

Admin authentication will use Auth.js / NextAuth.

### 14.1 Admin Auth vs Portal Token

The auth systems are separate:

- Admin uses session auth.
- Portal uses case-specific token auth.
- Admin session must not grant Portal access.
- Portal token must not grant Admin access.
- `/api/admin/*` must use Admin session auth.
- `/api/portal/*` must use Portal token validation.

### 14.2 Auth.js Adapter Strategy

Use Auth.js default adapter tables:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Naming rule:

- `User` means Admin auth user.
- `Customer` means visa applicant/client.

Code should use names such as `adminUser` and `adminId` when referencing Auth.js users.

### 14.3 Admin User Fields

The Auth.js `User` model should include:

- `role`
- `status`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

V1:

- only `role = admin`
- `status = active | disabled`
- no complex roles, teams, organizations, or permission matrix

### 14.4 requireAdminAuth Migration

The existing `requireAdminAuth(request)` boundary remains the mandatory API route entrypoint.

Migration target:

- replace the placeholder with real Auth.js session validation.
- keep every `/api/admin/*` route calling `requireAdminAuth`.
- return:

```ts
{
  adminId: string;
  email: string;
  role: "admin";
}
```

Middleware may protect `/admin/*` for UX, but it does not replace route-level API auth.

### 14.5 CSRF Boundary

Admin mutations require CSRF protection.

Protected:

- `POST /api/admin/*`
- `PATCH /api/admin/*`
- future `PUT /api/admin/*`
- future `DELETE /api/admin/*`

Recommended strategy:

- double-submit CSRF token.
- Admin UI sends `X-CSRF-Token`.
- route order is:
  1. `requireAdminAuth`
  2. CSRF guard
  3. `adminServices`

Portal routes do not use Admin CSRF.

### 14.6 AdminAuthAudit Boundary

Admin auth audit is separate from case timeline.

Record:

- `login_success`
- `login_failure`
- `logout`
- `session_expired`
- `csrf_failure`
- `rate_limit_triggered`
- `suspicious_admin_request`

Do not record:

- password
- session token
- CSRF token
- Portal token
- token hash
- signed URL
- secrets
- raw cookies
- authorization header

### 14.7 Production Blockers

The following block production use:

- no CSRF guard
- no rate limit
- no secure cookie/session deployment validation
- no preview/staging/production database separation strategy

### 14.8 Phase 8-3C Admin Auth Boundary

`requireAdminAuth(request)` is now backed by Auth.js database session validation.

It must:

- reject missing sessions.
- reject sessions without an email.
- reject disabled Admin users.
- return only `adminId`, `email`, and `role`.

Admin UI middleware protects `/admin/*` for navigation UX only. It does not replace route-level API auth.

Admin API routes must still:

- call `requireAdminAuth`.
- call only `adminServices`.
- not import Prisma directly.
- not import Portal services.

Auth audit writes are limited to:

- `login_success`
- `login_failure`
- `logout`

Audit metadata must not contain session tokens, provider tokens, Portal tokens, token hashes, signed URLs, storage paths, storage buckets, secrets, raw cookies, or authorization headers.

CSRF remains pending and is still required before production use of Admin mutations.

### 14.9 Phase 8-4B CSRF Boundary

Admin mutation CSRF guard is implemented.

Admin mutation route order is fixed:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request)`
3. parse body or `FormData`
4. call `adminServices`

Protected routes:

- `POST /api/admin/*`
- `PATCH /api/admin/*`
- future `PUT /api/admin/*`
- future `DELETE /api/admin/*`

Unprotected by Admin CSRF:

- Portal routes.
- Auth.js routes.
- readonly Admin `GET` routes.

Admin UI boundary:

- mutation helpers read `admin_csrf_token` from cookie.
- mutation helpers send `X-CSRF-Token`.
- if the cookie is missing, Admin UI calls `GET /api/admin/csrf` first.
- CSRF token is not stored in `localStorage`, `sessionStorage`, or IndexedDB.
- CSRF token is not logged.

CSRF failure audit:

- writes `AdminAuthAudit` event `csrf_failure`.
- metadata may include safe `reason`, `path`, and `method`.
- metadata must not include cookie/header token values, session tokens, Portal tokens, signed URLs, storage paths, storage buckets, secrets, raw cookies, or authorization headers.

## 15. Phase 8-5B Rate Limit Boundary Freeze

This section freezes the service and route boundary for future rate limiting. No limiter is implemented in this phase.

### 15.1 Purpose

Rate limiting must protect:

- Portal token guessing.
- Portal signed URL abuse.
- Portal upload abuse.
- Admin auth brute force attempts.
- Admin mutation abuse.

### 15.2 Route Groups

Portal:

- `portal_case`
- `portal_signed_url`
- `portal_upload`
- `portal_confirmation`

Admin:

- `admin_mutation`
- `admin_destructive`
- `admin_token_mutation`
- `admin_upload`

Auth:

- `admin_login`
- `auth_callback`

### 15.3 Key Strategy

Rate limit keys must be derived from safe identifiers:

- Admin authenticated: `adminId + routeGroup`.
- Admin unauthenticated/auth login: `IP + routeGroup`.
- Portal pre-validation: `IP + routeGroup`.
- Portal post-validation: `tokenId/caseId + routeGroup`.
- Portal upload: `tokenId + requirementId`.
- Admin upload: `adminId + requirementId`.

Forbidden key material:

- plaintext Portal token.
- `tokenHash`.
- session token.
- CSRF token.
- provider token.
- signed URL.
- raw cookies.
- authorization header.

### 15.4 Boundary Rules

Future rate limit guards must be route-level or API-helper-level boundaries.

They must not:

- replace `requireAdminAuth`.
- replace `requireAdminCsrf`.
- replace Portal token validation.
- bypass `adminServices` or `portalServices`.
- write case timeline events.
- expose limiter keys to clients.
- leak token validity through error messages.

Admin mutation order should remain:

1. `requireAdminAuth(request)`
2. `requireAdminCsrf(request)`
3. rate limit guard
4. request parsing
5. `adminServices`

Portal routes may need both:

- a pre-validation IP limiter to slow token guessing.
- a post-validation token/case limiter after token validation succeeds.

### 15.5 Error Contract

Reserved error code:

```text
RATE_LIMITED
```

HTTP status:

```text
429
```

Safe API message:

```text
Too many requests. Please try again later.
```

Admin UI Chinese message:

```text
Chinese UI copy: \u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002
```

Use `Retry-After` when retry timing is available.

### 15.6 Audit Contract

Rate limit audit writes use `AdminAuthAudit` event:

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

### 15.7 Implementation Recommendation

Local/dev:

- optional in-memory limiter is acceptable for development checks.

Production:

- use Upstash Redis or Vercel KV.
- do not use business PostgreSQL as the long-term limiter store.
- keep default unit tests independent of external limiter infrastructure.

### 15.8 Production Blocker

Production requires a shared Redis/KV-backed limiter. Without it, Admin auth and CSRF are not enough for public traffic.

## 16. Phase 8-5D In-memory Rate Limit Boundary

The initial rate limit implementation is a route-level guard backed by an in-memory adapter.

Implemented files live under:

```text
lib/rate-limit/*
```

Boundary rules:

- Admin routes still call `requireAdminAuth` first.
- Admin mutation routes still call `requireAdminCsrf` before rate limiting.
- rate limit guards do not replace Admin auth, CSRF, or Portal token validation.
- route handlers still call `adminServices` or `portalServices`.
- limiter code must not import or call business services.
- limiter code must not write case timeline events.

Admin protected groups:

- `admin_token_mutation`
- `admin_upload`
- `admin_destructive`

Portal protected groups:

- `portal_case`
- `portal_signed_url`
- `portal_upload`

Portal behavior:

- pre-validation limiter uses IP-based key.
- token validation then derives `tokenId` and `caseId`.
- post-validation limiter uses token/case or token/requirement key material.
- plaintext token and `tokenHash` are not key material.

Audit:

- blocked requests may write `AdminAuthAudit.rate_limit_triggered`.
- audit metadata is safe and limited to the frozen contract.
- audit failure is swallowed and does not change the response.

Known limitation:

- the in-memory adapter is process-local and resets on process restart.
- it is not suitable for production or multi-instance deployments.
- Redis/KV remains a production blocker.

## 17. Phase 8-6C Upstash Rate Limit Boundary

The rate limit service boundary now supports backend selection without changing route code.

Files:

```text
lib/rate-limit/config.ts
lib/rate-limit/upstash.ts
```

Boundary rules:

- route handlers continue calling the same limiter guards.
- limiter guards continue to run before `adminServices` or `portalServices`.
- Upstash adapter must not import business services.
- Upstash adapter must not write business timeline events.
- Upstash adapter must not log raw Redis env, limiter keys, Portal tokens, token hashes, signed URLs, or storage metadata.

Backend selection:

- local/dev/test may use `memory`.
- production may not use `memory`.
- `upstash` requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Atomicity:

- Upstash uses a Redis script to increment the key, set expiry on first hit, and read TTL in one backend operation.
- TTL drives `Retry-After` and `resetAt`.

Testing boundary:

- default unit tests mock Upstash and do not connect to external infrastructure.
- real Upstash verification belongs to staging smoke tests.

## 18. Template-5B Template Selection Case Create Boundary

New Admin route:

- `POST /api/admin/cases/from-template-selection`

Service boundary:

- The route may only call `adminServices.createCaseFromTemplateSelection`.
- The route must not call `adminServices.createCase`.
- The route must not call `adminServices.applyDocumentTemplateToCase`.
- The route must not import Prisma.
- The route must not import `portalServices`.
- The route must not write business timeline events directly.
- The route must not upload files or touch Storage.
- The route must not create Portal tokens.

Service responsibility:

- `createCaseFromTemplateSelection` owns the transaction.
- It creates or reuses the Customer.
- It creates the Case.
- It validates selected template item ids against the selected template.
- It copies selected template items into case requirements.
- It creates custom case requirements.
- It writes timeline events with safe metadata.

Route responsibility:

- Authenticate Admin session.
- Check Admin CSRF.
- Apply Admin rate limit.
- Parse only whitelisted body fields.
- Convert ISO date strings to `Date` where needed.
- Return `{ data: serviceResult }`.
- Map known service errors to safe API errors.

Forbidden route behavior:

- No direct `Customer` create.
- No direct `Case` create.
- No direct `CaseDocumentRequirement` create.
- No direct `CustomerAccessToken` create.
- No direct `DocumentFile` create.
- No direct timeline write.
- No Storage access.

Security boundary:

- `selectedTemplateItemIds` is never trusted blindly; the service validates ownership.
- `customItems` can create customer or office requirements only through the service.
- `sourceTemplate*` values are never accepted from the request body.
- Portal token remains a separate step so plaintext token display remains isolated.

Response forbidden fields:

- `storagePath`
- `storageBucket`
- `signedUrl`
- `tokenHash`
- plaintext token
- raw request metadata
- raw Prisma relation objects

## 19. Admin Notification Boundary

`AdminNotification` is an internal work reminder model. It is not a customer-facing feature and it is not a replacement for `TimelineEvent`.

Boundary:

- Timeline records long-term case history.
- Notification records unread/read operational reminders for the Admin workspace.
- The same business event may write both timeline and notification.
- Portal UI must never read Admin notifications.
- Admin notification API must only call `adminServices`.
- UI must call `/api/admin/notifications*` and must not import Prisma or services.

Initial triggers:

- `submitPortalDocumentRequirement` creates `portal_file_uploaded` after the customer clicks submit.
- `confirmPortalApplicationConfirmation` creates `application_confirmation_confirmed`.
- `requestPortalApplicationConfirmationRevision` creates `application_confirmation_revision_requested`.
- Portal rate limit audit may create `portal_rate_limit_triggered`.

Notification metadata must not contain:

- plaintext Portal token.
- `tokenHash`.
- signed URL.
- `storagePath` / `storageBucket`.
- session token.
- CSRF token.
- provider token.
- raw cookie.
- authorization header.
- passport number.
- residence card number.
- secrets.

V1 intentionally does not implement:

- email sending.
- LINE or WeChat sending.
- browser push.
- customer notification center.
- scheduled reminders.
- multi-employee assignment.
- read receipt analytics.

## 20. Admin Customer Update Boundary

Admin customer updates are limited to basic customer contact fields used by the case detail UI:

- name.
- email.
- phone.
- nationality.

The service is `adminServices.updateAdminCustomer`.

Boundary rules:

- Admin UI must call `PATCH /api/admin/customers/[customerId]`.
- Admin UI must not import Prisma or services.
- The API route must call Admin auth, CSRF, and rate limit before the service.
- The API route must use route `customerId`; body `customerId` is ignored.
- The service must return an Admin DTO, not a Prisma object.

Customer update DTO must not include:

- passport number.
- residence card number.
- address.
- token or token hash.
- signed URL.
- storage path or bucket.
- raw request metadata.

Portal customer data remains read-only from the customer side in V1.
