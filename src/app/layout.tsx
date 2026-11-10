import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Usage Limits",
  description: "How close I am to the limits of the services I use.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
