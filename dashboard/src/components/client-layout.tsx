"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — hidden on lg+ */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center border-b border-border bg-sidebar px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="ml-3 text-base font-semibold font-serif">Portfolio Tracker</span>
      </header>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main
        className={cn(
          "min-h-screen p-6 transition-[margin-left] duration-300",
          /* Mobile: full-width + extra top padding for the fixed header */
          "pt-[calc(1.5rem+3.5rem)] lg:pt-6",
          /* Desktop: offset for sidebar */
          collapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        {children}
      </main>
    </>
  );
}
