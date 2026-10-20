import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes autoalojadas en public/fonts (licencias SIL OFL junto a los archivos).
// El preview de presentación referencia los mismos archivos desde preview.css.
const manrope = localFont({
  src: "../../public/fonts/manrope-variable.woff2",
  variable: "--font-manrope",
  weight: "400 700",
  display: "swap",
  adjustFontFallback: "Arial",
});

const ibmPlexMono = localFont({
  src: "../../public/fonts/ibm-plex-mono-400.woff2",
  variable: "--font-ibm-plex-mono",
  weight: "400",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "GALCOA+",
  description: "Documenta operaciones por chat, con confirmaciones de los participantes y sello de huella en Hedera Testnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
