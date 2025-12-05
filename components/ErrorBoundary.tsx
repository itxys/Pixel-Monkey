import React, { useState, useEffect } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorInfo, setErrorInfo] = useState<any>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
      
      // Log error to console for debugging
      console.error('Error caught by boundary:', event.error);
      
      // Show error toast
      const toastEvent = new CustomEvent('show-toast', {
        detail: {
          message: `An error occurred: ${event.error?.message || 'Unknown error'}`,
          type: 'error',
          duration: 5000
        }
      });
      window.dispatchEvent(toastEvent);
    };

    // Add error listener
    window.addEventListener('error', handleError);
    
    // Cleanup
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  if (hasError) {
    return (
      <div className="flex h-screen w-full bg-[#0a0a0a] text-red-200 flex-col items-center justify-center p-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-4 text-red-500">Oops, something went wrong!</h1>
          <div className="bg-[#1a0a0a] p-4 rounded-md border border-red-800 mb-4 overflow-auto max-h-48">
            <h2 className="text-lg font-mono mb-2">Error Details:</h2>
            <p className="font-mono text-sm mb-2">{error?.toString()}</p>
            <pre className="font-mono text-xs text-red-400">
              {errorInfo?.componentStack || 'No stack trace available'}
            </pre>
          </div>
          <button 
            onClick={() => {
              setHasError(false);
              setError(null);
              setErrorInfo(null);
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

  return <>{children}</>;
};

export default ErrorBoundary;