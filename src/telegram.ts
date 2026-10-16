const REQUEST_TIMEOUT_MS = 15_000;

interface TelegramResponse {
  ok?: boolean;
  description?: string;
}

export async function sendMessage(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as TelegramResponse | null;
  if (!response.ok || !body?.ok) {
    // Never include the request URL here: it contains the bot token.
    const detail = body?.description ? `: ${body.description}` : '';
    throw new Error(`Telegram sendMessage failed (HTTP ${response.status})${detail}`);
  }
}
