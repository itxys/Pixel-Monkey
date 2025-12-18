import React, { useState, useEffect, useRef } from 'react';
import { DrawingTool, Language, LABELS, ProjectState } from '../types';
import { Pencil, Eraser, Pipette, Hand, PaintBucket, Plus, Trash2, Crosshair, Move } from 'lucide-react';

interface ToolboxProps {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  language: Language;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  recentColors: string[];
  updateRecentColors: (color: string) => void;
  // Symmetry drawing props
  symmetryEnabled: boolean;
  setSymmetryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  symmetryType: 'vertical' | 'horizontal';
  setSymmetryType: React.Dispatch<React.SetStateAction<'vertical' | 'horizontal'>>;
  verticalSymmetryPosition: number;
  setVerticalSymmetryPosition: React.Dispatch<React.SetStateAction<number>>;
  horizontalSymmetryPosition: number;
  setHorizontalSymmetryPosition: React.Dispatch<React.SetStateAction<number>>;
}

// Helper: Hex <-> HSV/RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
};

const rgbToHex = (r: number, g: number, b: number) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) { h = 0; } 
  else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, v };
};

const hsvToRgb = (h: number, s: number, v: number) => {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return { r: Math.round(r! * 255), g: Math.round(g! * 255), b: Math.round(b! * 255) };
};

