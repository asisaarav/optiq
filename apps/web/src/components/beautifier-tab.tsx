"use client";

import { useState } from "react";
import { Wand2, AlertTriangle, Copy, Check } from "lucide-react";
import { EditorPane } from "./editor-pane";
import {
  beautify,
  detectLanguage,
  languageLabel,
  LANGUAGES,
  type Language,
} from "@/lib/beautify";

const SAMPLE =
  '{"name":"optiq","engines":["sql","python"],"nested":{"ok":true,"count":3}}';

export function BeautifierTab() {
  const [code, setCode] = useState(SAMPLE);
  const [language, setLanguage] = useState<Language>("json");
  const [auto, setAuto] = useState(true);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const effective: Language = auto ? detectLanguage(code) : language;

  async function run() {
    setBusy(true);
    setError(null);
    const result = await beautify(code, effective);
    setBusy(false);
    if (result.ok) {
      setOutput(result.output);
    } else {
      setOutput("");
      setError(result.error ?? "Could not format this input.");
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <EditorPane
        label="Input"
        value={code}
        onChange={setCode}
        toolbar={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                className="accent-[oklch(0.8_0.19_155)]"
              />
              Auto-detect
            </label>
            <select
              value={effective}
              onChange={(e) => {
                setAuto(false);
                setLanguage(e.target.value as Language);
              }}
              aria-label="Language"
              className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
            >
              {LANGUAGES.filter((l) => l.beautifiable).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <button onClick={run} disabled={busy} className="btn btn-primary">
              <Wand2 className="size-3.5" aria-hidden="true" />
              {busy ? "Formatting…" : "Beautify"}
            </button>
          </div>
        }
        footer={
          <span className="text-subtle">
            Detected:{" "}
            <span className="text-muted">{languageLabel(effective)}</span>
          </span>
        }
      />

      <div className="panel flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-2">
          <span className="eyebrow">Formatted</span>
          {output && (
            <button onClick={copy} className="btn btn-secondary h-6 px-2">
              {copied ? (
                <Check className="size-3 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        {error ? (
          <p className="flex items-start gap-2 p-4 text-sm text-danger">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {error}
          </p>
        ) : output ? (
          <pre className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-6">
            {output}
          </pre>
        ) : (
          <p className="p-4 text-sm text-subtle">
            Paste SQL, JSON, JS/TS, HTML, CSS, YAML, XML or Markdown.
            Auto-detect picks the language; press Beautify.
          </p>
        )}
      </div>
    </div>
  );
}
