"use client";

import { useState } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { EditorPane } from "./editor-pane";
import { ENGINE_IDS, optimizeById, type Optimization } from "@/lib/optimizer";

const SAMPLES: Record<string, string> = {
  mysql:
    "SELECT * FROM orders\nWHERE DATE(created_at) = '2024-01-01'\nAND status = 'pending';",
  python:
    "items = [{'active': True, 'value': 3}]\nresult = []\nfor i in range(len(items)):\n    if items[i]['active'] == True:\n        result.append(items[i]['value'] * 2)\ntotal = 0\nfor v in result:\n    total = total + v\nprint(total)",
  pyspark:
    'df = spark.read.parquet("s3://bucket/events")\ndf = df.filter(df.country == "US")\nresult = df.groupBy("user_id").count().collect()\nfor row in result:\n    print(row)',
};

function sampleFor(engineId: string): string {
  return (
    SAMPLES[engineId] ?? "SELECT id, name FROM users WHERE status = 'active';"
  );
}

export function OptimizerTab() {
  const [engine, setEngine] = useState("mysql");
  const [code, setCode] = useState(sampleFor("mysql"));
  const [result, setResult] = useState<Optimization | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  function run() {
    const out = optimizeById(code, engine);
    setResult(out);
    // The engine surfaces a rejection as its leading change title.
    const firstChange = out.changes[0];
    setRejected(
      firstChange?.title.startsWith("Rewrite blocked")
        ? firstChange.detail
        : null,
    );
  }

  function onEngineChange(next: string) {
    setEngine(next);
    if (code.trim() === "" || Object.values(SAMPLES).includes(code))
      setCode(sampleFor(next));
    setResult(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <EditorPane
        label="Input"
        value={code}
        onChange={setCode}
        toolbar={
          <div className="flex items-center gap-2">
            <select
              value={engine}
              onChange={(e) => onEngineChange(e.target.value)}
              aria-label="Engine"
              className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
            >
              {ENGINE_IDS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <button onClick={run} className="btn btn-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Optimize
            </button>
          </div>
        }
      />

      <div className="panel flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-2">
          <span className="eyebrow">Optimized output</span>
          {result && (
            <span className="font-mono text-xs text-primary">
              {result.speedup}% est. speedup
            </span>
          )}
        </div>

        {!result && (
          <p className="p-4 text-sm text-subtle">
            Pick an engine and press Optimize. Everything runs in your browser —
            nothing is sent anywhere.
          </p>
        )}

        {result && (
          <div className="flex min-h-0 flex-1 flex-col">
            {rejected && (
              <p className="flex items-start gap-2 border-b border-border bg-warning/10 px-4 py-2 text-xs text-warning">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>Rewrite blocked to protect your logic: {rejected}</span>
              </p>
            )}
            {result.changes.length > 0 && (
              <ul className="max-h-48 space-y-1.5 overflow-auto border-b border-border p-4 text-xs">
                {result.changes.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>
                      <strong className="text-primary">{c.title}:</strong>{" "}
                      <span className="text-muted">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <pre className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-6">
              {result.output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
