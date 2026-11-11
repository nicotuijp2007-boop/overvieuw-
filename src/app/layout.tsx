import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gebruikslimieten",
  description: "Hoeveel ik nog over heb van de limieten van mijn diensten.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
