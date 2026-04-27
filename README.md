<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1e4126ec-8e20-4b11-a20d-e4978e54d655

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Phase 1 Auth Hardening (Implemented)

The project now uses direct employee provisioning from admin portal.

1. Admin creates employee directly from the Team screen.
2. System creates Firebase Auth account and user profile immediately.
3. Initial employee password is set to the employee mobile number.
4. Admin and employee can change password from Profile screen after login.

### Phase 1B Data Access Hardening (Implemented)

1. `users` collection is now restricted:
   - Admin can list all users.
   - Any signed-in user can only get their own user document.
2. Employee-to-employee transfer UI now reads from `employeeDirectory` (non-sensitive fields only).
3. `employeeDirectory` is synced when employees are activated, suspended, deleted, or restored.

### Phase 1C Automation (Implemented)

Two repeatable commands are now available:

1. Firestore rules tests (uses Firestore emulator)
   - `npm run test:rules`
   - Requires Java (`java -version` should work in terminal)
   - If Java was just installed, restart the terminal once to refresh PATH
2. Admin bootstrap (creates/updates Auth admin and Firestore admin profile)
   - `npm run bootstrap:admin`
3. Admin password reset (updates Firebase Auth password for an existing admin)
   - `npm run reset:admin-password`

Admin bootstrap requires these environment variables:

1. `ADMIN_PHONE`
2. `ADMIN_PASSWORD`

Optional environment variables:

1. `ADMIN_NAME` (default: `Platform Admin`)
2. `ADMIN_EMAIL` (default: `<ADMIN_PHONE>@estatepulse.com`)
3. `FIREBASE_PROJECT_ID` (default from `firebase-applet-config.json`)
4. `FIRESTORE_DATABASE_ID` (default from `firebase-applet-config.json`)
5. `FIREBASE_SERVICE_ACCOUNT_JSON` (inline JSON for service account credentials)

Credential notes for bootstrap script:

1. If `FIREBASE_SERVICE_ACCOUNT_JSON` is not set, the script uses Application Default Credentials.
2. You can set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key file path.
3. Both admin scripts also load `.env.local` and `.env` automatically when present.

Examples:

1. Reset password for existing admin with phone `8504899720`
   - `ADMIN_PHONE=8504899720`
   - `ADMIN_PASSWORD=<new-password>`
   - `npm run reset:admin-password`
2. Add a second admin account
   - `ADMIN_PHONE=<new-admin-phone>`
   - `ADMIN_PASSWORD=<new-admin-password>`
   - `ADMIN_NAME=<new-admin-name>`
   - `npm run bootstrap:admin`

### Important setup notes

1. Admin account is no longer hardcoded in frontend or Firestore rules.
2. Create admin either manually in Firebase Authentication plus Firestore, or use `npm run bootstrap:admin`.
3. If creating manually, add corresponding Firestore doc in `users/{authUid}` with:
   - `name` (string)
   - `email` (string)
   - `phone` (string)
   - `role: 'admin'`
   - `createdAt` (timestamp)
4. Deploy updated Firestore rules before using the latest auth flows.
   - `npx firebase deploy --only firestore:rules`
   - The included `firebase.json` deploys rules to both `(default)` and the app's named database.
