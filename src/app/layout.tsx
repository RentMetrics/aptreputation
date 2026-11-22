import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ClerkProvider } from "@clerk/nextjs";

const display = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Instrument_Sans({
  variable: "--font-body-face",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AptReputation (Apartment Reputation): AI search and Google reviews for apartment communities",
  description: "See how ChatGPT, Gemini and Claude answer renters about your community, fix what they get wrong step by step, and earn more Google reviews.",
  metadataBase: new URL("https://www.aptreputation.com"),
  openGraph: {
    type: "website",
    url: "https://www.aptreputation.com",
    siteName: "AptReputation",
    title: "Renters are asking ChatGPT where to live. What does it say about your property?",
    description: "See how ChatGPT, Gemini and Claude answer renters about your apartment community. Free AI search report.",
    images: [{ url: "/aptreputation-share-ai.png", width: 1200, height: 630, alt: "AptReputation: renters are asking ChatGPT where to live. What does it say about your property?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Renters are asking ChatGPT where to live. What does it say about your property?",
    description: "See how ChatGPT, Gemini and Claude answer renters about your apartment community. Free AI search report.",
    images: ["/aptreputation-share-ai.png"],
  },
  icons: {
    icon: [
      { url: "/aptreputation-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/aptreputation-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/aptreputation-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/aptreputation-apple-touch.png", sizes: "180x180", type: "image/png" }],
  },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${display.variable} ${body.variable} antialiased`}
        >
          <Providers>
            {children}
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
