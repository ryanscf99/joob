"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render crashes so one bad panel does not blank the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="rounded-3xl border border-joob-coral/25 bg-white p-8 shadow-card">
            <p className="text-4xl" aria-hidden>
              🐱
            </p>
            <h2 className="mt-3 text-lg font-extrabold text-joob-cocoa">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="mt-2 text-sm text-joob-cocoaSoft">
              The page hit an unexpected error. Try reloading — your profile
              data is usually still saved in this browser.
            </p>
            <button
              type="button"
              className="joob-btn-primary mt-6"
              onClick={() => {
                this.setState({ error: null });
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Reload jOOB
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
