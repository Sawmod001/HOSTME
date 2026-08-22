"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

export default function DashboardLayout({ children, sidebar, sidebarProps = {} }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const SidebarComponent = sidebar;

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)]">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3 lg:hidden">
        <Logo size="sm" />
        <button onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-white p-6 shadow-lg border-r border-[var(--color-border)]">
            <SidebarComponent {...sidebarProps} onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Desktop layout */}
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <SidebarComponent {...sidebarProps} onClose={() => setSidebarOpen(false)} />
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
