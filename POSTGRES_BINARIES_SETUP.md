# PostgreSQL Binaries Setup Guide

This guide explains exactly how to place the required PostgreSQL tools in this project so PgBridge can run migrations without relying on a system PostgreSQL installation at runtime.

Required files:

- Windows: `pg_dump.exe` and `pg_restore.exe`
- macOS/Linux: `pg_dump` and `pg_restore`

Target folder in this project:

- `resources/postgres/`

---

## 1. Confirm your project location

From your terminal, move to the project root:

```powershell
cd F:\tmp\projects\PgBridge
```

Confirm folder exists:

```powershell
Get-ChildItem .\resources\postgres
```

If the folder is missing:

```powershell
New-Item -ItemType Directory -Path .\resources\postgres -Force
```

---

## 2. Windows setup (pg_dump.exe, pg_restore.exe)

### Step 2.1 Install PostgreSQL client tools

Use one of these options:

- Install full PostgreSQL from https://www.postgresql.org/download/windows/
- Or install only client tools from a package manager you trust

### Step 2.2 Locate binaries

Default install path examples:

- `C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`
- `C:\Program Files\PostgreSQL\16\bin\pg_restore.exe`

If you are unsure where they are, run:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter pg_restore.exe -ErrorAction SilentlyContinue
```

### Step 2.3 Copy to project folder

```powershell
Copy-Item "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" ".\resources\postgres\"
Copy-Item "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" ".\resources\postgres\"
```

### Step 2.4 Verify files exist

```powershell
Get-ChildItem .\resources\postgres\pg_*.exe
```

Expected:

- `pg_dump.exe`
- `pg_restore.exe`

### Step 2.5 Verify executables run

```powershell
.\resources\postgres\pg_dump.exe --version
.\resources\postgres\pg_restore.exe --version
```

---

## 3. macOS setup (pg_dump, pg_restore)

### Step 3.1 Install PostgreSQL client tools

Homebrew example:

```bash
brew install postgresql@16
```

### Step 3.2 Locate binaries

```bash
which pg_dump
which pg_restore
```

If `which` returns nothing, find them:

```bash
find /opt/homebrew /usr/local -name pg_dump 2>/dev/null
find /opt/homebrew /usr/local -name pg_restore 2>/dev/null
```

### Step 3.3 Copy to project folder

From project root:

```bash
cp "$(which pg_dump)" ./resources/postgres/pg_dump
cp "$(which pg_restore)" ./resources/postgres/pg_restore
```

### Step 3.4 Set executable permissions

```bash
chmod +x ./resources/postgres/pg_dump ./resources/postgres/pg_restore
```

### Step 3.5 Verify

```bash
./resources/postgres/pg_dump --version
./resources/postgres/pg_restore --version
```

---

## 4. Linux setup (pg_dump, pg_restore)

### Step 4.1 Install PostgreSQL client tools

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y postgresql-client
```

Fedora/RHEL/CentOS:

```bash
sudo dnf install -y postgresql
```

### Step 4.2 Locate binaries

```bash
which pg_dump
which pg_restore
```

### Step 4.3 Copy to project folder

From project root:

```bash
cp "$(which pg_dump)" ./resources/postgres/pg_dump
cp "$(which pg_restore)" ./resources/postgres/pg_restore
```

### Step 4.4 Set executable permissions

```bash
chmod +x ./resources/postgres/pg_dump ./resources/postgres/pg_restore
```

### Step 4.5 Verify

```bash
./resources/postgres/pg_dump --version
./resources/postgres/pg_restore --version
```

---

## 5. Build and packaging rules

Important:

- Build each OS package on that OS with matching binaries.
- Windows package must include `.exe` files.
- macOS/Linux package must include non-`.exe` files.
- Do not ship mixed binaries in one package.

The app already bundles `resources/postgres` using `extraResources` in `package.json`.

---

## 6. Quick pre-run checklist

Before running migrations:

1. `resources/postgres` contains both required binaries for your OS.
2. Running `--version` works for both tools.
3. App starts with `npm start`.
4. Migration URLs are valid (`postgres://` or `postgresql://`).

---

## 7. Troubleshooting

### Error: Missing PostgreSQL binary

Cause:

- One or both files are not in `resources/postgres`.

Fix:

- Copy the correct binaries again and rerun.

### Error: Permission denied (macOS/Linux)

Cause:

- Executable bit is not set.

Fix:

```bash
chmod +x ./resources/postgres/pg_dump ./resources/postgres/pg_restore
```

### Error: app builds, but migration fails in packaged app

Cause:

- Wrong binary type was bundled for the OS.

Fix:

- Rebuild on the target OS with OS-correct binaries in `resources/postgres`.
