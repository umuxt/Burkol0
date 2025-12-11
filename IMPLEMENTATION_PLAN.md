# Critical Backend Fixes: Session IDs & Cloudflare Storage

## Phase 1: Fix User Creation (Session ID Collisions)
**Objective**: Switch from Stateful Counter to Stateless UUID for Session IDs to prevent Vercel resets from causing DB errors.

- [ ] Update `WebApp/server/auth.js`
    - Replace `generateSessionId` logic with `crypto.randomUUID()`.
    - Remove `memory.systemConfig` counter logic.
- [ ] Verify
    - Create a new user (via API or UI).
    - Check DB for new session ID format (UUID).

## Phase 2: Implement Cloudflare R2 Storage
**Objective**: Replace local filesystem storage with Cloudflare R2 for Vercel compatibility.

- [ ] Create `WebApp/server/storage.js`
    - Implement S3 Client using `@aws-sdk/client-s3`.
    - Add `uploadFile` and `deleteFile` methods targeting Cloudflare R2.
- [ ] Update `WebApp/server/fileHandler.js`
    - Deprecate local FS methods.
    - Export wrapper functions utilizing `storage.js`.
- [ ] Update Controllers (Quotes)
    - Refactor `quoteController.js` to use `fileHandler` / `storage` instead of `fs.writeFileSync`.
- [ ] Environment Config
    - User needs to add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` to `.env`.

## Phase 3: Verification
- [ ] **Test Login**: Verify login works without "duplicate key" error.
- [ ] **Test File Upload**: Upload a file to a Quote and verify it persists (and check R2 bucket if possible).
