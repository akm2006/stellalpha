import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import ModernHeader from "@/components/modern-header"
import ParticlesBackground from "@/components/particles-background"
import { GlobalToastRenderer } from "@/components/toast"
import { WalletProvider } from "@/contexts/WalletContext"
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "Stellalpha",
  description: "Autonomous Gasless Copy-Trading Agent",

}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
      <body>
        <WalletProvider>
          <div className="stellalpha-bg min-h-screen relative">
            <ParticlesBackground />
            <ModernHeader />
            <main className="relative z-10">{children}</main>
          </div>
          <GlobalToastRenderer />
        </WalletProvider>
      </body>
    </html>
  )
}
