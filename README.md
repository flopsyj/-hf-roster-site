# High Functioning — Clan Stats Tracker

A standalone web app for tracking Diablo Immortal clan roster stats, Shadow War teams, and weekly war attendance, with Excel export.

## What this is

This was converted from a Claude artifact prototype into a real deployable site so it can be shared with all clan members via a normal URL (Discord, text, etc.) instead of requiring a Claude account.

- **Officers** get full roster access behind a passcode (default `hf2026` — change this immediately, see below).
- **Members** self-report their own Class, Combat Power, Resonance, and primary/secondary stats using their in-game name + a passcode they set themselves. They can't see or edit anyone else's data.
- **Officers** control Role, Shadow War Team assignment, active status, and weekly war attendance (Thursday/Saturday checkboxes with a rolling attendance %).
- **Export to Excel** any time — pulls Roster, full Attendance Log, and a Summary tab into one .xlsx file.

## One-time setup (about 10–15 minutes)

### 1. Create a free Supabase project
1. Go to https://supabase.com and sign up (free tier is plenty for this).
2. Create a new project. Pick any name/region, set a database password (you won't need to remember this — just don't lose the project).
3. Once it's ready, go to **Project Settings > API**. You'll need two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key** (a long string under "Project API keys")

### 2. Set up the database tables
1. In your Supabase project, go to **SQL Editor > New Query**.
2. Open `supabase-schema.sql` from this project, copy all of it, paste it into the query editor, and click **Run**.
3. This creates the `members`, `attendance`, and `app_settings` tables and sets the default officer passcode to `hf2026`.

### 3. Deploy to Vercel
1. Go to https://vercel.com and sign up (free tier).
2. Click **Add New Project**, and import this codebase (upload it as a folder, or push it to a GitHub repo first and import from there — GitHub import is easier for future updates).
3. When Vercel asks for **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL from step 1
   - `VITE_SUPABASE_ANON_KEY` = your anon public key from step 1
4. Click **Deploy**. After a minute or two you'll get a live URL like `high-functioning-roster.vercel.app`.

That URL is what you post in Discord or send directly to clan members. Nobody needs a Claude account, a Supabase account, or a Vercel account to use the app — only you need those, and only for setup/maintenance.

### 4. Change the default passcode
The officer passcode starts as `hf2026`. To change it:
1. In Supabase, go to **Table Editor > app_settings**.
2. Find the row where `key = owner_passcode`, edit `value` to whatever you want.
3. Save. The new passcode takes effect immediately — no redeploy needed.

## Local development (optional)

If you want to run this on your own machine before deploying:

```bash
npm install
# create a .env.local file with:
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
npm run dev
```

## Notes on security

This app uses passcodes for access control, not real authentication — that's intentional, since it's a clan tool for ~125 people, not a banking app. Anyone with basic technical knowledge and access to your Supabase project's anon key could theoretically query the data directly. The anon key is meant to be public-ish (it's embedded in the deployed site's JS bundle), but don't store anything in this database you wouldn't want a determined member to be able to find.

## Making changes later

The source lives in `src/App.jsx` — it's one file by design, so it's easy to hand back to Claude for edits. If you redeploy after changes (via Vercel, or by re-pushing to GitHub if you set it up that way), existing data in Supabase is untouched — the database and the website are separate, so you can update the site without ever wiping member data.
