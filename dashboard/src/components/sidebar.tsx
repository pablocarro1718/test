"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems = [
  {
    label: "PORTFOLIO",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutIcon },
      { name: "Holdings", href: "/holdings", icon: WalletIcon },
      { name: "Cotizaciones", href: "/asset", icon: ChartIcon },
      { name: "Returns", href: "/returns", icon: TrendingUpIcon },
      { name: "Flows", href: "/flows", icon: FlowsIcon },
      { name: "Activity", href: "/activity", icon: ListIcon },
    ],
  },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar",
        "transition-[width,transform] duration-300",
        /* Desktop: width toggle */
        collapsed ? "lg:w-16" : "lg:w-64",
        /* Mobile: always w-64, slide in/out */
        "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-14 items-center border-b border-border",
        collapsed ? "lg:justify-center lg:px-0 gap-2.5 px-4" : "gap-2.5 px-4"
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-positive text-white text-sm font-bold">
          P
        </div>
        <span className={cn("text-base font-semibold font-serif", collapsed && "lg:hidden")}>
          Portfolio Tracker
        </span>
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {navItems.map((section) => (
          <div key={section.label} className="mb-6">
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      onClick={onMobileClose}
                      className={cn(
                        "flex items-center rounded-md transition-colors",
                        collapsed
                          ? "lg:justify-center lg:px-0 lg:py-2.5 gap-3 px-3 py-2"
                          : "gap-3 px-3 py-2",
                        isActive
                          ? "bg-white text-foreground shadow-sm border-l-2 border-l-positive"
                          : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className={cn("text-[15px] font-medium", collapsed && "lg:hidden")}>
                        {item.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer + collapse toggle — desktop only */}
      <div className="border-t border-border px-2 py-3">
        <p className={cn("mb-2 px-2 text-[10px] text-muted-foreground", collapsed && "lg:hidden")}>
          Multi-Broker Dashboard
        </p>
        <button
          onClick={onToggle}
          className="hidden w-full items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground lg:flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

/* ── Icons ──────────────────────────────────────────── */

function LayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function FlowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18" />
      <path d="M3 6h18" />
      <path d="M3 18h18" />
      <path d="m15 3 3 3-3 3" />
      <path d="m9 21-3-3 3-3" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  );
}
