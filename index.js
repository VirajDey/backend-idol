import userHandler from "./user.js";
import postgres from "postgres";
import { mockBooks } from "./lib/mockData.js";

function withCORS(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { ...response, headers });
}

async function getSQL(env) {
  if (env.HYPERDRIVE && env.HYPERDRIVE.connectionString) {
    return postgres(env.HYPERDRIVE.connectionString, { fetch_types: false });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Route all /api/auth and /api/admin requests to user.js
    if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/admin")) {
      return userHandler.fetch(request, env, ctx);
    }

    // Swagger UI endpoint
    if (pathname === "/api/docs" && request.method === "GET") {
      const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Authentication API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
      return new Response(swaggerHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    }

    // Swagger JSON endpoint
    if (pathname === "/api/swagger.json" && request.method === "GET") {
      try {
        const swaggerModule = await import('./swagger.json', { assert: { type: 'json' } });
        const swaggerJson = swaggerModule.default;
        return new Response(JSON.stringify(swaggerJson), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to load Swagger documentation" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Book endpoints (example)
    if (pathname === "/api/books" && request.method === "GET") {
      const sql = await getSQL(env);
      if (sql) {
        try {
          const books = await sql`SELECT * FROM public.books`;
          return withCORS(
            new Response(JSON.stringify({ books }), {
              headers: { "Content-Type": "application/json" },
            })
          );
        } catch (e) {
          return withCORS(new Response(JSON.stringify({ error: "Database error", details: e.message }), { status: 500, headers: { "Content-Type": "application/json" } }));
        } finally {
          sql && sql.end && ctx.waitUntil(sql.end());
        }
      } else {
        return withCORS(
          new Response(JSON.stringify({ books: mockBooks }), {
            headers: { "Content-Type": "application/json" },
          })
        );
      }
    }

    // /api/books/:id (GET)
    const bookIdMatch = pathname.match(/^\/api\/books\/(\d+)$/);
    if (bookIdMatch && request.method === "GET") {
      const bookId = parseInt(bookIdMatch[1], 10);
      const sql = await getSQL(env);
      if (sql) {
        try {
          const books = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;
          if (!books.length) {
            return withCORS(new Response(JSON.stringify({ error: "Book not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
          }
          return withCORS(new Response(JSON.stringify({ book: books[0] }), { headers: { "Content-Type": "application/json" } }));
        } catch (e) {
          return withCORS(new Response(JSON.stringify({ error: "Database error", details: e.message }), { status: 500, headers: { "Content-Type": "application/json" } }));
        } finally {
          sql && sql.end && ctx.waitUntil(sql.end());
        }
      } else {
        const book = mockBooks.find((b) => b.id === bookId);
        if (!book) {
          return withCORS(new Response(JSON.stringify({ error: "Book not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
        }
        return withCORS(new Response(JSON.stringify({ book }), { headers: { "Content-Type": "application/json" } }));
      }
    }

    // /api/books/:id/related (GET)
    const relatedMatch = pathname.match(/^\/api\/books\/(\d+)\/related$/);
    if (relatedMatch && request.method === "GET") {
      const bookId = parseInt(relatedMatch[1], 10);
      const sql = await getSQL(env);
      if (sql) {
        try {
          const books = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;
          if (!books.length) {
            return withCORS(new Response(JSON.stringify({ error: "Book not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
          }
          const genre = books[0].genre;
          const relatedBooks = await sql`SELECT * FROM public.books WHERE genre = ${genre} AND id != ${bookId} LIMIT 3`;
          return withCORS(new Response(JSON.stringify({ relatedBooks }), { headers: { "Content-Type": "application/json" } }));
        } catch (e) {
          return withCORS(new Response(JSON.stringify({ error: "Database error", details: e.message }), { status: 500, headers: { "Content-Type": "application/json" } }));
        } finally {
          sql && sql.end && ctx.waitUntil(sql.end());
        }
      } else {
        const book = mockBooks.find((b) => b.id === bookId);
        if (!book) {
          return withCORS(new Response(JSON.stringify({ error: "Book not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
        }
        const relatedBooks = mockBooks.filter((b) => b.genre === book.genre && b.id !== book.id).slice(0, 3);
        return withCORS(new Response(JSON.stringify({ relatedBooks }), { headers: { "Content-Type": "application/json" } }));
      }
    }

    // Fallback for unknown routes
    return withCORS(new Response("Not found", { status: 404 }));
  }
}; 