# EstatePulse Architecture (Multi-Tenant Ready)

## Target structure

- `src/app`: app shell, routing, providers, bootstrap.
- `src/features`: business modules grouped by domain.
- `src/shared`: shared types, utilities, config, UI primitives.
- `src/components`: legacy components (kept for safe migration).
- `src/lib`: legacy low-level utilities (kept for safe migration).

## Multi-tenant direction

Platform users (super admin) manage multiple client companies (tenants).  
Each tenant must have isolated data in Firestore.

### Tenant model

- Tenant document: `platformClients/{tenantId}`
- Tenant-scoped data (new path strategy):
  - `tenants/{tenantId}/users/{userId}`
  - `tenants/{tenantId}/leads/{leadId}`
  - `tenants/{tenantId}/requirements/{requirementId}`
  - `tenants/{tenantId}/inventory/{itemId}`
  - `tenants/{tenantId}/notifications/{notificationId}`
  - ...other CRM entities

### Super admin onboarding flow

1. Super admin creates tenant (`platformClients`).
2. Super admin creates tenant admin credentials.
3. Tenant admin logs in and sees only tenant-scoped data.
4. Tenant admin creates managers and employees under the same tenant.

## Migration strategy (safe incremental)

1. Keep current app running on existing collections.
2. Start writing new modules in `src/features/*`.
3. Introduce tenant-aware repositories/service layer.
4. Move one feature at a time to tenant paths.
5. After full migration, deprecate legacy `src/components` large files.

## Immediate implementation phases

1. Add tenant-aware Firestore path helpers (done in scaffolding).
2. Add tenantId on user profile and enforce in security rules.
3. Refactor Super Admin onboarding to create tenant admin + tenant membership.
4. Migrate lead and user queries to tenant-scoped paths first.
