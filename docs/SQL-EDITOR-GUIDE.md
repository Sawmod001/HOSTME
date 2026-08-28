# Supabase SQL Editor — Complete Guide

## What Is Supabase SQL Editor?

Supabase SQL Editor is a **web-based tool** inside your Supabase dashboard that lets you write and run PostgreSQL commands directly against your database. Think of it as a terminal for your database, but inside your browser.

## How To Access It

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. You'll see a text editor where you can type SQL commands

## How To Run Migrations

### Method 1: Copy-Paste (Recommended for First Time)

1. Open the SQL Editor
2. Open `migration-phase1.sql` in your code editor (VS Code)
3. Select ALL the text in the file (Ctrl+A)
4. Copy it (Ctrl+C)
5. Paste it into the Supabase SQL Editor (Ctrl+V)
6. Click the **Run** button (or press Ctrl+Enter)
7. Wait for the "Success" message
8. Repeat for `migration-phase2.sql`

### Method 2: Upload File

1. Click the **Upload** button in SQL Editor
2. Select your `.sql` file
3. Click **Run**

## What Happens When You Run a Migration?

When you paste SQL and click Run, Supabase sends your SQL commands to the PostgreSQL database. The database executes them in order. If anything fails, PostgreSQL rolls back EVERYTHING (because we wrapped it in `BEGIN;...COMMIT;`).

## Understanding the Output

- **"Success"** — Everything worked. No errors.
- **"Error at line X"** — Something went wrong. The error message tells you what.
- **"0 rows affected"** — Normal for CREATE TABLE/INDEX commands (they don't return rows).
- **"INSERT 0 1"** — One row was inserted successfully.

## Common Errors

| Error | What It Means | How to Fix |
|-------|---------------|------------|
| `relation "X" already exists` | Table/index already created | Our migrations use `IF NOT EXISTS` so this is safe to ignore |
| `column "X" already exists` | Column already added | Our migrations use `ADD COLUMN IF NOT EXISTS` so this is safe |
| `constraint "X" already exists` | Constraint already exists | Our migrations handle this with `EXCEPTION WHEN duplicate_object` |
| `permission denied` | You're not using the service role key | Make sure you're logged in as the project owner |

## Why We Use Transactions

Every migration starts with `BEGIN;` and ends with `COMMIT;`. This means:

- If ANY command fails, PostgreSQL undoes everything that happened since `BEGIN`
- This prevents partial migrations (e.g., creating a table but not its indexes)
- It's like a "all or nothing" guarantee

## Why Two Phases?

We split migrations into two files because:

1. **Phase 1** fixes critical safety issues (race conditions, missing statuses, CSRF)
2. **Phase 2** adds new features (pricing engine, availability rules, outdoor space)

You should run Phase 1 FIRST, verify everything works, then run Phase 2. This way, if Phase 2 has issues, your critical safety fixes are already in place.

## After Running Migrations

1. Go to **Table Editor** in Supabase to see your new/modified tables
2. Check the **Columns** tab to verify new columns exist
3. Check the **Indexes** tab to verify new indexes were created
4. Run your app and test the new features

## Rollback (If Something Goes Wrong)

If you need to undo a migration, you would need to manually reverse the changes. That's why we test thoroughly before running in production. For critical issues, you can restore from a backup in the Supabase dashboard under **Database > Backups**.
