import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH0_DOMAIN = "https://dev-eybmwvxjb2csb7op.us.auth0.com";
const AUDIENCE = "https://breakingnews-five.vercel.app";
const REQUIRED_SCOPE = "telegram:send";

const jwks = createRemoteJWKSet(
  new URL(`${AUTH0_DOMAIN}/.well-known/jwks.json`),
);

async function verifyAccessToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("missing_token");
  }

  const token = authHeader.slice("Bearer ".length);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${AUTH0_DOMAIN}/`,
    audience: AUDIENCE,
  });

  const scope =
    typeof payload.scope === "string"
      ? payload.scope.split(" ")
      : [];

  if (!scope.includes(REQUIRED_SCOPE)) {
    throw new Error("insufficient_scope");
  }

  return payload;
}

function authError(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
    _meta: {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${AUDIENCE}/.well-known/oauth-protected-resource", scope="${REQUIRED_SCOPE}", error="insufficient_scope", error_description="${message}"`,
      ],
    },
  };
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "health",
      "Check whether the Telegram alert service is available.",
      {},
      async () => ({
        content: [
          {
            type: "text",
            text: "Telegram alert service is available.",
          },
        ],
      }),
    );

    server.tool(
      "send_telegram",
      "Send an urgent breaking-news notification to the user's Telegram account. Use only when a news event meets the user's urgent-alert criteria.",
      {
        text: z.string().min(1).max(4000),
      },
      async ({ text }, extra) => {
        try {
          const request = extra.requestInfo?.request;

          if (!request) {
            return authError("Authentication required.");
          }

          await verifyAccessToken(request);
        } catch (error) {
          const message =
            error instanceof Error && error.message === "insufficient_scope"
              ? "The telegram:send permission is required."
              : "Authentication required.";

          return authError(message);
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!botToken || !chatId) {
          throw new Error("Telegram environment variables are missing.");
        }

        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text,
            }),
          },
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error("Telegram delivery failed.");
        }

        return {
          content: [
            {
              type: "text",
              text: "Breaking-news alert sent successfully to Telegram.",
            },
          ],
        };
      },
    );
  },
  {},
  {
    basePath: "/api",
  },
);

export { handler as GET, handler as POST, handler as DELETE };
