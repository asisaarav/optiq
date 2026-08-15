/**
 * Sandboxed Python runner.
 *
 * Pyodide is loaded inside a dedicated Web Worker built from a Blob, so pasted
 * code has no access to the DOM, cookies, or app state, and an infinite loop
 * can be killed with `worker.terminate()` instead of freezing the page.
 */

import { PY_TIMEOUT_MS } from "./limits";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

const WORKER_SOURCE = `
self.importScripts("${PYODIDE_INDEX}pyodide.js");
let pyodideReady = null;

async function boot() {
  if (!pyodideReady) {
    pyodideReady = self.loadPyodide({ indexURL: "${PYODIDE_INDEX}" });
  }
  return pyodideReady;
}

self.onmessage = async (event) => {
  const code = String(event.data && event.data.code ? event.data.code : "");
  try {
    self.postMessage({ type: "phase", phase: "loading" });
    const py = await boot();
    self.postMessage({ type: "phase", phase: "running" });
    const emit = (text) => self.postMessage({ type: "stdout", text: String(text) });
    py.setStdout({ batched: emit });
    py.setStderr({ batched: emit });
    try {
      if (py.loadPackagesFromImports) {
        try { await py.loadPackagesFromImports(code); } catch (_) { /* surface at runtime */ }
      }
      await py.runPythonAsync(code);
      self.postMessage({ type: "done" });
    } catch (err) {
      self.postMessage({ type: "error", message: (err && err.message) ? err.message : String(err) });
    }
  } catch (err) {
    self.postMessage({
      type: "fatal",
      message: (err && err.message) ? err.message : String(err),
    });
  }
};
`;

export type PyPhase = "loading" | "running";

export type PyRunOptions = {
  onStdout: (chunk: string) => void;
  onPhase?: (phase: PyPhase) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type PyRunOutcome = {
  status: "success" | "error" | "timeout" | "unavailable";
  message?: string;
};

function createWorker(): Worker {
  const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  // Safe to revoke immediately — the worker already holds the script.
  URL.revokeObjectURL(url);
  return worker;
}

export function runPythonSandboxed(code: string, opts: PyRunOptions): Promise<PyRunOutcome> {
  if (typeof Worker === "undefined") {
    return Promise.resolve({
      status: "unavailable",
      message: "This browser does not support the sandboxed Python runtime (Web Workers).",
    });
  }

  const timeoutMs = opts.timeoutMs ?? PY_TIMEOUT_MS;

  return new Promise<PyRunOutcome>((resolve) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch (err) {
      resolve({
        status: "unavailable",
        message: err instanceof Error ? err.message : "Could not start the Python sandbox.",
      });
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: PyRunOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(outcome);
    };

    function onAbort() {
      finish({ status: "timeout", message: "Run cancelled." });
    }

    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () =>
          finish({
            status: "timeout",
            message: `Execution exceeded ${Math.round(ms / 1000)}s and was stopped — check for an unbounded loop.`,
          }),
        ms,
      );
    };

    // Cold start downloads the runtime, so allow extra head-room until the
    // worker reports it is actually executing user code.
    arm(timeoutMs + 45_000);
    opts.signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "stdout"; text: string }
        | { type: "phase"; phase: PyPhase }
        | { type: "done" }
        | { type: "error"; message: string }
        | { type: "fatal"; message: string };

      switch (data.type) {
        case "stdout":
          opts.onStdout(data.text);
          break;
        case "phase":
          opts.onPhase?.(data.phase);
          if (data.phase === "running") arm(timeoutMs);
          break;
        case "done":
          finish({ status: "success" });
          break;
        case "error":
          finish({ status: "error", message: data.message });
          break;
        case "fatal":
          finish({ status: "unavailable", message: data.message });
          break;
      }
    };

    worker.onerror = (event) => {
      finish({
        status: "unavailable",
        message: event.message || "The Python sandbox failed to start.",
      });
    };

    worker.postMessage({ code });
  });
}
