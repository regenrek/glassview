# Changelog

## Unreleased

### Added

- Private-by-default screenshot sharing with AES-GCM encryption before upload.
- Browser-side Web Crypto decrypt in the viewer using `#k=<decrypt-key>` URL fragments.
- Expiring links with configurable TTL values such as `1h`, `24h`, `7d`, and `30d`.
- Revocation support via `POST /api/screenshots/:id/revoke` and `DELETE /api/screenshots/:id`.
- Encrypted `/blob/:id` route for private ciphertext and public-only `/raw/:id` route.
- `pnpm verify:private` end-to-end smoke test covering CLI upload, ciphertext storage, browser decrypt, expiry, revocation, and `/latest` lockdown.

### Changed

- `/latest` is token-gated by default unless `GLASSVIEW_ENABLE_LATEST=true`.
- Private uploads omit plaintext label, source URL, app name, viewport, and note metadata.
- Viewer responses now include noindex, no-referrer, no-store, and CSP headers.
- README and docs now focus on private encrypted expiring links, explicit public mode, revocation, and team-mode deployment.
- Alchemy deploy now binds share-mode, TTL, latest, and encryption environment settings into the Worker.

### Security

- Stored private screenshots are ciphertext in R2 and cannot be read by the Worker/R2 operator without the fragment key.
- URL fragment keys are not sent to the Worker in HTTP requests.
- Local security checks skip installed `node_modules` for Trivy repo scans to avoid third-party template noise.
