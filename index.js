import userHandler from "./user.js";
import postgres from "postgres";

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

    // Fallback for unknown routes
    return withCORS(new Response("Not found", { status: 404 }));
  }
}; 