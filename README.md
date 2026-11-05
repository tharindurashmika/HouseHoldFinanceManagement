# Tharindu & Sudu Household Finance — GitHub Pages + Supabase Cloud + iPhone PWA Edition

This folder (`github-supabase-pwa`) is a 100% static **Progressive Web App (PWA)** copy of your Household Finance Management System, engineered to:
1. Host for **FREE on GitHub Pages** (`https://<your-username>.github.io/<repo-name>/`).
2. Connect directly to your **Supabase PostgreSQL Database** so data stays synced in real time across **your iPhone**, **Sudu's phone**, and **your Laptop**.
3. Install onto your **iPhone Home Screen** as a full-screen standalone iOS App (`Safari ➔ Share ➔ Add to Home Screen`) with a mobile bottom navigation bar.

---

## Step 1: Set Up Your Free Supabase Database (2 Minutes)

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. In your Supabase Dashboard, click **SQL Editor** on the left sidebar ➔ **New Query**.
3. Open [`supabase_setup.sql`](./supabase_setup.sql) (or click **"Copy supabase_setup.sql"** inside the app's **Connect Cloud** modal), paste it into the Supabase SQL Editor, and click **Run**.
4. Go to **Project Settings ➔ API** and copy:
   - **Project URL** (`https://xxxxxxxxxxxx.supabase.co`)
   - **Project API Key (`anon` `public`)** (`eyJ...`)

---

## Step 2: Host on GitHub Pages

1. Create a new repository on GitHub and push the contents of this `github-supabase-pwa` folder to the `main` branch.
2. In your GitHub repository, go to **Settings ➔ Pages**:
   - Under **Build and deployment ➔ Source**, select **GitHub Actions**.
3. *(Optional)* To bake your Supabase keys directly into the build so you don't even have to paste them on each device, go to **Settings ➔ Secrets and variables ➔ Actions** and add two Repository Secrets:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase `anon` `public` key
4. Wait ~1 minute for the **Deploy to GitHub Pages** action to finish. Your live URL will appear under **Settings ➔ Pages**!

---

## Step 3: Install on iPhone & Open on Laptop

### On Your iPhone (and Sudu's Phone):
1. Open your GitHub Pages link in **Safari**.
2. If you didn't set GitHub Secrets in Step 2, tap **"Connect Cloud"** in the top bar and paste your Supabase URL & Anon Key once.
3. Tap the **Share** button (`[↑]`) at the bottom of Safari ➔ **"Add to Home Screen"** ➔ **Add**.
4. Open **LKR Finance** from your iPhone Home Screen — it launches in full-screen standalone mode with the iPhone bottom tab bar!

### On Your Laptop:
1. Open the exact same GitHub Pages link in Chrome/Edge/Safari.
2. Everything you or Sudu record on your phones will immediately appear on your Laptop dashboard, charts, and Excel/CSV reports!

