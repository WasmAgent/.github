# Maintainers

Roles and continuity for WasmAgent repositories. The ownership matrix lives in
[`docs/ownership-map.md`](docs/ownership-map.md); day-2 operational procedures
in [`docs/maintainer-continuity.md`](docs/maintainer-continuity.md).

## Roles

| Role | Scope |
|---|---|
| Maintainer | Full admin on org repositories; branch protection administration |
| Release maintainer | Cuts package releases (changesets), publishes npm artifacts |
| Protocol reviewer | Reviews `wasmagent-protocol` schema/spec/conformance changes |
| Runtime reviewer | Reviews Worker/deploy pipeline changes; owns R-gate evidence |
| Security reviewer | Reviews auth boundaries, secret handling, revocation semantics |
| Triage contributor | Labels and reproduces issues; no merge rights |

## Current state (recorded limitation)

```text
Active trusted maintainers: 1
```

There is currently a single active maintainer. Consequences, recorded
deliberately:

- `require_code_owner_reviews` is intentionally NOT enabled (it would deadlock
  the only authorized owner); branch protection relies on required CI instead.
- Bus factor is 1 for production operations (secrets, deploys, D1). See
  `docs/maintainer-continuity.md` for the documented recovery paths.
- Adding a second trusted maintainer is the highest-leverage continuity task.

## Adding a maintainer

1. Nominate in a public issue documenting contributions and review history.
2. Two-week comment window (nobody to approve it but the community record).
3. Grant role-scoped access — never blanket admin.
