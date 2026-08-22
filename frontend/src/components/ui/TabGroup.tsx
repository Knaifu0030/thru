interface Tab {
  id: string;
  label: string;
}

interface Props {
  name: string; // unique per instance
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Segmented control: the active tab is a flat ink inversion.
 * No layoutId slide — a layout-animated element inside an exiting overlay
 * deadlocks AnimatePresence unmounts (drawer would never close).
 */
export function TabGroup({ name, tabs, active, onChange }: Props) {
  return (
    <div role="tablist" aria-label={name} className="inline-flex rounded-[2px] border border-white/10 bg-black/25 p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative rounded-[2px] px-4 py-1.5 text-sm transition-colors duration-200 ${
              isActive ? "bg-ink font-medium text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
