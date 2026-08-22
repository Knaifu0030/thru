import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Hammer, Search } from "lucide-react";
import { useRegistry, useUI } from "@/lib/store";
import { PillButton } from "@/components/ui/PillButton";
import { TwoTone } from "@/components/ui/TwoTone";

const TITLES: Record<string, { a: string; b: string; sub: string }> = {
  "/": { a: "THRU ", b: "overview", sub: "Here's how your skills are performing." },
  "/marketplace": {
    a: "Your ",
    b: "marketplace",
    sub: "Teach a workflow once — it becomes a button, an API, and an agent tool.",
  },
  "/activity": { a: "Activity & ", b: "recovery", sub: "Every run, heal, and approval — in order." },
  "/connect": { a: "Connect an ", b: "agent", sub: "Point any MCP client or REST caller at your gateway." },
  "/settings": {
    a: "Gateway ",
    b: "keys",
    sub: "Access for calls into THRU — never credentials for the sites it automates.",
  },
};

export function HeaderBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { query, setQuery, openTeaching } = useUI();
  const { skills } = useRegistry();

  const title = TITLES[pathname] ?? TITLES["/"];

  const healedRecently = (skills ?? []).some(
    (s) => s.vitals.last_heal?.at && Date.now() - new Date(s.vitals.last_heal.at).getTime() < 24 * 3600_000,
  );

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-white/[0.08] bg-bg px-4 py-5 md:px-10">
      <TwoTone a={title.a} b={title.b} sub={title.sub} />

      <div className="flex items-center gap-3">
        <div className="relative hidden lg:block">
          <Search
            size={14}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (pathname !== "/marketplace") navigate("/marketplace");
            }}
            placeholder="Search skills, sites, or tasks…"
            aria-label="Search skills"
            className="w-64 rounded-[2px] border border-white/10 bg-black/25 py-2 pl-9 pr-4 text-sm text-ink placeholder:text-faint outline-none transition-colors duration-200 focus:border-accent/60"
          />
        </div>

        <button
          type="button"
          aria-label={healedRecently ? "Activity — a skill healed recently" : "Activity"}
          onClick={() => navigate("/activity")}
          className="relative rounded-[2px] border border-white/10 p-2.5 text-muted transition-colors duration-200 hover:border-white/25 hover:text-ink"
        >
          <Bell size={16} strokeWidth={1.5} />
          {healedRecently && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-sage" />}
        </button>

        <PillButton variant="accent" onClick={openTeaching}>
          <Hammer size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Teach a new skill</span>
          <span className="sm:hidden">Teach</span>
        </PillButton>
      </div>
    </header>
  );
}
