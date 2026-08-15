"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { optimizeAction, type OptimizeState } from "@/app/actions";
import type { EngineInfo } from "@/lib/api";

const SAMPLE = `SELECT * FROM orders
WHERE DATE(created_at) = '2024-01-01'
AND status = 'pending';`;

export function Workspace({ engines }: { engines: EngineInfo[] }) {
  const [state, formAction, pending] = useActionState<OptimizeState, FormData>(
    optimizeAction,
    {
      status: "idle",
    },
  );
  const [code, setCode] = useState(SAMPLE);

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-2">
      <div className="panel flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-3 py-2">
          <label className="sr-only" htmlFor="engine">
            Engine
          </label>
          <select
            id="engine"
            name="engine"
            defaultValue="mysql"
            className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
          >
            {engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className="btn btn-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {pending ? "Optimizing…" : "Optimize"}
          </button>
        </div>
        <label className="sr-only" htmlFor="code">
          Code to optimize
        </label>
        <textarea
          id="code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={50_000}
          spellCheck={false}
          className="h-80 w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-6 outline-none"
        />
      </div>

      <div className="panel flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-2">
          <span className="eyebrow">Optimized output</span>
          {state.status === "ok" && (
            <span className="font-mono text-xs text-primary">
              {state.result.speedup}% est. speedup
            </span>
          )}
        </div>

        {state.status === "error" && (
          <p className="flex items-start gap-2 p-4 text-sm text-danger">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              {state.message}
              {state.requestId && (
                <span className="ml-1 font-mono text-xs text-subtle">
                  ({state.requestId})
                </span>
              )}
            </span>
          </p>
        )}

        {state.status === "ok" && (
          <>
            {state.result.rejected && (
              <p className="border-b border-border bg-warning/10 px-4 py-2 text-xs text-warning">
                Rewrite blocked: {state.result.rejected}
              </p>
            )}
            <ul className="space-y-1.5 border-b border-border p-4 text-xs">
              {state.result.changes.map((c, i) => (
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
            <pre className="overflow-auto p-4 font-mono text-[13px] leading-6">
              {state.result.output}
            </pre>
          </>
        )}

        {state.status === "idle" && !pending && (
          <p className="p-4 text-sm text-subtle">
            Paste a query and press Optimize. Nothing is stored.
          </p>
        )}
      </div>
    </form>
  );
}
