# DM Lantern

A campaign companion for tabletop games. Anyone can sign up, run their own campaigns as the Dungeon Master and join other people's campaigns as a player with an invite code. One account works for every campaign.

## What runs where

The whole app runs on Cloudflare.

| Part | Where |
| --- | --- |
| Public home page and privacy page | Static HTML in `public/`, served at `/` and `/privacy` to signed out visitors and search engines |
| Web app (React, built with Vite) | Served as static files by the Worker from `dist` |
| API | Cloudflare Worker in `worker/` at `/api/*` |
| Data, accounts and images | Cloudflare D1 database `dm-companion` |

Database tables are in `migrations/`. Campaign content (characters, NPCs, sessions, lore and the rest) lives in one `records` table keyed by campaign, so every campaign is fully separate.

## Accounts and access

* Sign up with a name, email and password. Passwords are hashed with PBKDF2 and sessions use a secure HttpOnly cookie.
* The person who creates a campaign is its DM. The DM makes single use invite codes on the Players page, optionally tied to a character.
* A player enters the code on their campaign list to join. Players see only what the DM shares, the party tracker, party notes and their own private notes. The DM never sees a player's private notes or private map marks.

## First deploy

1. The database tables are already applied to the `dm-companion` D1 database. For a fresh database, apply them once:
   ```
   npm install
   npx wrangler login
   npm run db:migrate
   ```
2. Deploy, either:
   * from your machine with `npm run deploy`, or
   * in the Cloudflare dashboard under Workers and Pages, Create, Import a repository, pick this repo, set the build command to `npm run build` and the deploy command to `npx wrangler deploy`. Every push to `main` then deploys.

The app will be live at `https://dm-companion.<your-subdomain>.workers.dev`. A custom domain can be added in the Worker's settings.

## Search, social and AI search

* `/` shows the public home page to signed out visitors and crawlers, and the campaign list to signed in users. App pages carry `noindex`.
* `robots.txt`, `sitemap.xml` and `llms.txt` are built by the Worker from the live domain (`worker/site.js`). AI crawlers are allowed on public pages.
* The home page carries Open Graph and Twitter tags, a 1200 by 630 share image and JSON-LD for the organisation, website, web app and FAQ.
* Successful sign ups push `{ event: 'sign_up' }` to `window.dataLayer`, ready for Google Tag Manager or a Google Ads conversion.
* The product name lives in `src/brand.js` and in the static files in `public/`.

After a custom domain is attached:

1. Uncomment `vars.CANONICAL_HOST` in `wrangler.jsonc` and set it to the domain. The workers.dev address then redirects there.
2. Verify the domain in Google Search Console and Bing Webmaster Tools, and submit `/sitemap.xml` to both.

## Local development

```
npm install
npm run db:migrate:local
npm run build
npm run api      # Worker and API on http://localhost:8787
npm run dev      # Vite on http://localhost:5173, proxies /api to the Worker
```

## Still to add

* Password reset by email needs an email provider (for example Resend). Until then a user who forgets their password needs the DM or admin to help.
* Images are stored in D1 in chunks (up to 12 MB each). Moving them to R2 is a good upgrade once R2 is enabled on the account.
