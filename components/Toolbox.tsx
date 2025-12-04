import React, { useState, useEffect, useRef } from 'react';
import { DrawingTool, Language, LABELS, ProjectState } from '../types';
import { Pencil, Eraser, Pipette, Hand, PaintBucket, Plus, Trash2, Crosshair, Move } from 'lucide-react';

interface ToolboxProps {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  language: Language;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
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
  language,
  project,
  setProject
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

        {/* Advanced Color Picker */}
        <div className="p-3 flex-1 flex flex-col gap-3">
             <div className="text-[#d946ef] text-[10px] font-bold tracking-widest border-l-2 border-[#d946ef] pl-2 flex justify-between items-center">
                 <span>COLOR</span>
                 <span className="font-mono text-gray-500">{brushColor.toUpperCase()}</span>
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