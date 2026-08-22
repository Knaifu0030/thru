import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTHRU, useRegistry, useUI } from "@/lib/store";
import type { SkillArtifact } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { PillButton } from "@/components/ui/PillButton";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SkillCard, healRecently } from "@/components/skills/SkillCard";
import { TeachingCard } from "@/components/skills/TeachingCard";
import { Spark } from "@/components/shell/Wordmark";

function matches(artifact: SkillArtifact, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const { skill } = artifact;
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.site.domain.toLowerCase().includes(q) ||
    skill.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function EmptyMarketplace({ onTeach }: { onTeach: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Spark size={36} className="mx-auto text-accent/50" />
      <h2 className="mt-6 text-lg font-semibold">Nothing here yet</h2>
      <p className="mt-2 text-sm text-muted">
        Teach THRU one workflow — you'll get a button for you, an API for your code, and a tool
        for your agents. All from the same lesson.
      </p>
      <PillButton variant="accent" className="mt-6" onClick={onTeach}>
        Teach your first skill
      </PillButton>
    </div>
  );
}

export function Marketplace() {
  const { skills, error, refresh } = useRegistry();
  const { query, setQuery, openSkill, openTeaching } = useUI();
  const { session } = useTHRU();
  const [filter, setFilter] = useState("all");

  const categories = useMemo(() => {
    const tags = new Set<string>();
    for (const s of skills ?? []) {
      for (const t of s.skill.tags) tags.add(t);
    }
    return [...tags].sort().slice(0, 5);
  }, [skills]);

  const filtered = useMemo(() => {
    let list = skills ?? [];
    if (session?.skill) list = list.filter((s) => s.skill.id !== session.skill!.skill.id);
    list = list.filter((s) => matches(s, query.trim()));
    if (filter === "gated") list = list.filter((s) => s.skill.sensitive);
    else if (filter === "healed") list = list.filter(healRecently);
    else if (filter !== "all") list = list.filter((s) => s.skill.tags.includes(filter));
    return list;
  }, [skills, query, filter, session]);

  const loading = skills === null && !error;
  const registryEmpty = (skills ?? []).length === 0 && !session;

  return (
    <div className="space-y-5">
      {/* On smaller screens the global search lives here instead of the header. */}
      <div className="relative lg:hidden">
        <Search
          size={14}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills, sites, or tasks…"
          aria-label="Search skills"
          className="w-full rounded-[2px] border border-white/10 bg-black/25 py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-faint outline-none transition-colors duration-200 focus:border-accent/60"
        />
      </div>

      {!registryEmpty && !loading && (
        <div className="flex flex-wrap gap-2">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Chip>
          <Chip selected={filter === "gated"} onClick={() => setFilter("gated")}>
            Gated
          </Chip>
          <Chip selected={filter === "healed"} onClick={() => setFilter("healed")}>
            Recently healed
          </Chip>
          {categories.map((tag) => (
            <Chip key={tag} selected={filter === tag} onClick={() => setFilter(tag)}>
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </Chip>
          ))}
        </div>
      )}

      {error && skills === null && (
        <div className="rounded-2xl border border-white/10 bg-raised p-6">
          <p className="text-sm text-ink">The registry didn't load.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <PillButton variant="ghost" size="sm" className="mt-4" onClick={refresh}>
            Try again
          </PillButton>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && registryEmpty && !error && <EmptyMarketplace onTeach={openTeaching} />}

      {!loading && !registryEmpty && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {session && <TeachingCard onOpen={openSkill} />}
            {filtered.map((artifact) => (
              <SkillCard key={artifact.skill.id} artifact={artifact} onOpen={openSkill} />
            ))}
          </div>
          {filtered.length === 0 && !session && (
            <div className="py-14 text-center">
              <p className="text-sm text-muted">
                Nothing matches{query.trim() ? ` "${query.trim()}"` : " that filter"}.
              </p>
              <PillButton
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </PillButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
