import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Alpha Prediction";
const SITE_DESCRIPTION =
  "Live cricket AI predictions for every ongoing T20 and ODI match, refreshed ball by ball.";

function buildOrigin(host: string, proto: string | null): string {
  const resolvedProto = proto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${resolvedProto}://${host}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto");
  const origin = buildOrigin(host, proto);

  return {
    title: {
      default: `${SITE_NAME} | Live Cricket AI`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    metadataBase: new URL(origin),
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: `${SITE_NAME} | Live Cricket AI`,
      description: SITE_DESCRIPTION,
      url: "/",
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} live cricket prediction dashboard`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE_NAME} | Live Cricket AI`,
      description: SITE_DESCRIPTION,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
