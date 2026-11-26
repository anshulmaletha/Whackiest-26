import type { Metadata } from "next"
import { Inter, IBM_Plex_Serif } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
})

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Wayfinder — Calm browser navigation",
  description: "Single-destination voice and text browser navigation MVP.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexSerif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
