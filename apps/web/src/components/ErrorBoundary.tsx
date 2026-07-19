import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Server } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  incidentId: string | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null, incidentId: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      incidentId: `ui-${crypto.randomUUID().slice(0, 12)}`,
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[darwin:web]', {
      event: 'view_render_failed',
      incidentId: this.state.incidentId,
      error: error.name,
      componentStack: info.componentStack,
    });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-carbon px-5 text-white">
        <section className="surface-panel w-full max-w-[620px]" role="alert">
          <div className="panel-heading">
            <div>
              <p className="section-label">View isolated</p>
              <h1 className="mt-2 text-2xl font-semibold">
                Darwin contained a control-room error
              </h1>
            </div>
            <AlertTriangle className="text-amber" size={22} />
          </div>
          <div className="space-y-5 p-6">
            <p className="text-sm leading-6 text-mist">
              The active view failed without changing the target application or
              mutation state. Reload the control room, or open System status to
              export recent diagnostics.
            </p>
            <code className="block text-xs text-mist">
              {this.state.incidentId} · {this.state.error.name}
            </code>
            <div className="flex flex-wrap gap-3">
              <button
                className="primary-action"
                type="button"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={16} /> Reload control room
              </button>
              <a className="secondary-action" href="/?view=status">
                <Server size={16} /> Open System status
              </a>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
