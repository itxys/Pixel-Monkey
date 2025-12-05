import React, { useEffect, useState, useCallback } from 'react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 3000, 
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);
  
  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return 'bg-red-900/90 text-red-200 border-red-500';
      case 'success':
        return 'bg-green-900/90 text-green-200 border-green-500';
      case 'warning':
        return 'bg-yellow-900/90 text-yellow-200 border-yellow-500';
      case 'info':
      default:
        return 'bg-blue-900/90 text-blue-200 border-blue-500';
    }
  };
  
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`px-4 py-3 border-l-4 rounded-md shadow-lg ${getTypeStyles()}`}>
        <p className="text-sm font-mono">{message}</p>
        <button 
          onClick={onClose}
          className="absolute top-1 right-1 text-current hover:text-white opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
};

interface ToastProviderProps {
  children: React.ReactNode;
}

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
  duration: number;
  visible: boolean;
}

export const ToastContext = React.createContext<{
  showToast: (message: string, type?: 'error' | 'success' | 'info' | 'warning', duration?: number) => void;
}>({ 
  showToast: () => {} 
});

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    duration: 3000,
    visible: false
  });
  
  const showToast = useCallback((message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info', duration: number = 3000) => {
    setToast({ message, type, duration, visible: true });
  }, []);
  
  const closeToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);
  
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.visible && (
        <Toast 
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={closeToast}
        />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => React.useContext(ToastContext);