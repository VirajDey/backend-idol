import { mockBooks } from "./lib/mockData.js";
import postgres from "postgres";

function withCORS(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "https://testing-frontend-83b.pages.dev");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
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

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return withCORS(new Response(null, { status: 204 }));
    }

    // Root path: return API status
    if (pathname === "/" && request.method === "GET") {
      return withCORS(new Response("API is running", { status: 200, headers: { "Content-Type": "text/plain" } }));
    }

    // /api/books (GET)
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

    return withCORS(new Response("Not found", { status: 404 }));
  },
}; 