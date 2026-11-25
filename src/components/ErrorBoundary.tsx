import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "An unexpected rendering error occurred.",
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error captured cleanly by boundary without crashing the app
  }

  handleRecover = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090514] text-violet-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#120926] border border-violet-500/30 rounded-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h1 className="font-display text-base font-semibold text-violet-50">
                  Safe Recovery Mode
                </h1>
                <p className="mt-1 text-xs text-violet-200/75 leading-relaxed">
                  {this.state.errorMessage}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleRecover}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-violet-400 hover:bg-violet-300 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restore Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
