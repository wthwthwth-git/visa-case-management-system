# Acceptance Checklist

This checklist is used for manual and automated acceptance after each phase. It focuses on V1 scope, security boundaries, and regression-prone workflows.

## 1. Documentation Acceptance

- [ ] `docs/product-spec.md` defines V1 business scope.
- [ ] `docs/status-rules.md` defines case phases and requirement statuses.
- [ ] `docs/page-flow.md` defines Admin and Portal page flows.
- [ ] `docs/data-model.md` defines current data model boundaries.
- [ ] `docs/api-contract.md` defines Admin and Portal API contracts.
- [ ] `docs/service-boundary.md` defines Admin, Portal, and shared service boundaries.
- [ ] `docs/admin-auth.md` defines Admin auth architecture.
- [ ] `docs/acceptance-checklist.md` includes acceptance items for new security or workflow rules.
- [ ] New business rules do not expand beyond V1 without documentation updates.

## 2. Database Schema Acceptance

- [ ] `Customer` exists and has 1-N relation with `Case`.
- [ ] `Case` does not directly store `customerName` or `customerContact`.
- [ ] Customer fields include email, phone, address, nationality, birthday, passport number, and residence card number.
- [ ] `DocumentTemplate` and `DocumentTemplateItem` are formal database models.
- [ ] Template application copies items into `CaseDocumentRequirement`.
- [ ] Existing cases are not affected when templates are edited later.
- [ ] `CaseDocumentRequirement` is the unified requirement model.
- [ ] `responsibleParty` supports customer and office.
- [ ] `sourceType` supports template, custom, immigration_request, and system.
- [ ] `DocumentFile` is the unified file model.
- [ ] One requirement can have multiple files.
- [ ] Case phase and requirement status are separate fields.
- [ ] `TimelineEvent.metadata` is JSON.
- [ ] `CustomerAccessToken` stores only `tokenHash`.
- [ ] `tokenHash` is unique.
- [ ] A partial unique index enforces one active token per case.
- [ ] Auth.js adapter tables exist: `User`, `Account`, `Session`, `VerificationToken`.
- [ ] `User` means Admin auth user, not Customer.
- [ ] `AdminAuthAudit` exists and is separate from case timeline.

## 3. Case Creation Acceptance

- [ ] Admin can create a Case with a new Customer.
- [ ] Admin can create a Case by reusing an existing Customer.
- [ ] Reusing a Customer does not update Customer fields.
- [ ] Case creation sets initial phase to `draft`.
- [ ] Case creation generates a `caseNumber`.
- [ ] Case creation does not apply a template automatically.
- [ ] Case creation does not create requirements automatically.
- [ ] Case creation does not create a Portal token automatically.
- [ ] Case creation writes `case_created` timeline event.
- [ ] Case creation response does not expose passport number, residence card number, token data, storage data, signed URL, or internal note.

## 4. Template Copy Acceptance

- [ ] Admin can apply a template by `templateId`.
- [ ] Admin can apply a template by `templateKey + version`.
- [ ] Admin can apply latest active template by `templateKey`.
- [ ] Copied requirements use `sourceType = template`.
- [ ] Copied requirements store `sourceTemplateId`, `sourceTemplateVersion`, and `sourceTemplateItemId`.
- [ ] Customer template items default to `portalVisible = true`.
- [ ] Office template items default to `portalVisible = false`.
- [ ] Copied requirements default to `portalDownloadable = false`.
- [ ] Duplicate application of the same template version is rejected.
- [ ] Applying a template does not modify Case phase by default.
- [ ] Applying a template does not create files, tokens, or application confirmations.
- [ ] Applying a template writes one `template_items_copied` timeline event.
- [ ] Timeline metadata does not include requirement IDs, internal notes, customer instructions, storage data, signed URLs, tokens, passport numbers, or residence card numbers.

## 5. Portal Token Acceptance

- [ ] Portal token plaintext is returned only once on create/regenerate.
- [ ] Database stores only token hash.
- [ ] Plaintext token is never logged.
- [ ] Plaintext token is never written to timeline metadata.
- [ ] One case has at most one active Portal token at a time.
- [ ] Regenerating a token revokes the previous active token.
- [ ] Revoked and expired token history can have multiple records.
- [ ] Invalid token errors do not reveal whether a case exists.
- [ ] Portal requests derive `caseId` from the token.
- [ ] Portal requests never trust frontend-provided `caseId`.
- [ ] Token create/regenerate/revoke writes safe timeline events.
- [ ] `TOKEN_HASH_SECRET` is required and no fallback secret is generated.

