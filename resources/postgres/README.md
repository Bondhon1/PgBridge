This folder contains the portable PostgreSQL runtime used by PgBridge.

Windows structure:

- `pg_dump.exe.cmd` and `pg_restore.exe.cmd`: wrappers used by the app
- `bin/pg_dump.exe`, `bin/pg_restore.exe`: bundled executables
- `bin/*.dll`: runtime dependencies required by those executables

The wrappers execute binaries from this folder only, so migration works without a system PostgreSQL install.
