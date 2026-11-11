import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gebruikslimieten",
  description: "Hoeveel ik nog over heb van de limieten van mijn diensten.",
  applicationName: "Limieten",
  // Home-screen app on iOS: full screen, named "Limieten". Icons: app/icon.svg, app/apple-icon.png.
  appleWebApp: { capable: true, title: "Limieten", statusBarStyle: "default" },
};

// Browser and status bar color, matching the page background in light and dark mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