## 6. File Upload Acceptance

- [ ] Portal upload validates Portal token before accessing case data.
- [ ] Portal upload can upload only to the token's case.
- [ ] Portal upload can upload only customer-responsible visible requirements.
- [ ] Portal upload cannot upload to office-only requirements.
- [ ] Admin upload can upload to customer, office, custom, and immigration requirements.
- [ ] Upload validates type, size, and filename.
- [ ] File body is stored in private Supabase Storage.
- [ ] Database stores only `DocumentFile` metadata.
- [ ] Storage upload must succeed before DB file record is created.
- [ ] DB failure after Storage upload attempts cleanup.
- [ ] Portal upload does not move requirement from `not_submitted` to `submitted`.
- [ ] Portal submission requires at least one uploaded file.
- [ ] Portal submission moves a customer-visible requirement to `submitted`.
- [ ] Portal can delete a customer-uploaded file before submission or while the requirement is in `needs_more`.
- [ ] Portal cannot delete customer-uploaded files after submission.
- [ ] Upload never automatically approves a requirement.
- [ ] Upload writes `file_uploaded` timeline event.
- [ ] Portal submission writes `requirement_status_changed` timeline event.
- [ ] Timeline metadata does not include original filename, storage path, storage bucket, signed URL, token, or sensitive IDs.
- [ ] Portal upload response does not expose `storagePath`, `storageBucket`, `originalFileName`, signed URL, or token hash.

## 7. Requirement Review Acceptance

- [ ] Only Admin can review requirements.
- [ ] Portal cannot directly change requirement status.
- [ ] `not_submitted -> approved` is rejected.
- [ ] `submitted -> approved` succeeds.
- [ ] `submitted -> needs_more` succeeds with reason or customer instruction.
- [ ] `approved -> needs_more` requires reason or customer instruction.
- [ ] `needs_more` can update customer instruction.
- [ ] `internalNote` is saved only internally.
- [ ] `internalNote` does not enter Portal DTO or timeline metadata.
- [ ] `approved` is displayed to Portal as `accepted`.
- [ ] Review writes `requirement_status_changed` timeline event.
- [ ] Timeline metadata contains only requirement ID, old status, new status, and safe reason.

## 8. Office Requirement Acceptance

- [ ] Office-responsible requirements can be managed by Admin.
- [ ] Office-responsible requirements default to `portalVisible = false`.
- [ ] Office-only requirement details are not visible to Portal.
- [ ] Office-only files are not downloadable through Portal unless explicitly exposed by visibility/download flags.
- [ ] Office upload writes `file_uploaded` timeline event.

## 9. Application Confirmation Acceptance

- [ ] `ApplicationConfirmation` supports multiple versions.
- [ ] Admin can create a new confirmation version.
- [ ] Creating a new version may supersede old pending versions.
- [ ] Portal can operate only on latest actionable version.
- [ ] Old versions cannot be confirmed or revised through Portal.
- [ ] Confirmed version cannot change status again.
- [ ] Changes after confirmation require a new version.
- [ ] Portal confirm sets status to `confirmed` and records `confirmedAt`.
- [ ] Portal revision request sets status to `needs_revision`.
- [ ] Revision comment is not stored long-term in structured form.
- [ ] Revision comment is not written to timeline metadata.
- [ ] Portal confirmation DTO does not expose storage path, storage bucket, signed URL, token hash, or internal note.

## 10. Immigration Additional Requirement Acceptance

- [ ] Admin can add immigration additional requirements manually.
- [ ] Immigration additional requirements do not depend on templates.
- [ ] `sourceType` is fixed to `immigration_request`.
- [ ] `responsibleParty` can be customer or office.
- [ ] Customer immigration requirements default to `portalVisible = true`.
- [ ] Office immigration requirements default to `portalVisible = false`.
- [ ] `portalDownloadable` defaults to false.
- [ ] `portalDownloadable = true` forces `portalVisible = true`.
- [ ] Adding a requirement writes `requirement_created` timeline event.
- [ ] Optional `setCasePhase=true` moves the case to `collecting_documents`.
- [ ] Adding immigration requirements does not create templates, files, or tokens.

