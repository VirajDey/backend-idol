# Books Backend Cloudflare Worker

This is a minimal backend for the Books API, ready to deploy on Cloudflare Workers. It serves mock book data and supports CORS for frontend integration.

## Endpoints
- `GET /api/books` — List all books
- `GET /api/books/:id` — Get a single book by ID
- `GET /api/books/:id/related` — Get related books by genre

## Local Development

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install/):
   ```sh
   npm install -g wrangler
   ```
2. Start the worker locally:
   ```sh
   npm run dev
   ```

## Deployment

Deploy to your Cloudflare account:
```sh
npm run deploy
```

## CORS

CORS is enabled for `http://localhost:5173` by default. Update `backend/index.js` if your frontend runs elsewhere. 