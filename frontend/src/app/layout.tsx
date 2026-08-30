import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ZaraSourcing — Evidence-Based Technical Hiring",
  description: "AI agent audits GitHub code, runs voice interviews with AR proctoring, and ranks candidates with cited evidence. 60% baseline → 70% agent on 10-case benchmark.",
  openGraph: {
    title: "ZaraSourcing — Agentic Hiring + Code Audit",
    description: "Deployable SaaS: code-grounded resume verification, 70% audit accuracy, full hiring pipeline.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
