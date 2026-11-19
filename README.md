# PackPal

Premium React + Express smart packing assistant.

## Local development

```bash
npm install
npm run dev:all
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

Without `DATABASE_URL`, the app uses `data/packpal.json` for local persistence. This fallback is not suitable for production.

## Production database

Set these Vercel environment variables:

- `DATABASE_URL` - hosted PostgreSQL connection string
- `JWT_SECRET` - long random signing secret
- `VITE_API_URL` - optional, only for a separately hosted API
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `APP_URL` - required to send password-reset emails

The Express server creates its account, trip, saved-list, settings, and password-reset tables automatically. Password recovery stays unavailable until SMTP is configured; the page reports that rather than pretending an email was sent.

## Build

```bash
npm run build
npm run preview
```

## Deploy

1. Push the project to GitHub.
2. Import it in Vercel.
3. Add `DATABASE_URL` and `JWT_SECRET`.
4. Deploy using the included `vercel.json`.

Weather uses live Open-Meteo geocoding and forecast APIs. Trip packing lists, saved templates, profile details, and user preferences are persisted in PostgreSQL.

## Packing checklist and photos

Each new trip starts with the 38-item packing checklist. Changes are saved to that trip's own list, so editing or deleting items does not alter another trip's template. Product photos and page backgrounds are served from `public/images`; product-photo attributions are in `public/images/products/credits.json`, and scenic background attributions are in `public/images/background-credits.json`.
