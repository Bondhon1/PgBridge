# PgBridge

Cross-platform Electron desktop app to migrate PostgreSQL databases from a source URL to a target URL using bundled PostgreSQL binaries.

## Features

- Source and target PostgreSQL URL input
- One-click migration flow
- Target DB non-empty check with confirmation modal
- Uses bundled `pg_dump` and `pg_restore` binaries (no system PostgreSQL required)
- Passwords passed using `PGPASSWORD` and redacted in logs
- Electron IPC architecture with secure preload bridge

## Project Layout

- `src/main.js`: Electron main process and migration logic
- `src/preload.js`: Safe renderer API bridge
- `src/renderer.js`: UI logic
- `ui/index.html`, `ui/style.css`: App interface
- `resources/postgres/`: Place PostgreSQL binaries here

## Setup

1. Install dependencies:

```bash
npm install
```

2. Place PostgreSQL binaries in `resources/postgres`:

- Windows: `pg_dump.exe`, `pg_restore.exe`
- macOS/Linux: `pg_dump`, `pg_restore`

3. Run in development:

```bash
npm start
```

## Build Windows Installer

```bash
npm run build
```

Output will be generated in `dist/`.

## Notes

- URL format must be `postgres://...` or `postgresql://...`
- If target DB has existing tables, confirmation is required before migration
- Temporary dump files are cleaned up automatically