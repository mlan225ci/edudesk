import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "EduDesk", template: "%s · EduDesk" },
  description: "ERP EduDesk : dossiers, clients, caisse, comptabilité et équipe",
};

export const viewport: Viewport = {
  themeColor: "#14284b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${jakarta.variable} bg-paper text-ink antialiased`}>{children}</body>
    </html>
  );
}
