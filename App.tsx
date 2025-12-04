import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PixelControls } from './components/PixelControls';
import { Toolbox } from './components/Toolbox';
import { Timeline } from './components/Timeline';
import { Workstation } from './components/Workstation';
import { 
  PixelSettings, 
  ProcessingState, 
  AIAnalysisResult, 
  Language, 
  DrawingTool,
  ProjectState,
  Frame,
  Layer,
  AIHistoryItem
} from './types';
import { analyzePixelArt, editPixelArt, generateAnimationFrame } from './services/geminiService';

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
    hsl: { brightness: 0, saturation: 0, hue: 0 }
  });

  const [activeTool, setActiveTool] = useState<DrawingTool>('pan');
  const [brushColor, setBrushColor] = useState<string>('#ffb000');

  const createLayer = (name: string): Layer => ({
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    data: new Map()
  });

  const createFrame = (): Frame => ({
    id: crypto.randomUUID(),
    layers: [createLayer('Layer 1')]
  });

  const [project, setProject] = useState<ProjectState>({
    frames: [createFrame()],
    currentFrameIndex: 0,
    activeLayerId: '', 
    fps: 8,
    onionSkin: false,
    isPlaying: false,
    savedColors: ['#ffb000', '#00cccc', '#ff4400', '#ffffff', '#000000']
  });

  useEffect(() => {
    if (!project.activeLayerId && project.frames.length > 0) {
       setProject(prev => ({
           ...prev,
           activeLayerId: prev.frames[0].layers[0].id
       }));
    }
  }, [project.frames]);

  const [history, setHistory] = useState<ProjectState[]>([]);
  const [future, setFuture] = useState<ProjectState[]>([]);

  const cloneProject = (proj: ProjectState): ProjectState => {
    return {
      ...proj,
      frames: proj.frames.map(f => ({
        ...f,
        layers: f.layers.map(l => ({
          ...l,
          data: new Map(l.data)
        }))
      }))
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

  const [aiHistory, setAiHistory] = useState<AIHistoryItem[]>([]);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    previewUrl: null,
    originalWidth: 0,
    originalHeight: 0,
    processedWidth: 0,
    processedHeight: 0,
  });

  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  const handleDownload = (saveScaled: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!saveScaled) {
      const link = document.createElement('a');
      link.download = `pixel-perfect-1x-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
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
  };

  const handleAnalyze = async () => {
    if (!canvasRef.current) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const base64 = canvasRef.current.toDataURL('image/png');
      const result = await analyzePixelArt(base64, language);
      setAnalysisResult(result);
    } catch (error) {
      console.error("Analysis failed", error);
      alert(language === 'zh' ? "分析失败，请检查 API Key" : "Failed to analyze image. Ensure API Key is set.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAiEdit = async (prompt: string) => {
    if (!canvasRef.current) return;
    setIsAiEditing(true);
    try {
        const base64 = canvasRef.current.toDataURL('image/png');
        const newImageBase64 = await editPixelArt(base64, prompt);
        
        setAiHistory(prev => [{
            id: crypto.randomUUID(),
            url: newImageBase64,
            prompt,
            timestamp: Date.now()
        }, ...prev]);

        const event = new CustomEvent('UPDATE_SOURCE_IMAGE', { detail: newImageBase64 });
        window.dispatchEvent(event);
        
    } catch (error) {
        console.error("AI Edit failed", error);
        alert(language === 'zh' ? "AI 生成失败" : "AI Generation failed.");
    } finally {
        setIsAiEditing(false);
    }
  };
  
  const handleAiAnimate = async (prompt: string) => {
    if (!canvasRef.current) return;
    setIsAiEditing(true);
    try {
        const base64 = canvasRef.current.toDataURL('image/png');
        const newFrameBase64 = await generateAnimationFrame(base64, prompt);
        
        setAiHistory(prev => [{
            id: crypto.randomUUID(),
            url: newFrameBase64,
            prompt: `[ANIM] ${prompt}`,
            timestamp: Date.now()
        }, ...prev]);
        
    } catch (error) {
         console.error("AI Anim failed", error);
    } finally {
        setIsAiEditing(false);
    }
  }

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
         language={language}
         project={project}
         setProject={setProject}
      />

      {/* CENTER: Canvas + Timeline */}
      <div className="flex flex-col flex-1 min-w-0">
          <Workstation 
            settings={settings}
            setProcessingState={setProcessingState}
            onCanvasReady={handleCanvasReady}
            analysisResult={analysisResult}
            language={language}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            project={project}
            setProject={setProject}
            pushToHistory={pushToHistory}
          />
          <Timeline 
            project={project}
            setProject={setProject}
            language={language}
          />
      </div>

      {/* RIGHT: Properties Panel */}
      <PixelControls 
        settings={settings}
        setSettings={setSettings}
        processingState={processingState}
        onDownload={handleDownload}
        onAnalyze={handleAnalyze}
        onAiEdit={handleAiEdit}
        isAnalyzing={isAnalyzing}
        isAiEditing={isAiEditing}
        language={language}
        setLanguage={setLanguage}
        project={project}
        setProject={setProject}
        pushToHistory={pushToHistory}
        undo={handleUndo}
        redo={handleRedo}
        aiHistory={aiHistory}
        onAiAnimate={handleAiAnimate}
      />
    </div>
  );
};

export default App;