import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Registro degli accessi (dal Westeros: access-log.ts). Lo scrive solo il server
// con la chiave segreta, così nessuno può falsificarlo dal browser.
// Il controllo VPN/proxy usa proxycheck.io (gratis ~100 richieste al giorno,
// 1000 con una chiave gratuita in PROXYCHECK_API_KEY).

export type AccessEvent = "iscrizione" | "login" | "accesso";

/** Cookie "utente|ip" dell'ultimo accesso registrato: se l'IP cambia se ne registra uno nuovo */
export const ACCESS_COOKIE = "gdr_access";

// Una verifica VPN resta valida 7 giorni
const CHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type IpInfo = { country: string | null; is_vpn: boolean; vpn_type: string | null; provider: string | null; risk: number | null };

/** IP reale del visitatore (su Vercel le intestazioni le mette la piattaforma) */
export function getClientIp(headers: Headers): string | null {
  const ip = headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return ip || null;
}

function isPrivateIp(ip: string) {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("::ffff:127.")
  );
}

async function lookupIp(ip: string): Promise<IpInfo | null> {
  const key = process.env.PROXYCHECK_API_KEY?.trim();
  const url = `https://proxycheck.io/v3/${encodeURIComponent(ip)}${key ? `?key=${encodeURIComponent(key)}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown> & { status?: string };
    const data = json[ip] as
      | { detections?: Record<string, unknown>; location?: { country_code?: string }; network?: { provider?: string } }
      | undefined;
    if (json.status !== "ok" || !data) return null;
    const d = data.detections ?? {};
    return {
      country: data.location?.country_code ?? null,
      // Hosting = IP di un datacenter: quasi sempre VPN o server, raramente una persona a casa
      is_vpn: Boolean(d.vpn || d.proxy || d.tor || d.hosting),
      vpn_type: d.tor ? "TOR" : d.vpn ? "VPN" : d.proxy ? "Proxy" : d.hosting ? "Hosting" : null,
      provider: data.network?.provider ?? null,
      risk: typeof d.risk === "number" ? d.risk : null,
    };
  } catch {
    return null;
  }
}

/**
 * Registra un accesso e aggiorna l'ultimo accesso dell'utente.
 * Non lancia mai errori: un problema nel registro non deve impedire di giocare.
 */
export async function logAccess({ userId, event, ip, userAgent }: { userId: string; event: AccessEvent; ip: string | null; userAgent: string | null }) {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    if (event !== "iscrizione") {
      const now = new Date().toISOString();
      // l'ingresso con nome e password fa ripartire la durata massima della sessione
      await admin.from("profiles").update(event === "login" ? { last_login_at: now, session_started_at: now } : { last_login_at: now }).eq("id", userId);
    }
    if (!ip) return;

    let info: IpInfo | null = null;
    if (!isPrivateIp(ip)) {
      const { data: cached } = await admin
        .from("ip_checks")
        .select("country, is_vpn, vpn_type, provider, risk, checked_at")
        .eq("ip", ip)
        .maybeSingle<IpInfo & { checked_at: string }>();
      if (cached && Date.now() - new Date(cached.checked_at).getTime() < CHECK_TTL_MS) info = cached;
      else {
        info = await lookupIp(ip);
        if (info) await admin.from("ip_checks").upsert({ ip, ...info, checked_at: new Date().toISOString() });
      }
    }

    await admin.from("access_logs").insert({
      user_id: userId,
      event,
      ip,
      user_agent: userAgent?.slice(0, 500) ?? null,
      country: info?.country ?? null,
      is_vpn: info ? info.is_vpn : null,
      vpn_type: info?.vpn_type ?? null,
      provider: info?.provider ?? null,
      risk: info?.risk ?? null,
    });
  } catch (e) {
    console.error("Registro accessi:", e);
  }
}
