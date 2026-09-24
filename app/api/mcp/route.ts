import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const AUTH0_DOMAIN = "https://dev-eybmwvxjb2csb7op.us.auth0.com";
const AUDIENCE = "https://breakingnews-five.vercel.app";
const REQUIRED_SCOPE = "telegram:send";

const jwks = createRemoteJWKSet(
  new URL(`${AUTH0_DOMAIN}/.well-known/jwks.json`),
);

const handler = createMcpHandler((server) => {
  server.registerTool(
    "health",
    {
      title: "Telegram Alert Health",
      description: "Check whether the Telegram alert service is available.",
      inputSchema: z.object({}),
      securitySchemes: [
        {
          type: "oauth2",
          scopes: [REQUIRED_SCOPE],
        },
      ],
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Telegram alert service is available.",
        },
      ],
    }),
  );

  server.registerTool(
    "send_telegram",
    {
      title: "Send Telegram Breaking News",
      description:
        "Send an urgent breaking-news notification to the user's Telegram account.",
      inputSchema: z.object({
        text: z.string().min(1).max(4000),
      }),
      securitySchemes: [
        {
          type: "oauth2",
          scopes: [REQUIRED_SCOPE],
        },
      ],
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ text }) => {
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
});

async function verifyToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) {
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(bearerToken, jwks, {
      issuer: `${AUTH0_DOMAIN}/`,
      audience: AUDIENCE,
    });

    const scopes =
      typeof payload.scope === "string"
        ? payload.scope.split(" ")
        : [];

    if (!scopes.includes(REQUIRED_SCOPE)) {
      return undefined;
    }

    return {
      token: bearerToken,
      scopes,
      clientId:
        typeof payload.sub === "string"
          ? payload.sub
          : "auth0-user",
    };
  } catch {
    return undefined;
  }
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: [REQUIRED_SCOPE],
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export {
  authHandler as GET,
  authHandler as POST,
};
