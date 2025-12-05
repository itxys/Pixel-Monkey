import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PixelControls } from './components/PixelControls';
import { Toolbox } from './components/Toolbox';
import { Workstation } from './components/Workstation';
import { Toast, ToastProvider, ToastContext } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { 
  PixelSettings, 
  ProcessingState, 
  Language, 
  DrawingTool,
  ProjectState,
  Layer
} from './types';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('zh'); 
  
  const [settings, setSettings] = useState<PixelSettings>({
    pixelSize: 6,
    scale: 1,
    isGrayscale: false,
    paletteSize: 16, 
    contrast: 1.2, 
    smoothing: 1, 
    dithering: 0.1,
    outlineColor: '#ffffff',
    hasOutline: false,
    outlineThickness: 1,
    hsl: { brightness: 0, saturation: 0, hue: 0 },
    showGrid: false,
    gridColor: '#333333',
    gridOpacity: 0.5
  });

  const [activeTool, setActiveTool] = useState<DrawingTool>('pan');
  const [brushColor, setBrushColor] = useState<string>('#ffb000');
  const [brushSize, setBrushSize] = useState<number>(1); // 笔刷大小，默认为1
  const [recentColors, setRecentColors] = useState<string[]>([]); // 最近使用颜色列表
  
  // Symmetry drawing state
  const [symmetryEnabled, setSymmetryEnabled] = useState(false);
  const [symmetryType, setSymmetryType] = useState<'vertical' | 'horizontal'>('vertical');

  const createLayer = (name: string, width = 32, height = 32): Layer => ({
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    data: new Uint8ClampedArray(width * height * 4), // Initialize with transparent pixels
    width,
    height
  });

  // Manage recent colors
  const updateRecentColors = useCallback((color: string) => {
    if (!color) return;
    
    setRecentColors(prev => {
      // Remove color if it already exists
      const filtered = prev.filter(c => c !== color);
      // Add to the beginning of the list
      const updated = [color, ...filtered];
      // Limit to 8 recent colors
      return updated.slice(0, 8);
    });
  }, []);

  // Update recent colors when brush color changes
  useEffect(() => {
    updateRecentColors(brushColor);
  }, [brushColor, updateRecentColors]);

  const [project, setProject] = useState<ProjectState>({
    activeLayerId: '', 
    savedColors: ['#ffb000', '#00cccc', '#ff4400', '#ffffff', '#000000']
  });

  // Active layer state management
  const [activeLayer, setActiveLayer] = useState<Layer>(createLayer('Layer 1', 32, 32));

  useEffect(() => {
    if (!project.activeLayerId) {
       setProject(prev => ({
           ...prev,
           activeLayerId: activeLayer.id
       }));
    }
  }, [project.activeLayerId, activeLayer.id]);

  // History management with delta records
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  // Push delta to history
  const pushToHistory = useCallback((delta: HistoryDelta) => {
    setHistory(prev => {
        const newHistory = [...prev, { delta, timestamp: Date.now() }];
        if (newHistory.length > 20) newHistory.shift();
        return newHistory;
    });
    setFuture([]);
  }, []);

  // Apply delta to layer data
  const applyDelta = useCallback((delta: HistoryDelta, isUndo: boolean = false) => {
    if (delta.type === 'pixel' && delta.changes) {
      // Apply pixel changes to active layer
      setActiveLayer(prev => {
        const newData = new Uint8ClampedArray(prev.data);
        const layerWidth = prev.width;
        
        delta.changes!.forEach(change => {
          const { x, y, oldColor, newColor } = change;
          const targetColor = isUndo ? oldColor : newColor;
          const idx = (y * layerWidth + x) * 4;
          
          newData[idx] = targetColor[0];     // R
          newData[idx + 1] = targetColor[1]; // G
          newData[idx + 2] = targetColor[2]; // B
          newData[idx + 3] = targetColor[3]; // A
        });
        
        return { ...prev, data: newData };
      });
    }
    // Handle other delta types here when needed
  }, []);

  // Undo operation
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    
    const lastEntry = history[history.length - 1];
    applyDelta(lastEntry.delta, true);
    
    setFuture(prev => [lastEntry, ...prev]);
    setHistory(prev => prev.slice(0, prev.length - 1));
  }, [history, applyDelta]);

  // Redo operation
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    
    const nextEntry = future[0];
    applyDelta(nextEntry.delta, false);
    
    setHistory(prev => [...prev, nextEntry]);
    setFuture(prev => prev.slice(1));
  }, [future, applyDelta]);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    previewUrl: null,
    originalWidth: 0,
    originalHeight: 0,
    processedWidth: 0,
    processedHeight: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  /**
   * 处理图片导出功能
   * @param mode 导出模式：'raw'（原始尺寸）、'scaled'（自动缩放）、'standard'（标准尺寸）
   * @param size 标准尺寸，如 16、32、64 等，仅在 mode 为 'standard' 时使用
   */
  const handleDownload = (mode: 'raw' | 'scaled' | 'standard' = 'raw', size?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 原始尺寸导出
    if (mode === 'raw') {
      const link = document.createElement('a');
      link.download = `pixel-perfect-1x-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    // 自动缩放导出
    else if (mode === 'scaled') {
      const scaleFactor = Math.max(10, Math.floor(1024 / canvas.width)); 
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = canvas.width * scaleFactor;
      displayCanvas.height = canvas.height * scaleFactor;
      
      const ctx = displayCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false; 
        ctx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);
        
        const link = document.createElement('a');
        link.download = `pixel-perfect-hd-${Date.now()}.png`;
        link.href = displayCanvas.toDataURL('image/png');
        link.click();
      }
    }
    // 标准尺寸导出
    else if (mode === 'standard' && size) {
      const displayCanvas = document.createElement('canvas');
      displayCanvas.width = size;
      displayCanvas.height = size;
      
      const ctx = displayCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false; 
        
        // 计算绘制位置，居中绘制
        const x = (size - canvas.width) / 2;
        const y = (size - canvas.height) / 2;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);
        
        ctx.drawImage(canvas, x, y);
        
        const link = document.createElement('a');
        link.download = `pixel-perfect-${size}x${size}-${Date.now()}.png`;
        link.href = displayCanvas.toDataURL('image/png');
        link.click();
      }
    }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              handleUndo();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
              e.preventDefault();
              handleRedo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Add custom event listener for showing toasts from anywhere in the app
  useEffect(() => {
    const handleShowToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; type: 'error' | 'success' | 'info' | 'warning'; duration: number }>;
      const toastContext = React.useContext(ToastContext);
      toastContext.showToast(
        customEvent.detail.message,
        customEvent.detail.type,
        customEvent.detail.duration
      );
    };
    
    window.addEventListener('show-toast', handleShowToast as EventListener);
    
    return () => {
      window.removeEventListener('show-toast', handleShowToast as EventListener);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="flex h-screen w-full bg-[#050505] text-[#ccc] font-retro-text overflow-hidden flex-col">
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT: Toolbox (Tools & Color) */}
            <Toolbox 
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              brushColor={brushColor}
              setBrushColor={setBrushColor}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              language={language}
              project={project}
              setProject={setProject}
              recentColors={recentColors}
              updateRecentColors={updateRecentColors}
              symmetryEnabled={symmetryEnabled}
              setSymmetryEnabled={setSymmetryEnabled}
              symmetryType={symmetryType}
              setSymmetryType={setSymmetryType}
            />

            {/* CENTER: Canvas */}
            <div className="flex flex-col flex-1 min-w-0">
                <Workstation 
                  settings={settings}
                  setProcessingState={setProcessingState}
                  onCanvasReady={handleCanvasReady}
                  language={language}
                  activeTool={activeTool}
                  setActiveTool={setActiveTool}
                  brushColor={brushColor}
                  setBrushColor={setBrushColor}
                  brushSize={brushSize}
                  setBrushSize={setBrushSize}
                  project={project}
                  setProject={setProject}
                  activeLayer={activeLayer}
                  setActiveLayer={setActiveLayer}
                  pushToHistory={pushToHistory}
                  symmetryEnabled={symmetryEnabled}
                  symmetryType={symmetryType}
                />
            </div>

            {/* RIGHT: Properties Panel */}
            <PixelControls 
              settings={settings}
              setSettings={setSettings}
              processingState={processingState}
              onDownload={handleDownload}
              language={language}
              setLanguage={setLanguage}
              project={project}
              setProject={setProject}
              pushToHistory={pushToHistory}
              undo={handleUndo}
              redo={handleRedo}
            />
          </div>
          
          {/* Footer with author info */}
          <div className="h-10 bg-[#0a0a0a] border-t border-[#333] text-xs font-medium flex items-center justify-end gap-6 px-6" style={{ fontFamily: 'Microsoft YaHei, sans-serif' }}>
            <span className="text-[#6b7280]">作者：超级侯小侯</span>
            <a 
              href="https://space.bilibili.com/3099272" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[#00cccc] hover:underline"
            >
              https://space.bilibili.com/3099272
            </a>
            <span className="text-[#6b7280]">Q群：661677966</span>
          </div>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;