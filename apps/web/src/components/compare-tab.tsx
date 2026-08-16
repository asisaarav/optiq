"use client";

import { useState } from "react";
import { GitCompare, ArrowLeftRight } from "lucide-react";
import { EditorPane } from "./editor-pane";
import { beautify, detectLanguage, languageLabel } from "@/lib/beautify";
import { diffLines, type DiffResult } from "@/lib/diff";

const LEFT_SAMPLE = "SELECT id, name FROM users WHERE status = 'active';";
const RIGHT_SAMPLE =
  "select id, name, email from users where status='active' order by name;";

export function CompareTab() {
  const [left, setLeft] = useState(LEFT_SAMPLE);
  const [right, setRight] = useState(RIGHT_SAMPLE);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [ignoreWs, setIgnoreWs] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [busy, setBusy] = useState(false);

  // Beautify a side in place, auto-detecting its language first. Leaves the text
  // untouched if it cannot be parsed, so nothing is lost.
  async function tidy(text: string, set: (v: string) => void) {
    const lang = detectLanguage(text);
    const result = await beautify(text, lang);
    if (result.ok) set(result.output);
  }

  async function compare() {
    setBusy(true);
    // Beautify both sides so a pure formatting difference doesn't show as a diff,
    // then compute the line diff.
    const [l, r] = await Promise.all([
      beautify(left, detectLanguage(left)),
      beautify(right, detectLanguage(right)),
    ]);
    const leftText = l.ok ? l.output : left;
    const rightText = r.ok ? r.output : right;
    if (l.ok) setLeft(leftText);
    if (r.ok) setRight(rightText);
    setDiff(
      diffLines(leftText, rightText, {
        ignoreWhitespace: ignoreWs,
        ignoreCase,
      }),
    );
    setBusy(false);
  }

  function swap() {
    setLeft(right);
    setRight(left);
    setDiff(null);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <EditorPane
          label="Left"
          value={left}
          onChange={setLeft}
          minHeight="14rem"
          toolbar={
            <button
              onClick={() => tidy(left, setLeft)}
              className="btn btn-secondary h-6 px-2"
            >
              Beautify
            </button>
          }
          footer={
            <span className="text-subtle">
              Detected:{" "}
              <span className="text-muted">
                {languageLabel(detectLanguage(left))}
              </span>
            </span>
          }
        />
        <EditorPane
          label="Right"
          value={right}
          onChange={setRight}
          minHeight="14rem"
          toolbar={
            <button
              onClick={() => tidy(right, setRight)}
              className="btn btn-secondary h-6 px-2"
            >
              Beautify
            </button>
          }
          footer={
            <span className="text-subtle">
              Detected:{" "}
              <span className="text-muted">
                {languageLabel(detectLanguage(right))}
              </span>
            </span>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={compare} disabled={busy} className="btn btn-primary">
          <GitCompare className="size-3.5" aria-hidden="true" />
          {busy ? "Comparing…" : "Compare"}
        </button>
        <button onClick={swap} className="btn btn-secondary">
          <ArrowLeftRight className="size-3.5" aria-hidden="true" />
          Swap
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={ignoreWs}
            onChange={(e) => setIgnoreWs(e.target.checked)}
          />
          Ignore whitespace
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={ignoreCase}
            onChange={(e) => setIgnoreCase(e.target.checked)}
          />
          Ignore case
        </label>
        {diff && (
          <span className="ml-auto font-mono text-xs">
            <span className="text-primary">+{diff.stats.added}</span>{" "}
            <span className="text-danger">−{diff.stats.removed}</span>{" "}
            <span className="text-subtle">={diff.stats.unchanged}</span>
          </span>
        )}
      </div>

      {diff && (
        <div className="panel overflow-hidden">
          {diff.identical ? (
            <p className="p-4 text-sm text-primary">
              The two inputs are identical after formatting.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full border-collapse font-mono text-[12px] leading-5">
                <tbody>
                  {diff.rows.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        row.op === "added"
                          ? "bg-primary/10"
                          : row.op === "removed"
                            ? "bg-danger/10"
                            : ""
                      }
                    >
                      <td className="w-10 select-none border-r border-border px-2 text-right text-subtle">
                        {row.leftLine ?? ""}
                      </td>
                      <td className="w-1/2 whitespace-pre-wrap px-3">
                        {row.op !== "added" && (
                          <>
                            {row.op === "removed" && (
                              <span className="mr-1 text-danger">−</span>
                            )}
                            {row.left}
                          </>
                        )}
                      </td>
                      <td className="w-10 select-none border-x border-border px-2 text-right text-subtle">
                        {row.rightLine ?? ""}
                      </td>
                      <td className="w-1/2 whitespace-pre-wrap px-3">
                        {row.op !== "removed" && (
                          <>
                            {row.op === "added" && (
                              <span className="mr-1 text-primary">+</span>
                            )}
                            {row.right}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
