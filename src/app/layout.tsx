import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const SITE = "https://erpedudesk.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "EduDesk", template: "%s · EduDesk" },
  description:
    "EduDesk, bureau d'éducation à l'international à Abidjan. Espace du personnel pour les dossiers d'études et de visa. Les familles suivent leur dossier avec le code reçu par e-mail.",
  applicationName: "EduDesk",
  authors: [{ name: "EduDesk", url: SITE }],
  creator: "EduDesk",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE,
    siteName: "EduDesk",
    title: "EduDesk — Bureau d'éducation à l'international",
    description: "Bureau d'éducation à l'international à Abidjan. Espace du personnel et suivi des dossiers par code.",
    images: [{ url: "/logo-edudesk.png", alt: "EduDesk" }],
  },
  robots: { index: true, follow: true },
};

const organisation = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "EduDesk",
  description: "Bureau d'éducation à l'international",
  url: SITE,
  logo: `${SITE}/logo-edudesk.png`,
  areaServed: "CI",
  identifier: { "@type": "PropertyValue", name: "RCCM", value: "CI-ABJ-03-2022-B13-03950" },
};

export const viewport: Viewport = {
  themeColor: "#14284b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${jakarta.variable} bg-paper text-ink antialiased`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organisation) }} />
        {children}
      </body>
    </html>
  );
}
