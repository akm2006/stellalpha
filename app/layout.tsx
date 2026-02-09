import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import ModernHeader from "@/components/modern-header"
import AppWalletProvider from "@/components/providers/AppWalletProvider"
import { AuthProvider } from "@/contexts/auth-context"
import { OnboardingProvider } from "@/contexts/onboarding-context"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"


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
        <AppWalletProvider>
          <AuthProvider>
            <OnboardingProvider>
              <ModernHeader />
              <main className="relative z-10">{children}</main>
              <OnboardingWizard />
            </OnboardingProvider>
          </AuthProvider>
        </AppWalletProvider>
      </body>
    </html>
  )
}