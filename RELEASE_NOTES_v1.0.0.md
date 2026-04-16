# PgBridge v1.0.0 (Windows)

Release date: 2026-04-16

## Highlights

- First Windows release of PgBridge desktop application.
- Offline-ready PostgreSQL migration workflow using bundled PostgreSQL client binaries.
- No dependency on system PostgreSQL installation at runtime when packaged correctly.

## Features

- Source and target PostgreSQL URL input flow.
- One-click migration process from source DB to target DB.
- Safety confirmation when target database is not empty.
- Secure password handling through environment variables.
- Migration logs with sensitive information redaction.

## Packaging and Runtime

- Windows installer generated with NSIS.
- PostgreSQL tools are bundled as app resources:
  - pg_dump.exe
  - pg_restore.exe
- Installer allows users to choose installation directory.

## Included Artifacts

- PgBridge Setup v1.0.0.exe

## Known Notes

- URL format must start with postgres:// or postgresql://.
- Windows package must include Windows PostgreSQL binaries only.

## Upgrade / Install

1. Download PgBridge Setup v1.0.0.exe.
2. Run the installer.
3. Launch PgBridge.
4. Enter source and target PostgreSQL URLs and run migration.

## Checks Performed Before Release

- Build completed with electron-builder Windows target.
- Packaged app includes postgres resource folder with required executables.
- Basic migration flow smoke-tested on Windows.

## Security and Reliability

- Sensitive values are redacted in logs.
- Temporary migration dump files are cleaned up automatically.

## Feedback

If you encounter issues, please open an issue with:

- Exact error message
- Steps to reproduce
- PostgreSQL versions on source and target
- Whether the issue occurs in development build or packaged app
