import type { ReactNode } from "react";
import { HeaderBar } from "./HeaderBar";
import { MobileNav, Sidebar } from "./Sidebar";

/**
 * Full-bleed application frame: structural 1px borders divide sidebar,
 * header, and content — flat surfaces, no floating box, no decoration.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar />
        <main className="flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-16 md:pt-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
