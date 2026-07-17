"use client";

import React from "react";

/**
 * If a tab panel crashes at runtime, prod React blanks the subtree silently —
 * which is exactly what a "blank TWAP tab" looks like. This boundary catches
 * the crash and prints the real error on screen, so the next screenshot
 * diagnoses itself instead of showing an empty card.
 */
export class PanelBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose/30 bg-rose/[0.06] p-4">
          <p className="text-sm font-medium text-rose">This panel crashed</p>
          <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-rose/90">
            {String(this.state.error?.message ?? this.state.error).slice(0, 300)}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
