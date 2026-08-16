import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "OPTIQ - live optimizer for SQL, Python and PySpark";
const description =
  "Rewrite slow queries and scripts for the engine you run. Every rewrite is checked against a business-logic guard so the results never drift.";

export const metadata: Metadata = {
  metadataBase: new URL("https://code-optimizer.instaluxe.in"),
  title: { default: title, template: "%s | OPTIQ" },
  description,
  applicationName: "OPTIQ",
  authors: [{ name: "Ashish Kumar" }],
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    images: ["/og-optiq.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-optiq.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
