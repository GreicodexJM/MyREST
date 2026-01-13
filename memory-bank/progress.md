# Progress

## Completed
- [x] Basic CRUD operations
- [x] Advanced filtering and querying
- [x] PostgREST compatibility (Partial)
- [x] JWT Authentication Support
- [x] MySQL Session Variable Injection for RLS
- [x] Unit tests for JWT/RLS Logic
- [x] `--jwtRequired` flag for enforcing authentication
- [x] RPC Support (Stored Procedures/Functions via `/rpc/funcName`)
- [x] OpenAPI 3.0 Specification Generation (`/api/openapi.json`)

## In Progress
- [ ] Full PostgREST compatibility (Other minor features)

## Planned
- [ ] Integration tests for Security/RLS (end-to-end with DB)
- [ ] Support for other Auth providers?

## Known Issues
- MySQL RLS emulation requires manual View creation by the user.
