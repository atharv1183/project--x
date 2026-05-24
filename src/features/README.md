# Features Folder

This folder is the new domain-first structure for CRM modules.

- `auth`: login/session flows
- `dashboard`: admin/employee dashboard composition
- `leads`: lead list, drill-down, follow-up workflows
- `inventory`: property inventory workflows
- `attendance`: clock-in/out and corrections
- `requirements`: buyer requirement workflows
- `notifications`: in-app + push notification logic
- `analytics`: performance and KPI modules
- `brokers`: broker management workflows
- `transfers`: lead transfer register logic
- `audit`: audit trail read/write helpers
- `tenancy`: tenant model, isolation helpers, onboarding primitives
- `super-admin`: platform-level tenant management

Legacy large components still exist in `src/components` and should be migrated
incrementally to this structure.