## 11. Case Phase Acceptance

- [ ] Case phase enum is fixed to the documented V1 values.
- [ ] Only Admin can change case phase.
- [ ] Portal cannot change case phase.
- [ ] Case phase changes do not automatically change requirement status.
- [ ] Missing required requirements produce warnings before `submitted`.
- [ ] Warnings do not block phase change.
- [ ] `approved` is the terminal V1 case phase.
- [ ] Rollback requires reason.
- [ ] Immigration additional requirements do not automatically create other requirements.
- [ ] Phase changes write `case_phase_changed` timeline event.
- [ ] Timeline metadata contains only allowed phase-change fields and safe values.

## 12. Timeline Acceptance

- [ ] Important operations write timeline events.
- [ ] Timeline events are written by service layer, not UI or route business logic.
- [ ] Portal does not receive full timeline data.
- [ ] Timeline metadata forbids plaintext token, token hash, signed URL, storage path, storage bucket, original filename, passport number, residence card number, raw cookies, authorization headers, and secrets.
- [ ] Timeline display in Admin UI does not show raw metadata JSON.

## 13. Portal Safety Acceptance

- [ ] Portal routes call only `portalServices`.
- [ ] Portal routes do not import `adminServices`.
- [ ] Portal routes do not import Prisma directly.
- [ ] Portal routes do not receive or trust `caseId`.
- [ ] Portal DTOs do not include internal note, storage path, storage bucket, token hash, plaintext token, passport number, residence card number, original filename, metadata, actor fields, internal operator info, or signed URL.
- [ ] Signed URL responses are the only Portal responses allowed to include `signedUrl`.
- [ ] Signed URL responses include only `signedUrl` and `expiresAt`.
- [ ] Portal errors do not reveal resource existence or token status.

## 14. Admin API Boundary Acceptance

- [ ] Admin routes call `requireAdminAuth`.
- [ ] Admin mutation routes call `requireAdminCsrf`.
- [ ] Admin routes call only `adminServices`.
- [ ] Admin routes do not import `portalServices`.
- [ ] Admin routes do not import Prisma directly.
- [ ] Admin routes do not write DB, Storage, or timeline directly.
- [ ] Admin routes return explicit DTOs, not Prisma models.
- [ ] Admin mutation responses do not include token hash, raw storage fields, signed URL, request metadata, or Prisma internals.
- [ ] Plaintext token appears only in token create/regenerate responses.

## 15. Admin UI Acceptance

- [ ] `/admin/cases` shows case list, loading state, empty state, and safe error state.
- [ ] `/admin/cases/new` supports Customer search/reuse and new Customer creation.
- [ ] `/admin/cases/new` supports create case, apply template, and create Portal token.
- [ ] `/admin/cases/[caseId]` shows summary, Customer profile, requirements, application confirmations, token card, and timeline.
- [ ] Admin UI calls API routes only.
- [ ] Admin UI does not import Prisma, `adminServices`, or `portalServices`.
- [ ] Admin UI does not access Supabase Storage directly.
- [ ] Admin UI does not cache signed URLs.
- [ ] Admin UI does not persist plaintext token.
- [ ] Plaintext token is shown only once and cleared when modal closes.
- [ ] Mutation modals have consistent loading, error, success, reset, confirm, and warning behavior.
- [ ] UI displays `SERVER_CONFIGURATION_ERROR` without secret values.
- [ ] UI is responsive on narrow and medium screens.
- [ ] Development-only warning remains visible until production auth/deployment are complete.

## 16. Admin Auth Acceptance

- [ ] Admin uses Auth.js / NextAuth session auth.
- [ ] Portal continues to use token auth and remains independent.
- [ ] `User` means Admin auth user.
- [ ] `Customer` means visa applicant/client.
- [ ] Google OAuth uses allowlist.
- [ ] Allowlist outside users cannot create active sessions.
- [ ] `requireAdminAuth` validates real session.
- [ ] Disabled Admin users cannot access Admin pages or Admin APIs.
- [ ] Middleware protects `/admin/*` for UX.
- [ ] API routes still use route-level auth.
- [ ] `AdminAuthAudit` records login success, login failure, and logout.
- [ ] Auth audit metadata does not contain passwords, session tokens, provider tokens, Portal tokens, signed URLs, raw cookies, authorization headers, or secrets.

