import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMsg = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(displayMsg) as { error?: string; operationType?: string };
      if (parsed?.error) {
        displayMsg = `Storage error (${parsed.operationType || 'read'}): ${parsed.error}`;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, message: displayMsg };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('KulfiSync ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#111013] px-6 text-[#F4F1EC]">
          <div className="w-full max-w-md rounded-2xl border border-[#F07167]/40 bg-[#19171C] p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-[#F48C84]" aria-hidden="true" />
            <h1 className="mt-4 font-display text-xl font-semibold">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#B6B0BA]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#D94B6A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C63D5B]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
