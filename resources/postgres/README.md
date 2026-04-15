Place PostgreSQL binaries in this folder so the app can run without a system PostgreSQL install.

Required binaries:

- Windows: pg_dump.exe, pg_restore.exe
- macOS/Linux: pg_dump, pg_restore

These files are bundled into packaged builds via electron-builder extraResources.
