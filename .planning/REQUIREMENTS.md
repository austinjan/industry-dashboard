# Requirements: Industry Dashboard

**Defined:** 2026-03-27
**Core Value:** Real-time visibility into factory operations with customizable dashboards that adapt to each site's monitoring needs.

## v0.0.3 Requirements

Requirements for milestone v0.0.3: Local Auth, Error Handling & Release Validation.

### Local Authentication

- [x] **AUTH-01**: User can register with email and password (guest role assigned)
- [x] **AUTH-02**: User can login with email and password (JWT issued)
- [x] **AUTH-03**: Auth endpoints are rate-limited to prevent brute force

### SSO Binding

- [x] **SSO-01**: Authenticated user can link their Microsoft Entra ID from an account page
- [x] **SSO-02**: Account page shows login status (local password set, Microsoft SSO linked or not)

### Error Handling

- [x] **ERR-01**: Backend uses structured JSON error responses ({code, message}) across all handlers
- [ ] **ERR-02**: Frontend displays errors inline next to the relevant field or component
- [x] **ERR-03**: All errors are captured in system logs with structured logging (slog) and request context

### Release Validation

- [ ] **REL-01**: Full release pipeline works (build, download, initialize) following deploy.md
- [ ] **REL-02**: Dev login bypass is confirmed disabled in production builds

## Future Requirements

### Email Infrastructure
- **EMAIL-01**: User receives email verification after registration
- **EMAIL-02**: User can reset password via email link

### Security Hardening
- **SEC-01**: Timing-attack-safe login (dummy bcrypt compare on user-not-found)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email verification | No email-sending infrastructure; guest role provides immediate access |
| Password reset | Requires email infrastructure; defer to future milestone |
| Toast notifications | User prefers inline error display |
| Timing-attack-safe login | Deferred — not selected for v0.0.3 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| SSO-01 | Phase 4 | Complete |
| SSO-02 | Phase 4 | Complete |
| ERR-01 | Phase 2 | Complete |
| ERR-02 | Phase 3 | Pending |
| ERR-03 | Phase 2 | Complete |
| REL-01 | Phase 5 | Pending |
| REL-02 | Phase 5 | Pending |

**Coverage:**
- v0.0.3 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
