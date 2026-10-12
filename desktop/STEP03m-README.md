# Step03m — atomic browser preference publication (3단계 부분 구현)

Browser profile selection is persistent and must not be silently changed between
Edge and Chrome, since each profile can hold distinct IndexedDB projects.

The first-launch `launcher-browser.json` now uses a fully written, fsynced
private temporary file and no-overwrite `os.Link` publication, matching the
previous host-preference safety policy. On a concurrent first launch, each
process rereads the published winner before choosing the browser family.
Existing valid or damaged preference bytes are never overwritten or migrated.

New regression coverage: concurrent 24-launch race with opposed candidate
order, legacy/corrupt preference preservation, and symlink rejection.

No frontend, project format, WebView2 COM ABI, or existing user profile is
modified. Windows GUI and actual project persistence remain unverified.