## 17. Environment Readiness Acceptance

- [ ] `TOKEN_HASH_SECRET` is required for token create and validation.
- [ ] Missing `TOKEN_HASH_SECRET` maps to `SERVER_CONFIGURATION_ERROR`.
- [ ] Configuration error responses do not reveal env values, secret names with values, stack traces, or internal details.
- [ ] No fallback secret is generated.
- [ ] Changing `TOKEN_HASH_SECRET` is documented as invalidating existing Portal tokens.
- [ ] Storage env variables are checked only on Storage-dependent paths.
- [ ] `npm run env:check` reports required env readiness using only redacted values.
- [ ] `npm run env:check` never prints secrets, tokens, signed URLs, or full database URLs.

## 18. Admin CSRF Acceptance

- [ ] Unauthenticated `/api/admin/*` mutation requests return `ADMIN_AUTH_REQUIRED`.
- [ ] Authenticated Admin mutation requests without `admin_csrf_token` return `ADMIN_CSRF_REQUIRED`.
- [ ] Authenticated Admin mutation requests without `X-CSRF-Token` return `ADMIN_CSRF_REQUIRED`.
- [ ] Authenticated Admin mutation requests with mismatched cookie/header return `ADMIN_CSRF_REQUIRED`.
- [ ] Authenticated Admin mutation requests with matching cookie/header proceed to the service layer.
- [ ] `GET /api/admin/csrf` requires Admin auth.
- [ ] `GET /api/admin/csrf` sets `admin_csrf_token` when missing.
- [ ] `GET /api/admin/csrf` does not return the token in the response body.
- [ ] CSRF failure writes `AdminAuthAudit` event `csrf_failure`.
- [ ] CSRF audit metadata contains only safe reason, path, and method.
- [ ] CSRF audit metadata does not contain cookie value, header value, session token, Portal token, signed URL, storage path, storage bucket, or secrets.
- [ ] Admin UI mutation helpers send `X-CSRF-Token`.
- [ ] Admin UI does not store CSRF token in localStorage, sessionStorage, or IndexedDB.
- [ ] `/api/portal/*` routes are not affected by Admin CSRF.

## 19. Rate Limit Contract Acceptance

- [ ] Rate limit goals are documented: token guessing, upload abuse, signed URL abuse, Admin auth brute force, and Admin mutation abuse.
- [ ] Portal route groups are frozen: `portal_case`, `portal_signed_url`, `portal_upload`, `portal_confirmation`.
- [ ] Admin route groups are frozen: `admin_mutation`, `admin_destructive`, `admin_token_mutation`, `admin_upload`.
- [ ] Auth route groups are frozen: `admin_login`, `auth_callback`.
- [ ] Admin authenticated limiter keys use `adminId + routeGroup`.
- [ ] Admin unauthenticated/login limiter keys use `IP + routeGroup`.
- [ ] Portal pre-validation limiter keys use `IP + routeGroup`.
- [ ] Portal post-validation limiter keys use `tokenId/caseId + routeGroup`.
- [ ] Upload limiter keys use `tokenId/adminId + requirementId`.
- [ ] Plaintext Portal token is never used as a limiter key.
- [ ] `tokenHash` is never written to audit metadata.
- [ ] Reserved error code `RATE_LIMITED` maps to HTTP `429`.
- [ ] `RATE_LIMITED` response message is `Too many requests. Please try again later.`
- [ ] `Retry-After` header is returned when retry timing is available.
- [ ] Admin UI Chinese copy is represented as Unicode escapes: `\u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002`
- [ ] `AdminAuthAudit` event `rate_limit_triggered` is used for rate limit audit.
- [ ] Rate limit audit metadata may contain only route group, method, path, key type, limit, window seconds, retry-after seconds, and reason.
- [ ] Rate limit audit metadata does not contain plaintext Portal token, `tokenHash`, session token, CSRF token, provider token, signed URL, storage path, storage bucket, raw cookie, authorization header, or secrets.
- [ ] Local/dev may use optional in-memory limiter only for development behavior checks.
- [ ] Production uses Redis/KV-backed limiter such as Upstash Redis or Vercel KV.
- [ ] Business PostgreSQL is not used as the long-term limiter store.
- [ ] Default unit tests do not depend on external limiter infrastructure.
- [ ] Production is blocked until a real Redis/KV-backed limiter exists.

