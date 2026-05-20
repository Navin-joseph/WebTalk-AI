import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebTalk AI — Dashboard",
  description: "Multi-tenant AI Voice Agent SaaS Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
