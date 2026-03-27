# Phase 2: Error Handling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 02-error-handling
**Areas discussed:** Error response shape & codes, Structured logging strategy, Error code catalog, Migration approach

---

## Error Response Shape & Codes

| Option | Description | Selected |
|--------|-------------|----------|
| Promote auth/errors.go to shared package | Move apiError + writeError() to internal/apierr | ✓ |
| Keep per-package error helpers | Each package has its own error helper | |
| Use a third-party error library | e.g., cockroachdb/errors or pkg/errors | |

**User's choice:** "up to you" — delegated all decisions to Claude
**Notes:** User selected "up to you" for all areas. Claude chose to promote existing pattern to shared package since it's already proven in Phase 1.

---

## Structured Logging Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Integrated writeError + slog | Single function handles JSON response AND slog logging | ✓ |
| Separate logging middleware | Middleware catches error responses and logs them | |
| Manual slog calls per handler | Each handler calls slog independently | |

**User's choice:** "up to you" — delegated to Claude
**Notes:** Integrated approach chosen to prevent logging/response desync.

---

## Error Code Catalog

| Option | Description | Selected |
|--------|-------------|----------|
| Package-prefixed codes (auth.*, site.*) | Each package defines its own codes with dot prefix | ✓ |
| Central constants file | All codes defined in one file | |
| String enums per package | Typed constants per package | |

**User's choice:** "up to you" — delegated to Claude
**Notes:** Dot-prefix pattern already established in Phase 1 (auth.invalid_input, auth.email_taken).

---

## Migration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Package-by-package | Convert one package at a time, auth already done | ✓ |
| Big bang | Convert all files at once | |
| Compatibility wrapper | Wrap http.Error to emit JSON | |

**User's choice:** "up to you" — delegated to Claude
**Notes:** Package-by-package allows incremental verification. Auth package already converted in Phase 1.

---

## Claude's Discretion

- All four areas were delegated to Claude's discretion
- Shared writeError function signature details
- Migration order across packages
- Whether error codes are constants or inline strings

## Deferred Ideas

None — discussion stayed within phase scope
