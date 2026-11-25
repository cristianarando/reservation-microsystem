// src/app/api/auth/google/callback/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clearImpersonator,
  getSafeBaseUrl,
  setSessionUserId,
  verifyAndConsumeOAuthState,
} from "@/lib/session";

export const dynamic = "force-dynamic";

function buildRedirectWithError(baseUrl: string, returnTo: string, authError: string): string {
  const url = new URL(returnTo, baseUrl);
  url.searchParams.set("authError", authError);
  return url.toString();
}

export async function GET(req: Request) {
  const baseUrl = getSafeBaseUrl(req);
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const stateStr = searchParams.get("state");
    const error = searchParams.get("error");

    const { valid: isStateValid, returnTo } = await verifyAndConsumeOAuthState(stateStr);

    if (!isStateValid) {
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "invalid_oauth_state")
      );
    }

    if (error) {
      console.error("Google OAuth error:", error);
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, error.slice(0, 64))
      );
    }

    if (!code) {
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "no_code")
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "missing_google_credentials")
      );
    }

    // 1. Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "token_exchange_failed")
      );
    }

    // 2. Fetch user profile from Google
    const userinfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!userinfoResponse.ok) {
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "userinfo_fetch_failed")
      );
    }

    const profile = await userinfoResponse.json();

    if (
      !profile ||
      typeof profile.email !== "string" ||
      !profile.email.trim() ||
      profile.email_verified !== true ||
      typeof profile.sub !== "string" ||
      !profile.sub.trim()
    ) {
      return NextResponse.redirect(
        buildRedirectWithError(baseUrl, returnTo, "email_not_verified")
      );
    }

    const cleanEmail = profile.email.trim().toLowerCase();
    const googleSub = profile.sub.trim();

    // 3. Link or create user in database with strict identity verification
    let user = await prisma.user.findUnique({
      where: { googleId: googleSub },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
    }

    if (user) {
      if (user.googleId && user.googleId !== googleSub) {
        return NextResponse.redirect(
          buildRedirectWithError(baseUrl, returnTo, "google_account_mismatch")
        );
      }

      const isFirstGoogleLink = !user.googleId;
      const shouldActivatePendingStaff = Boolean(user.pendingStaffUpgrade);

      user = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user!.id },
          data: {
            googleId: googleSub,
            avatarUrl: profile.picture || user!.avatarUrl,
            name: user!.name || profile.name,
            ...(isFirstGoogleLink
              ? {
                  passwordHash: null,
                  sessionVersion: { increment: 1 },
                }
              : {}),
            ...(shouldActivatePendingStaff
              ? {
                  role: user!.role === "ADMIN" ? "ADMIN" : "PROVIDER",
                  pendingStaffUpgrade: false,
                  staffInviteTokenHash: null,
                  staffInviteExpiresAt: null,
                  ...(!isFirstGoogleLink ? { sessionVersion: { increment: 1 } } : {}),
                }
              : {}),
          },
        });

        if (shouldActivatePendingStaff) {
          await tx.staffProfile.updateMany({
            where: { userId: updatedUser.id },
            data: { isActive: true },
          });
        }
        return updatedUser;
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          googleId: googleSub,
          name: profile.name || cleanEmail.split("@")[0],
          avatarUrl: profile.picture,
          role: "CUSTOMER",
          sessionVersion: 1,
        },
      });
    }

    // 4. Issue signed session cookie with current sessionVersion
    await clearImpersonator();
    await setSessionUserId(user.id, user.sessionVersion);

    // 5. Redirect based on role
    if (user.role === "ADMIN" || user.role === "PROVIDER") {
      return NextResponse.redirect(`${baseUrl}/admin`);
    }

    return NextResponse.redirect(new URL(returnTo, baseUrl).toString());
  } catch (error: unknown) {
    console.error("Google callback error:", error);
    return NextResponse.redirect(
      buildRedirectWithError(baseUrl, "/", "oauth_callback_failed")
    );
  }
}
