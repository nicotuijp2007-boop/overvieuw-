import type { MetadataRoute } from "next";

/** Lets "Zet op beginscherm" open the dashboard as an app ("Limieten"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Limieten",
    short_name: "Limieten",
    description: "Hoeveel ik nog over heb van de limieten van mijn diensten.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f1",
    theme_color: "#f4f4f1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
