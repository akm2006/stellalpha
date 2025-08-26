import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/sidebar"
import { GlobalToastRenderer } from "@/components/toast"
import { WalletProvider } from "@/contexts/WalletContext"

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
  title: "Stellalpha - Web3 Dashboard",
  description: "Futuristic Web3 application dashboard",
  generator: "v0.app",
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
          <div className="flex">
            <Sidebar />
            <main className="flex-1 ml-64">{children}</main>
          </div>
          <GlobalToastRenderer />
        </WalletProvider>
      </body>
    </html>
  )
}
