import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PixelControls } from './components/PixelControls';
import { Toolbox } from './components/Toolbox';
import { Workstation } from './components/Workstation';
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

  const createLayer = (name: string): Layer => ({
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    data: new Map()
  });

  const [project, setProject] = useState<ProjectState>({
    activeLayerId: '', 
    savedColors: ['#ffb000', '#00cccc', '#ff4400', '#ffffff', '#000000']
  });

  // Active layer state management
  const [activeLayer, setActiveLayer] = useState<Layer>(createLayer('Layer 1'));

  useEffect(() => {
    if (!project.activeLayerId) {
       setProject(prev => ({
           ...prev,
           activeLayerId: activeLayer.id
       }));
    }
  }, [project.activeLayerId, activeLayer.id]);

  const [history, setHistory] = useState<ProjectState[]>([]);
  const [future, setFuture] = useState<ProjectState[]>([]);

  const cloneProject = (proj: ProjectState): ProjectState => {
    return {
      ...proj,
      savedColors: [...proj.savedColors] // Create a copy of the saved colors array
    };
  };

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
        const newHistory = [...prev, cloneProject(project)];
        if (newHistory.length > 20) newHistory.shift();
        return newHistory;
    });
    setFuture([]);
  }, [project]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(prev => [cloneProject(project), ...prev]);
    setProject(previous);
    setHistory(prev => prev.slice(0, prev.length - 1));
  }, [history, project]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, cloneProject(project)]);
    setProject(next);
    setFuture(prev => prev.slice(1));
  }, [future, project]);

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

  return (
    <div className="flex h-screen w-full bg-[#050505] text-[#ccc] font-retro-text overflow-hidden">
      
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
  );
};

export default App;