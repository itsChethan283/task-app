# Task Manager (Cloud Sync)

This is a Next.js task manager app with Supabase authentication and database storage.

Users can sign in from any system and continue with the same tasks.

UI and behavior follow the DailyTracker style:

- Light/Dark mode toggle
- Daily Tasks and Open Tasks columns
- Priority by starting task text with `#`, `##`, `###`, etc.
- Priority-aware sorting and progress stats

## 1) Configure Supabase

1. Create a Supabase project.
2. In Supabase SQL Editor, run [supabase/schema.sql](supabase/schema.sql).
3. In Supabase Authentication settings, enable email/password sign-in.
4. Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

If you already created the table previously, run [supabase/schema.sql](supabase/schema.sql) again so `category` and `importance` columns are added.

## 2) Run the app

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 3) Deploy (Vercel)

1. Push this project to GitHub.
2. Go to Vercel and import the GitHub repository.
3. In Vercel Project Settings -> Environment Variables, add:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Deploy.
5. Open the Vercel URL from any device and log in.

Notes:

- Keep using the same Supabase project so tasks are shared across devices.
- If sign-up should not require email confirmation, disable it in Supabase Authentication -> Providers -> Email.

## App routes

- `/login` for sign in / sign up
- `/tasks` for Daily/Open task management

## Stack

- Next.js App Router
- Supabase Auth
- Supabase Postgres (with RLS)

## Troubleshooting

### Login or tasks not loading

1. Recheck values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

2. In Supabase, verify email/password auth is enabled.
3. In Supabase SQL Editor, run [supabase/schema.sql](supabase/schema.sql).
4. Restart dev server after any `.env.local` changes.
