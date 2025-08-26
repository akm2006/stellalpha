"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Star, Home, Settings, LogOut, TestTube } from "lucide-react"

// --- Sub-component for a cleaner main return ---
const NavItem = ({ href, icon: Icon, label }) => {
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${
          isActive ? "text-[#00F6FF]" : "text-[#8B8B9E] hover:text-[#E5E5E5] hover:bg-white/5"
        }`}
      >
        {/* Active State Indicator */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-[#00F6FF] shadow-[0_0_10px_#00F6FF80]"></div>
        )}

        <Icon className="w-5 h-5" />
        <span className="font-medium">{label}</span>
      </Link>
    </li>
  )
}

// --- Main Sidebar Component ---
export default function Sidebar() {
  const navigationItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/command-center", icon: Settings, label: "Command Center" },
    { href: "/testing", icon: TestTube, label: "Testing" },
  ]

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 flex flex-col bg-[linear-gradient(to_bottom,#0A0A1A,#1C123B)] border-r border-white/10 p-4">
      {/* Logo Area */}
      <div>
        <div className="flex items-center gap-3 p-4 mb-4">
          <Star className="w-8 h-8 text-[#00F6FF]" />
          <h1 className="text-xl font-bold text-[#E5E5E5]">Stellalpha</h1>
        </div>

        {/* Navigation */}
        <nav>
          <ul className="space-y-2">
            {navigationItems.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </ul>
        </nav>
      </div>

      {/* Sidebar Footer - Pushed to the bottom */}
      <div className="mt-auto">
        <div className="p-4 border-t border-white/10">
          <button className="flex items-center gap-3 w-full text-[#8B8B9E] hover:text-[#E5E5E5] transition-colors duration-200">
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
