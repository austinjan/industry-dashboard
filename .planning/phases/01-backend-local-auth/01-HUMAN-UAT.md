---
status: partial
phase: 01-backend-local-auth
source: [01-VERIFICATION.md]
started: 2026-03-27T10:30:00Z
updated: 2026-03-27T10:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Registration end-to-end with real DB
expected: POST /api/auth/register with email+password returns 201 with user JSON + access_token/refresh_token cookies
result: [pending]

### 2. Login with duplicate email (SSO vs local conflict)
expected: Register SSO user, then register same email locally → 409 with auth.email_taken code
result: [pending]

### 3. Rate limiter enforces 429 on 6th login attempt
expected: 6 POST /api/auth/login/local in <1min from same IP → first 5 return 401, 6th returns 429
result: [pending]

### 4. SeedDefaultAdmin creates admin on fresh DB
expected: Server start against empty DB → admin user exists with registered_via='local', Admin role assigned
result: [pending]

### 5. JWT accepted by existing RBAC middleware
expected: JWT from login used on GET /api/auth/me → 200 with user object
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
