// src/lib/ssrf-guard.ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Checks whether an IPv4 or IPv6 address belongs to a loopback, private, link-local,
 * carrier-grade NAT, or otherwise non-routable/reserved subnet.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!ip) return true;

  // Strip IPv6 zone index if present (e.g., fe80::1%eth0)
  const zoneIdx = ip.indexOf("%");
  const cleanIp = zoneIdx === -1 ? ip : ip.slice(0, zoneIdx);

  const version = isIP(cleanIp);
  if (version === 4) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 ("this network")
    if (a === 10) return true; // 10.0.0.0/8 RFC 1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 Docker / RFC 1918
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC 1918
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (version === 6) {
    if (cleanIp === "::" || cleanIp === "::1") return true;
    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (cleanIp.startsWith("::ffff:")) {
      const mapped = cleanIp.slice(7);
      if (mapped.includes(".")) {
        return isPrivateOrReservedIp(mapped);
      }
      const hexParts = mapped.split(":");
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          return isPrivateOrReservedIp(ipv4);
        }
      }
      return true;
    }
    // Unique local addresses (fc00::/7) and link-local (fe80::/10) and multicast (ff00::/8)
    const firstWord = parseInt(cleanIp.split(":")[0] || "0", 16);
    if (!Number.isFinite(firstWord)) return true;
    if ((firstWord & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((firstWord & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((firstWord & 0xff00) === 0xff00) return true; // ff00::/8
    return false;
  }

  return true;
}

export function validateSafeExternalUrl(
  rawUrl: string,
  options: { requireHttps?: boolean; allowStandardPortsOnly?: boolean } = {}
): { ok: true; url: URL } | { ok: false; error: string } {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { ok: false, error: "URL vacía o inválida." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "Formato de URL inválido." };
  }

  if (options.requireHttps) {
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Solo se permiten destinos HTTPS seguros." };
    }
  } else if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Solo se permiten enlaces http:// o https://." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "La URL no debe contener credenciales embebidas." };
  }

  if (
    options.allowStandardPortsOnly &&
    parsed.port &&
    parsed.port !== "80" &&
    parsed.port !== "443"
  ) {
    return { ok: false, error: "Puerto de red no permitido." };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host === "metadata.google.internal"
  ) {
    return { ok: false, error: "El destino no puede apuntar a una red interna o local." };
  }

  if (isIP(host) !== 0 && isPrivateOrReservedIp(host)) {
    return { ok: false, error: "El destino no puede apuntar a una IP privada o reservada." };
  }

  // Also catch integer/octal/hex IPv4 obfuscation like http://2130706433 or 0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return { ok: false, error: "Formato de host numérico no permitido." };
  }

  return { ok: true, url: parsed };
}

/**
 * Resolves DNS for a URL's hostname and rejects any private/reserved IPs to block DNS rebinding,
 * then executes fetch() with redirect:"error", timeout, and a strict byte limit.
 */
export async function safeExternalFetch(
  rawUrl: string,
  options: RequestInit & {
    timeoutMs?: number;
    maxBytes?: number;
    requireHttps?: boolean;
  } = {}
): Promise<{ res: Response; buffer: Buffer }> {
  const validated = validateSafeExternalUrl(rawUrl, {
    requireHttps: options.requireHttps,
    allowStandardPortsOnly: true,
  });
  if (!validated.ok) {
    throw new Error(`SSRF_BLOCKED: ${validated.error}`);
  }

  const host = validated.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) === 0) {
    const records = await lookup(host, { all: true });
    if (!records || records.length === 0) {
      throw new Error("DNS_RESOLUTION_FAILED");
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error("SSRF_BLOCKED_DNS_PRIVATE_IP");
      }
    }
  }

  const { timeoutMs = 6000, maxBytes = 1_500_000, requireHttps: _reqHttps, ...fetchInit } = options;
  void _reqHttps;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(validated.url.toString(), {
      ...fetchInit,
      redirect: "error",
      signal: controller.signal,
    });

    const contentLength = Number(res.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await res.body?.cancel().catch(() => {});
      throw new Error("RESPONSE_TOO_LARGE");
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return { res, buffer: Buffer.alloc(0) };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error("RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    }

    return { res, buffer: Buffer.concat(chunks) };
  } finally {
    clearTimeout(timer);
  }
}
