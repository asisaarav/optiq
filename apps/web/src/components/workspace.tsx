"use client";

import { useState } from "react";
import { Sparkles, Wand2, GitCompare } from "lucide-react";
import { OptimizerTab } from "./optimizer-tab";
import { BeautifierTab } from "./beautifier-tab";
import { CompareTab } from "./compare-tab";

type TabId = "optimize" | "beautify" | "compare";

const TABS: { id: TabId; label: string; icon: typeof Sparkles }[] = [
  { id: "optimize", label: "Optimize", icon: Sparkles },
  { id: "beautify", label: "Beautify", icon: Wand2 },
  { id: "compare", label: "Compare", icon: GitCompare },
];

export function Workspace() {
  const [tab, setTab] = useState<TabId>("optimize");

  return (
    <section id="workspace">
      <div
        role="tablist"
        aria-label="Tools"
        className="mb-5 inline-flex gap-1 rounded-lg border border-border bg-surface-2/80 p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-surface text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "optimize" && <OptimizerTab />}
      {tab === "beautify" && <BeautifierTab />}
      {tab === "compare" && <CompareTab />}
    </section>
  );
}
