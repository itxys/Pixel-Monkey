import React, { useState } from 'react';
import { PixelSettings, ProcessingState, Language, LABELS, ProjectState, AIHistoryItem } from '../types';
import { Download, Sparkles, Monitor, Palette, Wand2, Plus, Trash2, Eye, EyeOff, Undo, Redo, Languages, Image as ImageIcon } from 'lucide-react';

interface PixelControlsProps {
  settings: PixelSettings;
  setSettings: React.Dispatch<React.SetStateAction<PixelSettings>>;
  processingState: ProcessingState;
  onDownload: (scaled: boolean) => void;
  onAnalyze: () => void;
  onAiEdit: (prompt: string) => void;
  isAnalyzing: boolean;
  isAiEditing: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  pushToHistory: () => void;
  undo: () => void;
  redo: () => void;
  aiHistory: AIHistoryItem[];
  onAiAnimate: (prompt: string) => void;
}

export const PixelControls: React.FC<PixelControlsProps> = ({
  settings,
  setSettings,
  processingState,
  onDownload,
  onAnalyze,
  onAiEdit,
  isAnalyzing,
  isAiEditing,
  language,
  setLanguage,
  project,
  setProject,
  pushToHistory,
  undo,
  redo,
  aiHistory,
  onAiAnimate
}) => {
  
  const t = LABELS[language];
  const [aiPrompt, setAiPrompt] = useState('');

  const handleSettingChange = (key: keyof PixelSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleHSLChange = (key: keyof PixelSettings['hsl'], value: number) => {
      setSettings(prev => ({ ...prev, hsl: { ...prev.hsl, [key]: value } }));
  };

  const activeFrame = project.frames[project.currentFrameIndex];
  
  const addLayer = () => {
      pushToHistory();
      const newLayer = {
          id: crypto.randomUUID(),
          name: `Layer ${activeFrame.layers.length + 1}`,
          visible: true,
          opacity: 1,
          data: new Map()
      };
      setProject(prev => {
          const newFrames = [...prev.frames];
          newFrames[prev.currentFrameIndex].layers.push(newLayer);
          return { ...prev, frames: newFrames, activeLayerId: newLayer.id };
      });
  };

  const deleteLayer = (layerId: string) => {
      pushToHistory();
      setProject(prev => {
          const newFrames = [...prev.frames];
          const layers = newFrames[prev.currentFrameIndex].layers;
          if (layers.length <= 1) return prev; 
          const newLayers = layers.filter(l => l.id !== layerId);
          return { 
              ...prev, 
              frames: newFrames.map((f, i) => i === prev.currentFrameIndex ? { ...f, layers: newLayers } : f),
              activeLayerId: newLayers[newLayers.length - 1].id 
            };
      });
  };

  const toggleLayerVis = (layerId: string) => {
      setProject(prev => {
          const newFrames = [...prev.frames];
          const layers = newFrames[prev.currentFrameIndex].layers.map(l => 
              l.id === layerId ? { ...l, visible: !l.visible } : l
          );
          return { 
              ...prev, 
              frames: newFrames.map((f, i) => i === prev.currentFrameIndex ? { ...f, layers } : f)
            };
      });
  };

  return (
    <div className="w-[280px] bg-[#0a0a0a] border-l border-[#333] flex flex-col h-full z-20 shrink-0">
      
      {/* Header */}
      <div className="p-4 bg-[#0f0f0f] border-b border-[#333] flex justify-between items-center shadow-lg">
          <h1 className="text-xl font-retro-title tracking-tighter text-[#ffb000] text-glow border-l-4 border-[#ffb000] pl-2">
            P//M
          </h1>
          <div className="flex gap-1">
            <button onClick={undo} className="p-1 hover:text-[#ffb000]" title={t.undo}><Undo className="w-4 h-4" /></button>
            <button onClick={redo} className="p-1 hover:text-[#ffb000]" title={t.redo}><Redo className="w-4 h-4" /></button>
            <button onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} className="p-1 text-[#ffb000] border border-[#ffb000] ml-1">
                <Languages className="w-4 h-4" />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-4">
        
        {/* Layer Manager */}
        <div className="cassette-border p-2 bg-[#111]">
            <div className="flex justify-between items-center mb-2 border-b border-[#333] pb-1">
                <span className="text-[10px] text-gray-300 tracking-widest">{t.layers}</span>
                <button onClick={addLayer}><Plus className="w-3 h-3 text-[#00cccc]" /></button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
                {activeFrame.layers.slice().reverse().map(layer => (
                    <div 
                    key={layer.id} 
                    onClick={() => setProject(p => ({ ...p, activeLayerId: layer.id }))}
                    className={`flex justify-between items-center p-1 text-[10px] cursor-pointer border ${project.activeLayerId === layer.id ? 'bg-[#222] border-[#ffb000] text-[#ffb000]' : 'border-transparent hover:bg-[#111]'}`}
                    >
                        <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); toggleLayerVis(layer.id); }}>
                                {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-gray-600" />}
                            </button>
                            <span className="truncate w-24">{layer.name}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}>
                            <Trash2 className="w-3 h-3 hover:text-red-500" />
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* Pixel Settings */}
        <div className="space-y-3">
             <div className="text-[10px] text-[#ffb000] font-bold tracking-widest border-b border-[#ffb000]/30 pb-1">RENDER SETTINGS</div>
             
             <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="text-[9px] text-gray-500 block">{t.pixelBlockSize}</label>
                    <input type="range" min="1" max="32" value={settings.pixelSize} onChange={(e) => handleSettingChange('pixelSize', parseInt(e.target.value))} className="accent-[#00cccc]" />
                 </div>
                 <div>
                    <label className="text-[9px] text-gray-500 block">{t.paletteSize}</label>
                    <input type="range" min="2" max="64" value={settings.paletteSize} onChange={(e) => handleSettingChange('paletteSize', parseInt(e.target.value))} className="accent-[#ffb000]" />
                 </div>
             </div>
             
             <div className="cassette-border p-2 bg-[#111] space-y-2">
                 <label className="text-[9px] text-gray-400 block">{t.adjustments}</label>
                 <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600 w-4">Bri</span>
                    <input type="range" min="-100" max="100" value={settings.hsl.brightness} onChange={(e) => handleHSLChange('brightness', parseInt(e.target.value))} className="h-1 bg-[#333] accent-white flex-1" />
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600 w-4">Sat</span>
                    <input type="range" min="-100" max="100" value={settings.hsl.saturation} onChange={(e) => handleHSLChange('saturation', parseInt(e.target.value))} className="h-1 bg-[#333] accent-white flex-1" />
                 </div>
             </div>

             <div className="flex items-center justify-between">
                <label className="text-[9px] text-[#ff4400] font-bold flex items-center gap-2">
                   {t.outline}
                </label>
                <input type="checkbox" checked={settings.hasOutline} onChange={(e) => handleSettingChange('hasOutline', e.target.checked)} className="accent-[#ff4400]" />
             </div>
             {settings.hasOutline && (
                <div className="flex gap-2">
                    <input 
                        type="range" 
                        min="1" max="8" 
                        value={settings.outlineThickness} 
                        onChange={(e) => handleSettingChange('outlineThickness', parseInt(e.target.value))} 
                        className="accent-[#ff4400] flex-1" 
                    />
                    <input type="color" value={settings.outlineColor} onChange={(e) => handleSettingChange('outlineColor', e.target.value)} className="w-4 h-4 bg-transparent" />
                </div>
             )}
        </div>

        {/* AI Studio */}
        <div className="cassette-border p-2 bg-[#111] border-[#00cccc]">
          <div className="flex justify-between items-center mb-2">
             <h3 className="text-[#00cccc] text-[10px] font-bold tracking-widest flex items-center gap-2">
                <Wand2 className="w-3 h-3" /> {t.aiTools}
            </h3>
          </div>
          <div className="space-y-2">
             <textarea 
               value={aiPrompt}
               onChange={(e) => setAiPrompt(e.target.value)}
               placeholder={t.aiPromptPlaceholder}
               className="w-full bg-[#000] border border-[#333] text-gray-300 text-[10px] p-2 focus:border-[#00cccc] outline-none font-mono resize-none h-12"
             />
             <div className="grid grid-cols-2 gap-2">
                 <button
                    onClick={() => onAiEdit(aiPrompt)}
                    disabled={!processingState.previewUrl || isAiEditing || !aiPrompt}
                    className="py-2 px-1 text-[9px] font-bold tracking-widest cassette-btn bg-[#00cccc]/10 border border-[#00cccc] text-[#00cccc] hover:bg-[#00cccc] hover:text-black disabled:opacity-50"
                >
                    {isAiEditing ? '...' : t.aiGenerate}
                </button>
                <button
                    onClick={() => onAiAnimate(aiPrompt)}
                    disabled={!processingState.previewUrl || isAiEditing || !aiPrompt}
                    className="py-2 px-1 text-[9px] font-bold tracking-widest cassette-btn bg-[#d946ef]/10 border border-[#d946ef] text-[#d946ef] hover:bg-[#d946ef] hover:text-black disabled:opacity-50"
                >
                    {t.aiAnim}
                </button>
             </div>
          </div>
        </div>

        {/* AI History */}
        {aiHistory.length > 0 && (
             <div className="space-y-1">
                 <label className="text-[9px] text-gray-500">HISTORY</label>
                 <div className="grid grid-cols-3 gap-1">
                    {aiHistory.slice(0, 6).map(item => (
                        <div 
                            key={item.id} 
                            className="aspect-square border border-[#333] hover:border-[#ffb000] cursor-pointer"
                            onClick={() => window.dispatchEvent(new CustomEvent('UPDATE_SOURCE_IMAGE', { detail: item.url }))}
                        >
                            <img src={item.url} className="w-full h-full object-cover pixelated-canvas" />
                        </div>
                    ))}
                 </div>
             </div>
        )}

      </div>
      
      {/* Footer Actions */}
      <div className="p-3 bg-[#0f0f0f] border-t border-[#333] space-y-2">
        <button
          onClick={onAnalyze}
          className="w-full py-2 flex items-center justify-center gap-2 font-bold text-[10px] tracking-[0.2em] cassette-btn bg-[#000] text-[#00cccc] border border-[#00cccc] hover:bg-[#00cccc] hover:text-black"
        >
          <Sparkles className="w-3 h-3" />
          {isAnalyzing ? t.analyzing : t.analyze}
        </button>
        <button
            onClick={() => onDownload(true)}
            className="w-full py-2 flex items-center justify-center gap-2 font-bold text-[10px] tracking-[0.2em] cassette-btn bg-[#ffb000]/10 border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-black"
          >
             <Download className="w-3 h-3" />
            {t.saveScaled}
          </button>
      </div>
    </div>
  );
};