## 20. In-memory Rate Limit Guard Acceptance

- [ ] `lib/rate-limit/*` contains adapter interface, in-memory adapter, policies, key generation, errors, limiter guards, and audit helper.
- [ ] Admin token mutation routes are protected by `admin_token_mutation`.
- [ ] Admin upload route is protected by `admin_upload`.
- [ ] Admin destructive/high-impact mutation routes are protected by `admin_destructive`.
- [ ] Portal case route is protected by `portal_case`.
- [ ] Portal signed URL routes are protected by `portal_signed_url`.
- [ ] Portal upload route is protected by `portal_upload`.
- [ ] Admin mutation order is auth, CSRF, rate limit, service.
- [ ] Portal route order is pre-validation IP limiter, token validation, post-validation limiter, service.
- [ ] Over-limit requests return `RATE_LIMITED` with HTTP `429`.
- [ ] Over-limit responses include `Retry-After` when available.
- [ ] Over-limit requests do not call protected service methods.
- [ ] Rate limit audit metadata follows the frozen safe metadata contract.
- [ ] Audit failure does not fail the request.
- [ ] Limiter keys never use plaintext Portal token.
- [ ] Limiter keys never use `tokenHash`.
- [ ] No Redis/KV dependency is introduced in this phase.
- [ ] OAuth callback and `/admin/login` are not rate limited in this phase.
- [ ] Readonly Admin `GET` routes are not rate limited in this phase.
- [ ] In-memory limiter is documented as not production-grade.

## 21. Upstash Rate Limit Adapter Acceptance

- [ ] `RATE_LIMIT_BACKEND` supports `memory` and `upstash`.
- [ ] `memory` backend is allowed only for local/dev/demo and test use.
- [ ] `memory` backend is rejected when `NODE_ENV=production`.
- [ ] `upstash` backend requires `UPSTASH_REDIS_REST_URL`.
- [ ] `upstash` backend requires `UPSTASH_REDIS_REST_TOKEN`.
- [ ] Missing Upstash env returns a safe server configuration error.
- [ ] Upstash adapter uses atomic Redis increment, first-hit expiry, and TTL read.
- [ ] `Retry-After` is derived from Redis TTL.
- [ ] Default unit tests mock Upstash and do not use external network.
- [ ] Upstash REST URL/token are never logged, returned, or written to audit metadata.
- [ ] Limiter raw keys are never logged or returned.
- [ ] Route-level Admin and Portal limiter APIs do not change.
- [ ] Production readiness requires `RATE_LIMIT_BACKEND=upstash`.

## 22. V1 Scope Acceptance

- [ ] V1 does not implement AI.
- [ ] V1 does not implement OCR.
- [ ] V1 does not implement multi-employee permission matrices.
- [ ] V1 does not implement chat.
- [ ] V1 does not implement payment.
- [ ] V1 does not implement mobile apps.
- [ ] V1 does not implement customer registration.
- [ ] V1 does not implement customer login.
- [ ] V1 does not implement complex notification systems.
- [ ] V1 does not implement automatic form filling.
- [ ] V1 does not implement third-party visa system integration.

## 23. Admin Notification Acceptance

- [ ] `AdminNotification` is a separate model and is not mixed into `TimelineEvent`.
- [ ] Admin notification metadata never contains plaintext Portal token, `tokenHash`, signed URL, storage path, storage bucket, session token, CSRF token, provider token, raw cookie, authorization header, passport number, residence card number, or secrets.
- [ ] Portal material submission creates an unread Admin notification.
- [ ] Portal application confirmation creates an unread Admin notification.
- [ ] Portal application revision request creates an unread warning Admin notification.
- [ ] Portal rate limit trigger may create an unread warning Admin notification.
- [ ] `GET /api/admin/notifications` requires Admin auth.
- [ ] Notification read mutation APIs require Admin auth, Admin CSRF, and Admin rate limit.
- [ ] Notification API routes only call `adminServices`.
- [ ] Notification API routes do not import Prisma or `portalServices`.
- [ ] Admin header displays unread notification count.
- [ ] Admin header notification dropdown displays recent unread notifications.
- [ ] Clicking a case-related notification can navigate to the corresponding case.
- [ ] V1 does not send customer email, LINE, WeChat, browser push, or scheduled reminders.