export const Toolbox: React.FC<ToolboxProps> = ({
  activeTool,
  setActiveTool,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  language,
  project,
  setProject,
  recentColors,
  updateRecentColors,
  symmetryEnabled,
  setSymmetryEnabled,
  symmetryType,
  setSymmetryType,
  verticalSymmetryPosition,
  setVerticalSymmetryPosition,
  horizontalSymmetryPosition,
  setHorizontalSymmetryPosition
}) => {
  const t = LABELS[language];
  
  // Local HSV state for the picker
  const [hsv, setHsv] = useState({ h: 0, s: 0, v: 0 });
  const [isDraggingSat, setIsDraggingSat] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const satRectRef = useRef<HTMLDivElement>(null);
  const hueRectRef = useRef<HTMLDivElement>(null);

  // Sync HSV when brushColor changes externally (e.g. Eyedropper)
  useEffect(() => {
    const rgb = hexToRgb(brushColor);
    const newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // Only update if significantly different to avoid rounding jitter during self-update
    // A simple check is usually enough, or just update. 
    // We update only if we are not currently dragging to avoid fighting.
    if (!isDraggingSat && !isDraggingHue) {
        setHsv(newHsv);
    }
  }, [brushColor, isDraggingSat, isDraggingHue]);

  const updateColorFromHsv = (h: number, s: number, v: number) => {
    const rgb = hsvToRgb(h, s, v);
    setBrushColor(rgbToHex(rgb.r, rgb.g, rgb.b));
    setHsv({ h, s, v });
  };

  const handleSatMouseDown = (e: React.MouseEvent) => {
    setIsDraggingSat(true);
    handleSatMove(e);
  };
  
  const handleHueMouseDown = (e: React.MouseEvent) => {
    setIsDraggingHue(true);
    handleHueMove(e);
  };

  const handleSatMove = (e: React.MouseEvent | MouseEvent) => {
    if (satRectRef.current) {
        const rect = satRectRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        // x is Saturation, y is Brightness (Value) inverted
        updateColorFromHsv(hsv.h, x, 1 - y);
    }
  };

  const handleHueMove = (e: React.MouseEvent | MouseEvent) => {
    if (hueRectRef.current) {
        const rect = hueRectRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        updateColorFromHsv(x, hsv.s, hsv.v);
    }
  };

  useEffect(() => {
    const up = () => { setIsDraggingSat(false); setIsDraggingHue(false); };
    const move = (e: MouseEvent) => {
        if (isDraggingSat) handleSatMove(e);
        if (isDraggingHue) handleHueMove(e);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    return () => {
        window.removeEventListener('mouseup', up);
        window.removeEventListener('mousemove', move);
    };
  }, [isDraggingSat, isDraggingHue, hsv]);

  const addToPalette = () => {
     if (!project.savedColors.includes(brushColor)) {
         setProject(p => ({ ...p, savedColors: [...p.savedColors, brushColor] }));
     }
  };

  const removeFromPalette = (color: string) => {
      setProject(p => ({ ...p, savedColors: p.savedColors.filter(c => c !== color) }));
  };

  const ToolButton = ({ tool, icon: Icon, label, colorClass }: { tool: DrawingTool, icon: any, label: string, colorClass: string }) => (
    <button 
      onClick={() => setActiveTool(tool)}
      className={`relative group p-2 flex flex-col items-center justify-center border-2 transition-all duration-100 cassette-btn h-14 w-full
        ${activeTool === tool 
          ? `bg-[${colorClass}]/20 border-[${colorClass}] text-[${colorClass}] shadow-[0_0_10px_rgba(255,176,0,0.3)]` 
          : 'bg-[#111] border-[#333] text-gray-500 hover:border-gray-400 hover:text-gray-300'
        }`}
      title={label}
    >
      <Icon className={`w-5 h-5 mb-1 ${activeTool === tool ? 'filter drop-shadow-[0_0_5px_currentColor]' : ''}`} />
      <span className="text-[9px] tracking-widest">{label}</span>
      {activeTool === tool && (
        <div className={`absolute top-0 right-0 w-2 h-2 bg-[${colorClass}] shadow-[0_0_5px_currentColor]`}></div>
      )}
    </button>
  );

  // Classic pixel art palettes
  const classicPalettes = {
    nes: [
      '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'
    ],
    snes: [
      '#000000', '#555555', '#aaaaaa', '#ffffff', '#940034', '#ff0044', '#ff6536', '#ffaa34',
      '#ffe634', '#aaff66', '#35ff34', '#0088ff', '#cc22cc', '#8520c8', '#4433cc', '#4444cc'
    ],
    gameboy: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
    ],
    pico8: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'
    ]
  };
  
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null);
  
  const pureHueRgb = hsvToRgb(hsv.h, 1, 1);
  const pureHueHex = rgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);

  return (
    <div className="w-[200px] bg-[#0a0a0a] border-r border-[#333] flex flex-col h-full z-20 overflow-y-auto scrollbar-hide shrink-0">
        
        {/* Tools Section */}
        <div className="p-3 bg-[#111] border-b border-[#333]">
           <div className="text-[#ffb000] text-[10px] font-bold tracking-widest mb-2 border-l-2 border-[#ffb000] pl-2">{t.tools}</div>
           <div className="grid grid-cols-2 gap-1">
              <ToolButton tool="brush" icon={Pencil} label="DRAW" colorClass="#ffb000" />
              <ToolButton tool="eraser" icon={Eraser} label="CLR" colorClass="#ff4400" />
              <ToolButton tool="bucket" icon={PaintBucket} label="FILL" colorClass="#ffb000" />
              <ToolButton tool="eyedropper" icon={Pipette} label="PICK" colorClass="#d946ef" />
              <ToolButton tool="pan" icon={Hand} label="PAN" colorClass="#00cccc" />
              <ToolButton tool="move" icon={Move} label="MOVE" colorClass="#00cccc" />
           </div>
        </div>
        
        {/* Symmetry Drawing Section */}
        <div className="p-3 bg-[#111] border-b border-[#333]">
           <div className="text-[#00cccc] text-[10px] font-bold tracking-widest mb-2 border-l-2 border-[#00cccc] pl-2">{t.symmetry}</div>
           <div className="space-y-2">
              {/* Symmetry Toggle */}
              <div className="flex items-center justify-between">
                 <span className="text-xs font-mono">{t.enabled}</span>
                 <button 
                    className={`w-10 h-5 rounded-full ${symmetryEnabled ? 'bg-[#00cccc]' : 'bg-[#333]'} transition-colors`}
                    onClick={() => setSymmetryEnabled(!symmetryEnabled)}
                 >
                    <div 
                       className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${symmetryEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                    ></div>
                 </button>
              </div>
              
              {/* Symmetry Type */}
              {symmetryEnabled && (
                 <div className="space-y-2">
                   <div className="flex gap-1">
                      <button 
                         className={`flex-1 p-1 rounded border transition-colors ${symmetryType === 'vertical' ? 'border-[#00cccc] bg-[#00cccc]/20 text-[#00cccc]' : 'border-[#333] bg-[#222] text-gray-500 hover:border-gray-400'}`}
                         onClick={() => setSymmetryType('vertical')}
                         title={t.vertical}
                      >
                         <div className="flex items-center justify-center">
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-4a2 2 0 110-4 2 2 0 010 4z" />
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20" />
                           </svg>
                         </div>
                      </button>
                      <button 
                         className={`flex-1 p-1 rounded border transition-colors ${symmetryType === 'horizontal' ? 'border-[#00cccc] bg-[#00cccc]/20 text-[#00cccc]' : 'border-[#333] bg-[#222] text-gray-500 hover:border-gray-400'}`}
                         onClick={() => setSymmetryType('horizontal')}
                         title={t.horizontal}
                      >
                         <div className="flex items-center justify-center">
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm0-2a6 6 0 100-12 6 6 0 000 12zm-4-6a2 2 0 114 0 2 2 0 01-4 0zm4 0a2 2 0 104 0 2 2 0 00-4 0z" />
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h20" />
                           </svg>
                         </div>
                      </button>
                   </div>
                   <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono mb-1">
                        <span>LINE POS</span>
                        <span>
                          {Math.round(
                            (symmetryType === 'vertical' ? verticalSymmetryPosition : horizontalSymmetryPosition) * 100
                          )}
                          %
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={
                          (symmetryType === 'vertical' ? verticalSymmetryPosition : horizontalSymmetryPosition) * 100
                        }
                        onChange={(e) => {
                          const v = Number(e.target.value) / 100;
                          if (symmetryType === 'vertical') {
                            setVerticalSymmetryPosition(v);
                          } else {
                            setHorizontalSymmetryPosition(v);
                          }
                        }}
                        className="w-full accent-[#00cccc] h-2"
                      />
                   </div>
                 </div>
              )}
           </div>
        </div>

        {/* Brush Size */}
        <div className="p-3 bg-[#111] border-b border-[#333]">
           <div className="text-[#00cccc] text-[10px] font-bold tracking-widest mb-2 border-l-2 border-[#00cccc] pl-2">BRUSH SIZE</div>
           <div className="mb-2">
              <input 
                 type="range" 
                 min="1" 
                 max="10" 
                 step="1" 
                 value={brushSize}
                 onChange={(e) => setBrushSize(parseInt(e.target.value))}
                 className="w-full h-1 bg-[#333] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#00cccc] [&::-webkit-slider-thumb]:rounded-none"
              />
           </div>
           <div className="flex items-center justify-between">
              <button 
                 onClick={() => setBrushSize(prev => Math.max(1, prev - 1))}
                 className="p-1 bg-[#222] border border-[#333] text-[#00cccc] hover:bg-[#333] w-6 h-6 flex items-center justify-center"
                 title="Decrease brush size ([])"
              >
                 -
              </button>
              <input 
                 type="number" 
                 min="1" 
                 max="10" 
                 value={brushSize}
                 onChange={(e) => {
                     const value = parseInt(e.target.value);
                     if (!isNaN(value)) {
                         setBrushSize(Math.min(10, Math.max(1, value)));
                     }
                 }}
                 onBlur={(e) => {
                     const value = parseInt(e.target.value);
                     if (isNaN(value) || value < 1 || value > 10) {
                         // Reset to valid value if input is invalid
                         e.currentTarget.value = brushSize.toString();
                     }
                 }}
                 className="w-12 text-[16px] font-mono text-[#00cccc] bg-[#111] border border-[#333] text-center px-1"
              />
              <button 
                 onClick={() => setBrushSize(prev => Math.min(10, prev + 1))}
                 className="p-1 bg-[#222] border border-[#333] text-[#00cccc] hover:bg-[#333] w-6 h-6 flex items-center justify-center"
                 title="Increase brush size (])"
              >
                 +
              </button>
           </div>
        </div>

        {/* Recent Colors */}
        {recentColors.length > 0 && (
          <div className="p-3 bg-[#111] border-b border-[#333]">
             <div className="text-[#00cccc] text-[10px] font-bold tracking-widest mb-2 border-l-2 border-[#00cccc] pl-2">RECENT COLORS</div>
             <div className="grid grid-cols-8 gap-1">
                 {recentColors.map((color, idx) => (
                     <div 
                        key={`${color}-${idx}`} 
                        className="aspect-square border border-[#333] cursor-pointer relative group"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setBrushColor(color);
                          updateRecentColors(color);
                        }}
                     >
                        {brushColor === color && (
                          <div className="absolute inset-0 border-2 border-white shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-none"></div>
                        )}
                     </div>
                 ))}
             </div>
          </div>
        )}

        {/* Advanced Color Picker */}
        <div className="p-3 flex-1 flex flex-col gap-3">
             <div className="text-[#d946ef] text-[10px] font-bold tracking-widest border-l-2 border-[#d946ef] pl-2 flex justify-between items-center">
                 <span>COLOR</span>
                 <span className="font-mono text-gray-500">{brushColor.toUpperCase()}</span>
             </div>
             
             {/* Classic Palettes */}
             <div className="mt-2">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] text-[#00cccc] tracking-widest">CLASSIC PALETTES</span>
                    <select 
                        value={selectedPalette || ''}
                        onChange={(e) => setSelectedPalette(e.target.value || null)}
                        className="bg-[#222] border border-[#333] text-[9px] text-[#00cccc] px-2 py-1"
                    >
                        <option value="">None</option>
                        <option value="nes">NES</option>
                        <option value="snes">SNES</option>
                        <option value="gameboy">Game Boy</option>
                        <option value="pico8">PICO-8</option>
                    </select>
                 </div>
                 
                 {selectedPalette && classicPalettes[selectedPalette as keyof typeof classicPalettes] && (
                     <div className="grid grid-cols-8 gap-1">
                         {classicPalettes[selectedPalette as keyof typeof classicPalettes].map((color, idx) => (
                             <div 
                                key={`${selectedPalette}-${color}-${idx}`} 
                                className="aspect-square border border-[#333] cursor-pointer relative group"
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                  setBrushColor(color);
                                  updateRecentColors(color);
                                }}
                             >
                                {brushColor === color && (
                                  <div className="absolute inset-0 border-2 border-white shadow-[0_0_5px_rgba(255,255,255,0.5)] pointer-events-none"></div>
                                )}
                             </div>
                         ))}
                     </div>
                 )}
             </div>

             {/* Saturation/Value Box */}
             <div 
                className="w-full aspect-square border-2 border-[#333] relative cursor-crosshair overflow-hidden"
                ref={satRectRef}
                onMouseDown={handleSatMouseDown}
                style={{ backgroundColor: pureHueHex }}
             >
                <div className="absolute inset-0 cp-saturation-gradient"></div>
                {/* Thumb */}
                <div 
                    className="absolute w-3 h-3 rounded-full border-2 border-white shadow-sm pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: brushColor }}
                ></div>
             </div>

             {/* Hue Slider */}
             <div 
                className="w-full h-4 border border-[#333] relative cursor-pointer cp-hue-gradient"
                ref={hueRectRef}
                onMouseDown={handleHueMouseDown}
             >
                <div 
                   className="absolute top-0 bottom-0 w-1 bg-white border border-black pointer-events-none"
                   style={{ left: `${hsv.h * 100}%` }}
                ></div>
             </div>

             {/* Hex Input */}
             <div className="flex gap-1">
                 <div className="flex-1 bg-[#111] border border-[#333] px-2 py-1 flex items-center text-[#d946ef]">
                     <span className="text-[10px] mr-1">#</span>
                     <input 
                        type="text" 
                        value={brushColor.replace('#', '')}
                        onChange={(e) => {
                            if (/^[0-9A-F]{0,6}$/i.test(e.target.value)) {
                                setBrushColor('#' + e.target.value);
                            }
                        }}
                        className="w-full bg-transparent outline-none font-mono text-xs uppercase"
                        maxLength={6}
                     />
                 </div>
                 <div className="w-8 h-8 border border-[#333]" style={{ backgroundColor: brushColor }}></div>
             </div>

             {/* Saved Palette */}
             <div className="mt-2">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] text-gray-500 tracking-widest">{t.colors}</span>
                    <button onClick={addToPalette} className="text-[#ffb000] hover:text-white"><Plus className="w-3 h-3" /></button>
                 </div>
                 <div className="grid grid-cols-5 gap-1">
                     {project.savedColors.map((color, idx) => (
                         <div 
                            key={`${color}-${idx}`} 
                            className="aspect-square border border-[#333] cursor-pointer relative group"
                            style={{ backgroundColor: color }}
                            onClick={() => setBrushColor(color)}
                         >
                            <button 
                                onClick={(e) => { e.stopPropagation(); removeFromPalette(color); }}
                                className="absolute inset-0 bg-black/50 text-red-500 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                         </div>
                     ))}
                 </div>
             </div>
        </div>
    </div>
  );
};
