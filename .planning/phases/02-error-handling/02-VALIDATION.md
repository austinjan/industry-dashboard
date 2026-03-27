---
phase: 2
slug: error-handling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go testing + testify v1.10.0 |
| **Config file** | none — `go test ./...` convention |
| **Quick run command** | `make test` |
| **Full suite command** | `make test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/apierr/... -v`
- **After every plan wave:** Run `make test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ERR-01 | unit | `go test ./internal/apierr/... -v` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | ERR-03 | unit | `go test ./internal/apierr/... -run TestWrite_LogFields -v` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | ERR-01 | static check | `grep -rn "http\.Error" internal/ cmd/` returns 0 lines | N/A — shell verify | ⬜ pending |
| 02-02-01 | 02 | 1 | ERR-01 | unit | `go test ./internal/auth/... -run TestAuthMiddleware -v` | ✅ needs update | ⬜ pending |
| 02-02-02 | 02 | 1 | ERR-03 | integration | `go test ./internal/auth/... -run TestAuthMiddleware_RequestID -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/apierr/apierr_test.go` — stubs for ERR-01 (JSON shape) and ERR-03 (slog fields)
- [ ] Capture slog output in tests: use `slog.New(slog.NewTextHandler(&buf, nil))` temporarily

*Existing `middleware_test.go` tests check status code only — response body assertions for `{code, message}` shape need to be added as part of the auth middleware conversion task.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No `http.Error()` calls remain | ERR-01 | grep-based static check, not a test framework assertion | `grep -rn "http\.Error" internal/ cmd/` must return 0 lines |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
