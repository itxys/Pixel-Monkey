import React from 'react';
import { ProjectState, Language, LABELS } from '../types';
import { Play, Pause, Plus, Copy, Trash2, SkipBack, SkipForward, Layers } from 'lucide-react';

interface TimelineProps {
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  language: Language;
}

export const Timeline: React.FC<TimelineProps> = ({ project, setProject, language }) => {
  const t = LABELS[language];

  const addFrame = () => {
    setProject(prev => {
        const currentFrame = prev.frames[prev.currentFrameIndex];
        const newFrame = {
            id: crypto.randomUUID(),
            layers: currentFrame.layers.map(l => ({
                ...l,
                id: crypto.randomUUID(),
                data: new Map() // Empty new frame
            }))
        };
        const newFrames = [...prev.frames];
        newFrames.splice(prev.currentFrameIndex + 1, 0, newFrame);
        
        return { 
           ...prev, 
           frames: newFrames, 
           currentFrameIndex: prev.currentFrameIndex + 1,
           activeLayerId: newFrame.layers[0].id
        };
    });
  };

  const duplicateFrame = () => {
    setProject(prev => {
        const currentFrame = prev.frames[prev.currentFrameIndex];
        const newFrame = {
            id: crypto.randomUUID(),
            layers: currentFrame.layers.map(l => ({
                ...l,
                id: crypto.randomUUID(),
                data: new Map(l.data) // Clone data
            }))
        };
        const newFrames = [...prev.frames];
        newFrames.splice(prev.currentFrameIndex + 1, 0, newFrame);
        
        const activeLayerIndex = currentFrame.layers.findIndex(l => l.id === prev.activeLayerId);
        const nextLayerId = (activeLayerIndex !== -1) ? newFrame.layers[activeLayerIndex].id : newFrame.layers[0].id;

        return { 
           ...prev, 
           frames: newFrames, 
           currentFrameIndex: prev.currentFrameIndex + 1,
           activeLayerId: nextLayerId
        };
    });
  };

  const deleteFrame = (index: number) => {
      if (project.frames.length <= 1) return;
      setProject(prev => {
          const newFrames = prev.frames.filter((_, i) => i !== index);
          const newIndex = Math.min(index, newFrames.length - 1);
          return {
              ...prev,
              frames: newFrames,
              currentFrameIndex: newIndex,
              activeLayerId: newFrames[newIndex].layers[0].id // Reset to first layer for safety
          };
      });
  };

  const selectFrame = (index: number) => {
      setProject(prev => {
          const currentFrame = prev.frames[prev.currentFrameIndex];
          const targetFrame = prev.frames[index];
          const activeLayerIndex = currentFrame.layers.findIndex(l => l.id === prev.activeLayerId);
          const nextLayerId = (activeLayerIndex !== -1 && targetFrame.layers[activeLayerIndex]) 
              ? targetFrame.layers[activeLayerIndex].id 
              : targetFrame.layers[0].id;

          return { ...prev, currentFrameIndex: index, activeLayerId: nextLayerId };
      });
  };

  return (
    <div className="h-32 bg-[#0a0a0a] border-t border-[#333] flex flex-col shrink-0">
        
        {/* Controls Bar */}
        <div className="h-8 bg-[#111] border-b border-[#333] flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setProject(p => ({ ...p, isPlaying: !p.isPlaying }))}
                    className={`p-1 rounded hover:bg-[#222] ${project.isPlaying ? 'text-green-400' : 'text-[#ffb000]'}`}
                >
                    {project.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
                <div className="h-4 w-px bg-[#333]"></div>
                <div className="flex items-center gap-1 text-[9px] text-gray-400">
                    <span>FPS</span>
                    <input 
                        type="number" 
                        min="1" max="24" 
                        value={project.fps} 
                        onChange={(e) => setProject(p => ({ ...p, fps: parseInt(e.target.value) }))}
                        className="w-8 bg-black border border-[#333] text-center text-[#ffb000]" 
                    />
                </div>
                <div className="flex items-center gap-1 text-[9px] text-gray-400 ml-2">
                    <input 
                        type="checkbox" 
                        checked={project.onionSkin} 
                        onChange={(e) => setProject(p => ({ ...p, onionSkin: e.target.checked }))} 
                        className="accent-[#ffb000]"
                    />
                    <span>{t.onionSkin}</span>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <button onClick={duplicateFrame} className="flex items-center gap-1 px-2 py-1 bg-[#222] text-[9px] hover:text-white border border-transparent hover:border-gray-500">
                    <Copy className="w-3 h-3" /> DUP
                </button>
                <button onClick={addFrame} className="flex items-center gap-1 px-2 py-1 bg-[#222] text-[9px] hover:text-white border border-transparent hover:border-gray-500">
                    <Plus className="w-3 h-3" /> NEW
                </button>
            </div>
        </div>

        {/* Frames Strip */}
        <div className="flex-1 overflow-x-auto p-2 flex gap-1 scrollbar-hide">
            {project.frames.map((frame, idx) => (
                <div 
                    key={frame.id}
                    onClick={() => selectFrame(idx)}
                    className={`relative min-w-[64px] h-full border-2 cursor-pointer flex items-center justify-center bg-black group
                        ${idx === project.currentFrameIndex ? 'border-[#ffb000] shadow-[0_0_10px_rgba(255,176,0,0.2)]' : 'border-[#333] hover:border-gray-500'}
                    `}
                >
                    <span className="text-[10px] text-gray-500 font-mono">{idx + 1}</span>
                    
                    {/* Small visual indicator of layers */}
                    <div className="absolute bottom-1 right-1 flex gap-0.5">
                        {frame.layers.map(l => (
                            <div key={l.id} className={`w-1 h-1 rounded-full ${l.data.size > 0 ? 'bg-[#00cccc]' : 'bg-[#333]'}`}></div>
                        ))}
                    </div>

                    <button 
                        onClick={(e) => { e.stopPropagation(); deleteFrame(idx); }}
                        className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 bg-black/80"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            ))}
        </div>
    </div>
  );
};