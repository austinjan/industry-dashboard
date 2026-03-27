---
phase: 1
slug: backend-local-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go testing + testify v1.10.0 |
| **Config file** | none (standard `go test ./...`) |
| **Quick run command** | `go test ./internal/auth/... -v` |
| **Full suite command** | `make test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go test ./internal/auth/... -v`
- **After every plan wave:** Run `make test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-01 | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocal -v` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-01 | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocalEmailTaken -v` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | AUTH-01 | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocalSSORejected -v` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | AUTH-02 | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocal -v` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | AUTH-02 | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocalWrongPassword -v` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | AUTH-02 | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocalUnknownEmail -v` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | AUTH-02 | unit (timing) | `go test ./internal/auth/... -run TestLoginLocalTiming -v` | ❌ W0 | ⬜ pending |
| 1-02-05 | 02 | 1 | AUTH-02 | unit (httptest) | `go test ./internal/auth/... -run TestProviders -v` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | AUTH-03 | unit (httptest) | `go test ./internal/auth/... -run TestRateLimit -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `internal/auth/local_test.go` — stubs for AUTH-01 (RegisterLocal variants), AUTH-02 (LoginLocal variants, timing)
- [ ] `internal/auth/providers_test.go` — stubs for AUTH-02 providers endpoint
- [ ] `internal/auth/ratelimit_test.go` — stubs for AUTH-03 rate limit

*Existing test infrastructure (Go testing + testify) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timing-safe comparison | AUTH-02 | Automated timing tests can be flaky under CI load | Run `TestLoginLocalTiming` locally; verify delta < 50ms across 10 runs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
