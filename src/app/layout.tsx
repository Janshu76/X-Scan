import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { ViewModeProvider } from "@/regions/ViewMode";

export const metadata: Metadata = {
  title: "TerraWatch · The Sinking City",
  description: "Explore observed Sentinel-1 line-of-sight displacement across Mexico City.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ViewModeProvider>{children}</ViewModeProvider></body></html>;
}
