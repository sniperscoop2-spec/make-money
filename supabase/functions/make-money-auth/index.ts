import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a[i] ^ b[i];
  return v === 0;
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const raw = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
}

function getSupabaseSecret(): string | null {
  const named = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (named) {
    try {
      const parsed = JSON.parse(named);
      if (typeof parsed?.default === "string") return parsed.default;
      const first = Object.values(parsed ?? {}).find((v) => typeof v === "string");
      if (typeof first === "string") return first;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData || initData.length > 10000) return { ok: false, error: "invalid_init_data" } as const;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash)) return { ok: false, error: "invalid_hash" } as const;
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, error: "invalid_auth_date" } as const;

  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age < -60 || age > 86400) return { ok: false, error: "expired_init_data" } as const;

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const calculated = await hmac(secretKey, checkString);
  const supplied = new Uint8Array(receivedHash.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
  if (!timingSafeEqual(calculated, supplied)) return { ok: false, error: "invalid_signature" } as const;

  let user: Record<string, unknown> | null = null;
  try { user = JSON.parse(params.get("user") ?? "null"); } catch { user = null; }
  const telegramId = Number(user?.id);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return { ok: false, error: "invalid_user" } as const;

  return { ok: true, telegramId, user, authDate } as const;
}

async function upsertPlayer(player: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secret = getSupabaseSecret();
  if (!supabaseUrl || !secret) throw new Error("Supabase server credentials unavailable");

  const res = await fetch(`${supabaseUrl}/rest/v1/make_money_players?on_conflict=telegram_id`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(player),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`player_upsert_failed:${res.status}`);
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? rows[0] : rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);

  try {
    const body = await req.json();
    const initData = typeof body?.initData === "string" ? body.initData : "";
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) return json({ ok: false, error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, 503);

    const verified = await verifyTelegramInitData(initData, botToken);
    if (!verified.ok) return json({ ok: false, error: verified.error }, 401);

    const user = verified.user as Record<string, unknown>;
    const player = await upsertPlayer({
      telegram_id: verified.telegramId,
      username: typeof user.username === "string" ? user.username : null,
      first_name: typeof user.first_name === "string" ? user.first_name : "",
      last_name: typeof user.last_name === "string" ? user.last_name : null,
      avatar_url: typeof user.photo_url === "string" ? user.photo_url : null,
    });

    return json({
      ok: true,
      player: {
        id: player?.id,
        telegram_id: player?.telegram_id,
        username: player?.username,
        first_name: player?.first_name,
        last_name: player?.last_name,
        balance: player?.balance,
      },
      auth_date: verified.authDate,
    });
  } catch (error) {
    console.error("make-money-auth error", error instanceof Error ? error.message : String(error));
    return json({ ok: false, error: "AUTH_SERVER_ERROR" }, 500);
  }
});
