import React, { useState } from 'react';
import { PixelSettings, ProcessingState, Language, LABELS, ProjectState } from '../types';
import { Undo, Redo, Languages, Image as ImageIcon, Download, Monitor } from 'lucide-react';

interface PixelControlsProps {
  settings: PixelSettings;
  setSettings: React.Dispatch<React.SetStateAction<PixelSettings>>;
  processingState: ProcessingState;
  onDownload: (mode: 'raw' | 'scaled' | 'standard', size?: number) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  pushToHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export const PixelControls: React.FC<PixelControlsProps> = ({
  settings,
  setSettings,
  processingState,
  onDownload,
  language,
  setLanguage,
  project,
  setProject,
  pushToHistory,
  undo,
  redo
}) => {
  
  const t = LABELS[language];
  const [selectedSize, setSelectedSize] = useState<number>(32);
  const standardSizes = [8, 16, 32, 64, 128, 256, 512, 1024];
  const [showStandardSizes, setShowStandardSizes] = useState(false);

  const handleSettingChange = (key: keyof PixelSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleHSLChange = (key: keyof PixelSettings['hsl'], value: number) => {
      setSettings(prev => ({ ...prev, hsl: { ...prev.hsl, [key]: value } }));
  };

  return (
    <div className="w-[350px] bg-[#0a0a0a] border-l border-[#333] flex flex-col h-full z-20 shrink-0">
      
      {/* Header - Simplified */}
      <div className="p-4 bg-[#0f0f0f] border-b border-[#333] flex justify-end items-center shadow-lg">
          <div className="flex gap-1">
            <button onClick={undo} className="p-1 hover:text-[#ffb000]" title={t.undo}>
                <Undo className="w-4 h-4" />
            </button>
            <button onClick={redo} className="p-1 hover:text-[#ffb000]" title={t.redo}>
                <Redo className="w-4 h-4" />
            </button>
            <button onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} className="p-1 text-[#ffb000] border border-[#ffb000] ml-1">
                <Languages className="w-4 h-4" />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-4">
        
        {/* Pixel Settings */}
        <div className="space-y-3">
             <div className="text-[20px] text-[#ffb000] font-bold tracking-widest border-b border-[#ffb000]/30 pb-1">RENDER SETTINGS</div>
             
             <div className="space-y-3">
                 <div>
                    <label className="text-[18px] text-gray-500 block">{t.pixelBlockSize}</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="range" min="1" max="32" value={settings.pixelSize} onChange={(e) => handleSettingChange('pixelSize', parseInt(e.target.value))} className="accent-[#00cccc] h-2 flex-1" />
                        <input 
                            type="number" 
                            min="1" 
                            max="32" 
                            value={settings.pixelSize}
                            onChange={(e) => handleSettingChange('pixelSize', parseInt(e.target.value))}
                            className="text-[16px] font-mono text-[#00cccc] w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                        />
                    </div>
                 </div>
                 <div>
                    <label className="text-[18px] text-gray-500 block">{t.paletteSize}</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="range" min="2" max="64" value={settings.paletteSize} onChange={(e) => handleSettingChange('paletteSize', parseInt(e.target.value))} className="accent-[#ffb000] h-2 flex-1" />
                        <input 
                            type="number" 
                            min="2" 
                            max="64" 
                            value={settings.paletteSize}
                            onChange={(e) => handleSettingChange('paletteSize', parseInt(e.target.value))}
                            className="text-[16px] font-mono text-[#ffb000] w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                        />
                    </div>
                 </div>
                 <div>
                    <label className="text-[18px] text-gray-500 block">{t.smoothing}</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="range" min="0" max="2" value={settings.smoothing} onChange={(e) => handleSettingChange('smoothing', parseInt(e.target.value))} className="accent-[#00cccc] h-2 flex-1" />
                        <input 
                            type="number" 
                            min="0" 
                            max="2" 
                            value={settings.smoothing}
                            onChange={(e) => handleSettingChange('smoothing', parseInt(e.target.value))}
                            className="text-[16px] font-mono text-[#00cccc] w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                        />
                    </div>
                 </div>
                 <div>
                    <label className="text-[18px] text-gray-500 block">{t.dithering}</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="range" min="0" max="1" step="0.1" value={settings.dithering} onChange={(e) => handleSettingChange('dithering', parseFloat(e.target.value))} className="accent-[#ffb000] h-2 flex-1" />
                        <input 
                            type="number" 
                            min="0" 
                            max="1" 
                            step="0.1"
                            value={settings.dithering}
                            onChange={(e) => handleSettingChange('dithering', parseFloat(e.target.value))}
                            className="text-[16px] font-mono text-[#ffb000] w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                        />
                    </div>
                 </div>
             </div>
              
             <div className="cassette-border p-3 bg-[#111] space-y-3">
                 <label className="text-[18px] text-gray-400 block">{t.adjustments}</label>
                 <div className="flex items-center gap-3">
                    <span className="text-[18px] text-gray-600 w-6">Bri</span>
                    <input type="range" min="-100" max="100" value={settings.hsl.brightness} onChange={(e) => handleHSLChange('brightness', parseInt(e.target.value))} className="h-2 bg-[#333] accent-white flex-1" />
                    <input 
                        type="number" 
                        min="-100" 
                        max="100" 
                        value={settings.hsl.brightness}
                        onChange={(e) => handleHSLChange('brightness', parseInt(e.target.value))}
                        className="text-[16px] font-mono text-white w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                    />
                 </div>
                 <div className="flex items-center gap-3">
                    <span className="text-[18px] text-gray-600 w-6">Sat</span>
                    <input type="range" min="-100" max="100" value={settings.hsl.saturation} onChange={(e) => handleHSLChange('saturation', parseInt(e.target.value))} className="h-2 bg-[#333] accent-white flex-1" />
                    <input 
                        type="number" 
                        min="-100" 
                        max="100" 
                        value={settings.hsl.saturation}
                        onChange={(e) => handleHSLChange('saturation', parseInt(e.target.value))}
                        className="text-[16px] font-mono text-white w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                    />
                 </div>
                 <div className="flex items-center gap-3">
                    <span className="text-[18px] text-gray-600 w-6">Dith</span>
                    <input type="range" min="0" max="1" step="0.1" value={settings.dithering} onChange={(e) => handleSettingChange('dithering', parseFloat(e.target.value))} className="h-2 bg-[#333] accent-[#ffb000] flex-1" />
                    <input 
                        type="number" 
                        min="0" 
                        max="1" 
                        step="0.1"
                        value={settings.dithering}
                        onChange={(e) => handleSettingChange('dithering', parseFloat(e.target.value))}
                        className="text-[16px] font-mono text-[#ffb000] w-12 text-right bg-[#111] border border-[#333] px-1 text-center"
                    />
                 </div>
             </div>

             <div className="flex items-center justify-between">
                <label className="text-[18px] text-[#ff4400] font-bold flex items-center gap-3">
                   {t.outline}
                </label>
                <input type="checkbox" checked={settings.hasOutline} onChange={(e) => handleSettingChange('hasOutline', e.target.checked)} className="accent-[#ff4400] w-5 h-5" />
             </div>
             {settings.hasOutline && (
                <div className="space-y-2">
                    <div className="flex gap-3 items-center">
                        <input 
                            type="range" 
                            min="1" max="8" 
                            value={settings.outlineThickness} 
                            onChange={(e) => handleSettingChange('outlineThickness', parseInt(e.target.value))} 
                            className="accent-[#ff4400] w-full h-2" 
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <input 
                            type="number" 
                            min="1" 
                            max="8" 
                            value={settings.outlineThickness}
                            onChange={(e) => handleSettingChange('outlineThickness', parseInt(e.target.value))}
                            className="text-[16px] font-mono text-[#ff4400] w-8 bg-[#111] border border-[#333] px-1 text-center"
                        />
                        <input type="color" value={settings.outlineColor} onChange={(e) => handleSettingChange('outlineColor', e.target.value)} className="w-6 h-6 bg-transparent" />
                    </div>
                </div>
             )}
              
             {/* Grid Settings */}
             <div className="flex items-center justify-between">
                <label className="text-[18px] text-[#00cccc] font-bold flex items-center gap-3">
                   GRID
                </label>
                <input type="checkbox" checked={settings.showGrid} onChange={(e) => handleSettingChange('showGrid', e.target.checked)} className="accent-[#00cccc] w-5 h-5" />
             </div>
             {settings.showGrid && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <input type="color" value={settings.gridColor} onChange={(e) => handleSettingChange('gridColor', e.target.value)} className="w-8 h-8 bg-transparent" />
                    </div>
                    <div className="space-y-2">
                        <div className="flex gap-3 items-center">
                            <input 
                                type="range" 
                                min="0" max="1" step="0.1" 
                                value={settings.gridOpacity} 
                                onChange={(e) => handleSettingChange('gridOpacity', parseFloat(e.target.value))} 
                                className="accent-[#00cccc] w-full h-2" 
                            />
                        </div>
                        <div className="flex items-center justify-end">
                            <input 
                                type="number" 
                                min="0" 
                                max="1" 
                                step="0.1"
                                value={settings.gridOpacity}
                                onChange={(e) => handleSettingChange('gridOpacity', parseFloat(e.target.value))}
                                className="text-[16px] font-mono text-[#00cccc] w-8 bg-[#111] border border-[#333] px-1 text-center"
                            />
                        </div>
                    </div>
                </div>
             )}
        </div>
      </div>
      
      {/* Footer Actions */}
      <div className="p-4 bg-[#0f0f0f] border-t border-[#333] space-y-3">
        {/* 导出选项 */}
        <div className="space-y-3">
          <div className="text-[16px] text-[#ffb000] font-bold tracking-widest pb-2">EXPORT OPTIONS</div>
          
          {/* 原始尺寸导出 */}
          <button
            onClick={() => onDownload('raw')}
            className="w-full py-2.5 flex items-center justify-center gap-3 font-bold text-[16px] tracking-[0.2em] cassette-btn bg-[#111] text-[#00cccc] border border-[#00cccc] hover:bg-[#00cccc] hover:text-black"
          >
            <ImageIcon className="w-4 h-4" />
            {t.saveSmall || 'EXPORT [RAW]'}
          </button>
          
          {/* 高清自动缩放导出 */}
          <button
            onClick={() => onDownload('scaled')}
            className="w-full py-2.5 flex items-center justify-center gap-3 font-bold text-[16px] tracking-[0.2em] cassette-btn bg-[#111] text-[#00cccc] border border-[#00cccc] hover:bg-[#00cccc] hover:text-black"
          >
            <Download className="w-4 h-4" />
            {t.saveScaled || 'EXPORT [UPSCALED]'}
          </button>
          
          {/* 标准尺寸导出 */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setShowStandardSizes(!showStandardSizes)}
                className="flex-1 py-2.5 flex items-center justify-center gap-3 font-bold text-[16px] tracking-[0.2em] cassette-btn bg-[#111] text-[#ffb000] border border-[#ffb000] hover:bg-[#ffb000] hover:text-black"
              >
                <Monitor className="w-4 h-4" />
                STANDARD SIZE
              </button>
              <button
                onClick={() => onDownload('standard', selectedSize)}
                className="w-20 py-2.5 flex items-center justify-center gap-3 font-bold text-[16px] tracking-[0.2em] cassette-btn bg-[#111] text-[#ffb000] border border-[#ffb000] hover:bg-[#ffb000] hover:text-black"
                title="Export to selected size"
              >
                {selectedSize}x
              </button>
            </div>
            
            {/* 标准尺寸选择器 */}
            {showStandardSizes && (
              <div className="grid grid-cols-4 gap-2 bg-[#111] p-2 cassette-border">
                {standardSizes.map(size => (
                  <button
                    key={size}
                    onClick={() => {
                      setSelectedSize(size);
                      // 自动关闭选择器
                      setTimeout(() => setShowStandardSizes(false), 100);
                    }}
                    className={`py-2 px-0 font-bold text-[14px] tracking-widest ${selectedSize === size ? 'bg-[#ffb000] text-black' : 'bg-[#000] text-[#ccc] border border-[#333] hover:border-[#ffb000]'}`}
                    title={`Export to ${size}x${size} pixels`}
                  >
                    {size}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};