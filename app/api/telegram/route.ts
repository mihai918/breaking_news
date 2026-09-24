export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.ALERT_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return Response.json(
      { error: "Telegram environment variables are not configured" },
      { status: 500 },
    );
  }

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body.text.trim(),
      }),
    },
  );

  const telegramResult = await telegramResponse.json();

  if (!telegramResponse.ok || !telegramResult.ok) {
    return Response.json(
      { error: "Telegram delivery failed" },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
