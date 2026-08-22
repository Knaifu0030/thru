import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, Cable, LayoutDashboard, Settings, Store, type LucideIcon } from "lucide-react";
import { api, GATEWAY_BASE } from "@/lib/api";
import { Wordmark } from "./Wordmark";

export const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/connect", label: "Connect Agent", icon: Cable },
  { to: "/settings", label: "Settings", icon: Settings },
];

function GatewayStatus() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    const check = () =>
      api
        .health()
        .then((h) => {
          if (stale) return;
          setState("online");
          setVersion(h.version);
        })
        .catch(() => !stale && setState("offline"));
    check();
    const t = setInterval(check, 15_000);
    return () => {
      stale = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="border-t border-white/[0.08] px-4 py-3 font-mono text-xs text-faint" title={GATEWAY_BASE}>
      <span className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            state === "online" ? "bg-sage" : state === "offline" ? "bg-rose" : "bg-faint"
          }`}
        />
        {state === "online"
          ? `gateway online${version ? ` · v${version}` : ""}`
          : state === "offline"
            ? "gateway offline"
            : "checking gateway…"}
      </span>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.08] md:flex">
      <div className="border-b border-white/[0.08] px-5 py-5">
        <Wordmark />
      </div>
      <nav className="flex-1 space-y-1 p-4" aria-label="Main">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="block">
            {({ isActive }) => (
              <span
                className={`relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-200 ${
                  isActive ? "text-bg" : "text-muted hover:text-ink"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-active absolute inset-0 rounded-lg"
                    transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  />
                )}
                <Icon size={16} strokeWidth={1.5} className="relative" />
                <span className="relative font-medium">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <GatewayStatus />
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-white/[0.08] bg-bg md:hidden"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          aria-label={label}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-3 text-xs transition-colors duration-200 ${
              isActive ? "text-accent" : "text-muted hover:text-ink"
            }`
          }
        >
          <Icon size={18} strokeWidth={1.5} />
        </NavLink>
      ))}
    </nav>
  );
}
