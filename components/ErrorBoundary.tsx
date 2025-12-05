import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useToast } from './Toast';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
    
    // Log error to console for debugging
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Show error toast
    // We can't use hooks in class components, so we'll use a workaround
    // by emitting a custom event
    const event = new CustomEvent('show-toast', {
      detail: {
        message: `An error occurred: ${error.message}`,
        type: 'error',
        duration: 5000
      }
    });
    window.dispatchEvent(event);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full bg-[#0a0a0a] text-red-200 flex-col items-center justify-center p-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold mb-4 text-red-500">Oops, something went wrong!</h1>
            <div className="bg-[#1a0a0a] p-4 rounded-md border border-red-800 mb-4 overflow-auto max-h-48">
              <h2 className="text-lg font-mono mb-2">Error Details:</h2>
              <p className="font-mono text-sm mb-2">{this.state.error?.toString()}</p>
              <pre className="font-mono text-xs text-red-400">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
            <button 
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              className="bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded-md font-mono text-sm transition-colors"
            >
              Reload Application
            </button>
            <p className="mt-4 text-sm text-gray-500 font-mono">
              You can try reloading the application. If the issue persists, please check the console for more details.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;