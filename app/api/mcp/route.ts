import { z } from "zod";
import { createMcpHandler } from "mcp-handler";

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
  },
  {},
  {
    basePath: "/api",
  },
);

export { handler as GET, handler as POST, handler as DELETE };
