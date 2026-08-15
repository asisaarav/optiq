import * as React from "react";

type Props = { name: string; children: React.ReactNode };
type State = { error: Error | null };

/**
 * Panel-level error boundary: one crashing tab shows a recoverable card
 * instead of blanking the whole optimizer.
 */
export class PanelBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}] panel crashed`, error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="rounded-xl ring-1 ring-destructive/40 bg-destructive/5 p-6 space-y-3"
      >
        <h3 className="font-mono text-sm font-bold text-destructive">
          {this.props.name} hit an unexpected error
        </h3>
        <p className="text-xs text-muted-foreground max-w-[60ch] font-mono break-words">
          {error.message || "Unknown error"}
        </p>
        <button
          onClick={this.reset}
          className="text-xs font-bold bg-secondary border border-border px-3 py-1.5 rounded hover:border-primary hover:text-primary transition-colors"
        >
          Reload this panel
        </button>
      </div>
    );
  }
}
