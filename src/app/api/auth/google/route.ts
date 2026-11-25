// src/app/api/auth/google/route.ts
import { NextResponse } from "next/server";
import { getSafeBaseUrl, issueOAuthState, sanitizeReturnTo } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const baseUrl = getSafeBaseUrl(req);

  const clientId = process.env.GOOGLE_CLIENT_ID;

  // If Google Cloud Console credentials are not configured in .env
  if (!clientId || clientId.trim().length === 0 || clientId.includes("TU_GOOGLE_CLIENT_ID")) {
    const errorHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Google OAuth no configurado</title>
        <style>
          body{margin:0;background:#EBEBEF;color:#1F1F23;font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
          .card{max-width:420px;width:100%;background:#fff;border-radius:24px;padding:32px;border:1px solid #e4e4e7;box-shadow:0 12px 30px rgba(0,0,0,.08);text-align:center}
          .badge{width:48px;height:48px;border-radius:16px;background:#f59e0b;color:#fff;font-weight:700;font-size:20px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
          .btn{display:block;margin-top:20px;padding:12px 20px;border-radius:9999px;background:#1F1F23;color:#fff;text-decoration:none;font-weight:700;font-size:13px}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">G</div>
          <h1 style="font-size:18px;margin:0 0 8px">Inicio con Google no disponible</h1>
          <p style="font-size:13px;color:#52525b;margin:0">
            El inicio de sesión con Google aún no está habilitado en este servidor. Puedes ingresar con tu correo y contraseña.
          </p>
          <a href="${returnTo}" class="btn">← Volver a la aplicación</a>
        </div>
      </body>
      </html>
    `;
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 503,
    });
  }

  // Redirect to Google OAuth 2.0 consent screen with signed CSRF state token
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const state = await issueOAuthState(returnTo);

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("prompt", "select_account");
  googleAuthUrl.searchParams.set("state", state);

  return NextResponse.redirect(googleAuthUrl.toString());
}
