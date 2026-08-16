"use client";

import type { ReactNode } from "react";

interface EditorPaneProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  toolbar?: ReactNode;
  footer?: ReactNode;
  minHeight?: string;
}

/**
 * A titled code editor pane. Read-only panes render the same monospace surface
 * so input and output are visually consistent.
 */
export function EditorPane({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  toolbar,
  footer,
  minHeight = "20rem",
}: EditorPaneProps) {
  return (
    <div className="panel flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-3 py-2">
        <span className="eyebrow">{label}</span>
        {toolbar}
      </div>
      <textarea
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        maxLength={50_000}
        aria-label={label}
        className="w-full flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-6 outline-none placeholder:text-subtle"
        style={{ minHeight }}
      />
      {footer && (
        <div className="border-t border-border px-3 py-1.5 text-[11px]">
          {footer}
        </div>
      )}
    </div>
  );
}
