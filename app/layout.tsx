import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Navia — Voice-first web access",
  description: "Search the web, understand every website, by voice.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
