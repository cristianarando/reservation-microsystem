import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { CSSProperties } from "react";
import { buildJsonLd, getSeoProfile, resolveSiteUrl } from "@/lib/seo";
import { getAccessibleTextColor, normalizeHex } from "@/lib/color-utils";
import "./globals.css";

const plusJakartaSans = localFont({
  src: [
    {
      path: "../assets/fonts/PlusJakartaSans-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../assets/fonts/PlusJakartaSans-SemiBold.woff",
      weight: "600",
      style: "normal",
    },
    {
      path: "../assets/fonts/PlusJakartaSans-Bold.woff",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateViewport(): Promise<Viewport> {
  const seo = await getSeoProfile();
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: seo.themePrimaryHex,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const [siteUrl, seo] = await Promise.all([resolveSiteUrl(), getSeoProfile()]);
  const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: seo.seoTitle,
      template: `%s | ${seo.businessName}`,
    },
    description: seo.seoDescription,
    applicationName: seo.businessName,
    keywords: seo.keywords,
    authors: [{ name: seo.businessName }],
    creator: seo.businessName,
    publisher: seo.businessName,
    category: seo.category,
    alternates: {
      canonical: "/",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: seo.shortName,
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: "es_BO",
      url: siteUrl,
      siteName: seo.businessName,
      title: seo.ogTitle,
      description: seo.ogDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    ...(googleVerification
      ? {
          verification: {
            google: googleVerification,
          },
        }
      : {}),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [siteUrl, seo] = await Promise.all([resolveSiteUrl(), getSeoProfile()]);
  const jsonLd = buildJsonLd(seo, siteUrl);
  const safeJsonLdString = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  const brandPrimary = normalizeHex(seo.themePrimaryHex, "#1F1F23");
  const brandPrimaryFg = getAccessibleTextColor(brandPrimary);
  const surfaceAccent = normalizeHex(seo.themeSurfaceHex, "#9FA0A6");

  const themeVars = {
    "--brand-primary": brandPrimary,
    "--brand-primary-fg": brandPrimaryFg,
    "--surface-card": surfaceAccent,
  } as CSSProperties;

  return (
    <html lang="es" className={`h-full ${plusJakartaSans.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                var registerSw = function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    window.__swRegistered = true;
                    window.__swRegistrationError = null;
                    if (reg && reg.update) { reg.update().catch(function() {}); }
                  }).catch(function(err) {
                    window.__swRegistered = false;
                    window.__swRegistrationError = err && err.message ? err.message : 'No se pudo iniciar el Service Worker';
                  });
                };
                if (document.readyState === 'complete') {
                  registerSw();
                } else {
                  window.addEventListener('load', registerSw);
                }
              }
            `,
          }}
        />
      </head>
      <body
        style={themeVars}
        className="min-h-full flex flex-col bg-[#EBEBEF] text-[#1F1F23] font-sans antialiased"
      >
        {children}
      </body>
    </html>
  );
}
