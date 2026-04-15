# 🚀 PostgreSQL Migration Tool (Electron + Node.js)

## Goal

Build a cross-platform desktop application using Electron and Node.js that allows users to migrate a PostgreSQL database from a source URL to a target URL.

The tool must bundle PostgreSQL binaries (`pg_dump` and `pg_restore`) so users do NOT need PostgreSQL installed on their system.

---

## Core Features

1. Simple UI (minimal and clean):

   * Input field: Source Database URL
   * Input field: Target Database URL
   * Button: "Migrate"
   * Status area (logs / success / error)
   * Warning modal if target DB is not empty

2. Backend Logic:

   * Parse PostgreSQL connection URLs
   * Connect to target DB using `pg` library
   * Check if target DB has existing tables
   * If yes:

     * Show warning dialog: "This will delete all existing data"
     * Require user confirmation before proceeding

3. Migration Process:

   * Use bundled `pg_dump` to export source DB
   * Use bundled `pg_restore` to import into target DB
   * Use flags:

     * `--format=custom`
     * `--clean`
     * `--no-owner`

4. Security:

   * Extract password from DB URL
   * Pass password securely using environment variable `PGPASSWORD`
   * Do NOT expose password in logs

---

## Project Structure

* Use Electron
* Separate main process and renderer process
* Use IPC for communication

Example structure:

/project-root
/resources/postgres/
pg_dump.exe
pg_restore.exe
/src
main.js
preload.js
renderer.js
ui/
index.html
style.css
package.json

---

## Technical Requirements

### Node.js

* Use `child_process.execFile` to run binaries
* Use `pg` package for DB checking
* Use async/await

### Electron

* Use preload script with contextBridge
* Do NOT enable nodeIntegration in renderer
* Keep UI minimal and clean

---

## Functions to Implement

1. checkTargetDB(connectionString)

   * Connect using pg Client
   * Query information_schema.tables
   * Return true if tables exist

2. dumpDatabase(sourceUrl)

   * Execute pg_dump from bundled path
   * Output file: temp dump file

3. restoreDatabase(targetUrl)

   * Execute pg_restore
   * Drop existing schema using `--clean`

4. migrate(sourceUrl, targetUrl)

   * Check target DB
   * If not empty → send warning to UI
   * If confirmed:

     * dumpDatabase
     * restoreDatabase
   * Send progress/status updates to UI

---

## UI Requirements

* Clean dark theme
* Centered container
* No clutter
* Use plain HTML + CSS (no frameworks)

UI Elements:

* Two input fields
* One button
* Status text
* Optional progress indicator

---

## Packaging

* Use electron-builder
* Bundle `/resources/postgres` binaries using `extraResources`
* Output Windows `.exe`

---

## Extra Features (Optional but preferred)

* Show real-time logs from pg_dump / pg_restore
* Progress indicator
* Error handling with user-friendly messages
* Validate DB URLs before execution

---

## Constraints

* Do NOT use Prisma
* Do NOT rely on system-installed PostgreSQL
* Must work offline(or online for online servers)
* Code should be modular and readable

---

## Output Expectation

Generate:

* Complete Electron app
* Working backend logic
* Clean UI
* Ready-to-build project
