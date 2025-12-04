import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixelSettings, ProcessingState, Language, LABELS, DrawingTool, ProjectState, Frame } from '../types';
import { Upload, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface WorkstationProps {
  settings: PixelSettings;
  setProcessingState: React.Dispatch<React.SetStateAction<ProcessingState>>;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  analysisResult: { title: string; description: string; mood: string } | null;
  language: Language;
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  pushToHistory: () => void;
}

// ---- Optimized Core Algorithm ----

const distanceSq = (c1: number[], c2: number[]) => {
  const rmean = (c1[0] + c2[0]) / 2;
  const r = c1[0] - c2[0];
  const g = c1[1] - c2[1];
  const b = c1[2] - c2[2];
  return (((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8);
};

const bayerMatrix = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

const rgbInt = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const intToRgb = (i: number) => [(i >> 16) & 255, (i >> 8) & 255, i & 255];
const hexToRgb = (hex: string): number[] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
};
const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const extractPalette = (pixels: number[][], k: number): number[][] => {
  if (pixels.length === 0) return [];
  
  const histogram = new Map<number, number>();
  for (const p of pixels) {
    const key = rgbInt(p[0], p[1], p[2]);
    histogram.set(key, (histogram.get(key) || 0) + 1);
  }

  const sortedColors = Array.from(histogram.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => intToRgb(entry[0]));

  let centroids = sortedColors.slice(0, k);
  if (centroids.length < k) return centroids;

  const iterations = 8; 
  for (let iter = 0; iter < iterations; iter++) {
    const sums: number[][] = Array(k).fill(0).map(() => [0, 0, 0]);
    const counts: number[] = Array(k).fill(0);
    
    for (const [colorInt, count] of histogram.entries()) {
      const p = intToRgb(colorInt);
      let minDist = Infinity;
      let clusterIdx = 0;
      
      for (let i = 0; i < k; i++) {
        const d = distanceSq(p, centroids[i]);
        if (d < minDist) {
          minDist = d;
          clusterIdx = i;
        }
      }
      
      sums[clusterIdx][0] += p[0] * count;
      sums[clusterIdx][1] += p[1] * count;
      sums[clusterIdx][2] += p[2] * count;
      counts[clusterIdx] += count;
    }

    let changed = false;
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        const newR = Math.round(sums[i][0] / counts[i]);
        const newG = Math.round(sums[i][1] / counts[i]);
        const newB = Math.round(sums[i][2] / counts[i]);
        
        if (newR !== centroids[i][0] || newG !== centroids[i][1] || newB !== centroids[i][2]) {
          centroids[i] = [newR, newG, newB];
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return centroids;
};

const applySmoothing = (
  pixels: number[], 
  width: number, 
  height: number, 
  iterations: number
): number[] => {
  if (iterations === 0) return pixels;

  let current = [...pixels];
  let buffer = [...pixels];

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const myColor = current[idx];
        
        if (myColor === -1) { 
            buffer[idx] = -1;
            continue;
        }

        const neighborCounts = new Map<number, number>();
        let maxCount = 0;
        let dominantColor = myColor;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const nChar = current[nIdx];
              if (nChar !== -1) {
                  const c = (neighborCounts.get(nChar) || 0) + 1;
                  neighborCounts.set(nChar, c);
                  
                  if (c > maxCount) {
                    maxCount = c;
                    dominantColor = nChar;
                  }
              }
            }
          }
        }
        const threshold = iterations === 1 ? 5 : 4; 
        if (dominantColor !== myColor && maxCount >= threshold) {
          buffer[idx] = dominantColor;
        } else {
          buffer[idx] = myColor;
        }
      }
    }
    current = [...buffer];
  }
  return current;
};

// HSL Utils
const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
};

const hslToRgb = (h: number, s: number, l: number) => {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

export const Workstation: React.FC<WorkstationProps> = ({ 
  settings, 
  setProcessingState,
  onCanvasReady,
  analysisResult,
  language,
  activeTool,
  setActiveTool,
  brushColor,
  setBrushColor,
  project,
  setProject,
  pushToHistory
}) => {
  const t = LABELS[language];
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const previousToolRef = useRef<DrawingTool>('pan');
  const [generatedBaseData, setGeneratedBaseData] = useState<ImageData | null>(null);

  // Animation Loop
  useEffect(() => {
    let interval: number;
    if (project.isPlaying && project.frames.length > 1) {
        interval = window.setInterval(() => {
            setProject(p => {
                const next = (p.currentFrameIndex + 1) % p.frames.length;
                return { ...p, currentFrameIndex: next };
            });
        }, 1000 / project.fps);
    }
    return () => clearInterval(interval);
  }, [project.isPlaying, project.fps, project.frames.length, setProject]);

  // Main Rendering Pipeline
  const renderFinalCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !generatedBaseData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width;
    const h = canvas.height;

    // 1. Start with Generated Base (Background)
    const combinedData = new Uint8ClampedArray(generatedBaseData.data);
    
    // 2. Render Onion Skin (if enabled)
    if (project.onionSkin && !project.isPlaying && project.currentFrameIndex > 0) {
        const prevFrame = project.frames[project.currentFrameIndex - 1];
        prevFrame.layers.forEach(layer => {
            if (layer.visible) {
                layer.data.forEach((color, key) => {
                    const [x, y] = key.split(',').map(Number);
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                        // Alpha blending for onion skin (30% opacity)
                        const opacity = 0.3;
                        combinedData[idx] = combinedData[idx] * (1-opacity) + color[0] * opacity;
                        combinedData[idx+1] = combinedData[idx+1] * (1-opacity) + color[1] * opacity;
                        combinedData[idx+2] = combinedData[idx+2] * (1-opacity) + color[2] * opacity;
                        combinedData[idx+3] = 255;
                    }
                });
            }
        });
    }

    // 3. Render Active Frame Layers
    const activeFrame = project.frames[project.currentFrameIndex];
    if (activeFrame) {
        activeFrame.layers.forEach(layer => {
            if (layer.visible) {
                layer.data.forEach((color, key) => {
                    const [x, y] = key.split(',').map(Number);
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                        combinedData[idx] = color[0];
                        combinedData[idx+1] = color[1];
                        combinedData[idx+2] = color[2];
                        combinedData[idx+3] = 255; // Full opacity for now
                    }
                });
            }
        });
    }

    // 4. Calculate Outline (Stroke) if enabled
    const outlineData = new Uint8ClampedArray(w * h * 4); 
    const outlineColor = hexToRgb(settings.outlineColor);
    
    if (settings.hasOutline) {
        const thickness = settings.outlineThickness || 1;
        
        const isSolid = (x: number, y: number) => {
             const idx = (y * w + x) * 4;
             return combinedData[idx + 3] > 0;
        };

        const grid = new Int8Array(w * h);
        let queue: number[] = [];
        let nextQueue: number[] = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (isSolid(x, y)) {
                    const p = y * w + x;
                    grid[p] = 1;
                    queue.push(p);
                }
            }
        }

        for (let i = 0; i < thickness; i++) {
            nextQueue = [];
            for (const p of queue) {
                const cx = p % w;
                const cy = Math.floor(p / w);

                const neighbors = [
                    [cx-1,cy], [cx+1,cy], [cx,cy-1], [cx,cy+1],
                    [cx-1,cy-1], [cx+1,cy-1], [cx-1,cy+1], [cx+1,cy+1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        const np = ny * w + nx;
                        if (grid[np] === 0) {
                            grid[np] = 2; // Mark as outline
                            nextQueue.push(np);
                            const oIdx = np * 4;
                            outlineData[oIdx] = outlineColor[0];
                            outlineData[oIdx+1] = outlineColor[1];
                            outlineData[oIdx+2] = outlineColor[2];
                            outlineData[oIdx+3] = 255;
                        }
                    }
                }
            }
            queue = nextQueue;
        }
    }

    // 5. Merge Outline
    for (let i = 0; i < combinedData.length; i += 4) {
        if (outlineData[i+3] > 0) {
            if (combinedData[i+3] === 0) {
                combinedData[i] = outlineData[i];
                combinedData[i+1] = outlineData[i+1];
                combinedData[i+2] = outlineData[i+2];
                combinedData[i+3] = 255;
            }
        }
    }

    const finalImageData = new ImageData(combinedData, w, h);
    ctx.putImageData(finalImageData, 0, 0);
    onCanvasReady(canvas);

  }, [generatedBaseData, project, settings, onCanvasReady]);

  useEffect(() => {
    renderFinalCanvas();
  }, [renderFinalCanvas]);


  const processImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const w = sourceImage.width;
    const h = sourceImage.height;
    const blockSize = Math.max(1, Math.floor(settings.pixelSize));
    const finalW = Math.ceil(w / blockSize);
    const finalH = Math.ceil(h / blockSize);

    setProcessingState(prev => ({
      ...prev,
      originalWidth: w,
      originalHeight: h,
      processedWidth: finalW,
      processedHeight: finalH,
      previewUrl: 'ready',
    }));

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;
    offCtx.drawImage(sourceImage, 0, 0);
    const srcData = offCtx.getImageData(0, 0, w, h).data;

    // --- Process Logic with HSL Adjustment ---
    
    const blockColors: number[][] = [];
    const contrastFactor = settings.contrast; 

    for (let y = 0; y < finalH; y++) {
      for (let x = 0; x < finalW; x++) {
        const srcX = x * blockSize;
        const srcY = y * blockSize;
        
        const colorCounts = new Map<number, number>();
        let transparentCount = 0;
        let totalCount = 0;
        const step = blockSize > 8 ? 2 : 1; 

        for (let by = 0; by < blockSize; by += step) {
          if (srcY + by >= h) continue;
          for (let bx = 0; bx < blockSize; bx += step) {
            if (srcX + bx >= w) continue;
            
            const idx = ((srcY + by) * w + (srcX + bx)) * 4;
            const alpha = srcData[idx + 3];
            
            if (alpha < 20) {
                transparentCount++;
            } else {
                const r = srcData[idx];
                const g = srcData[idx + 1];
                const b = srcData[idx + 2];
                const key = rgbInt(r, g, b);
                colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
            }
            totalCount++;
          }
        }

        if (transparentCount > totalCount / 2) {
             blockColors.push([-1, -1, -1]);
        } else {
            let dominantColor = -1;
            let maxCount = -1;
            for (const [color, count] of colorCounts.entries()) {
                if (count > maxCount) { maxCount = count; dominantColor = color; }
            }
            if (dominantColor === -1) dominantColor = 0; 

            let [r, g, b] = intToRgb(dominantColor);

            if (settings.isGrayscale) {
                const avg = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                r = g = b = avg;
            }

            // HSL Adjustments
            if (settings.hsl.brightness !== 0 || settings.hsl.saturation !== 0 || settings.hsl.hue !== 0) {
                 let [h, s, l] = rgbToHsl(r, g, b);
                 h = (h + settings.hsl.hue + 360) % 360;
                 s = Math.min(100, Math.max(0, s + settings.hsl.saturation));
                 l = Math.min(100, Math.max(0, l + settings.hsl.brightness));
                 [r, g, b] = hslToRgb(h, s, l);
            }

            // Contrast
            r = Math.min(255, Math.max(0, (r - 128) * contrastFactor + 128));
            g = Math.min(255, Math.max(0, (g - 128) * contrastFactor + 128));
            b = Math.min(255, Math.max(0, (b - 128) * contrastFactor + 128));

            blockColors.push([r, g, b]);
        }
      }
    }

    const opaqueColors = blockColors.filter(c => c[0] !== -1);
    const palette = extractPalette(opaqueColors, settings.paletteSize);

    let pixelIndices = new Array(blockColors.length);

    for (let y = 0; y < finalH; y++) {
      for (let x = 0; x < finalW; x++) {
        const i = y * finalW + x;
        const color = blockColors[i];
        if (color[0] === -1) { pixelIndices[i] = -1; continue; }

        let targetColor = color;
        if (settings.dithering > 0) {
          const bayerVal = bayerMatrix[y % 4][x % 4];
          const threshold = (bayerVal / 16 - 0.5) * (settings.dithering * 40);
          targetColor = [
             Math.min(255, Math.max(0, color[0] + threshold)),
             Math.min(255, Math.max(0, color[1] + threshold)),
             Math.min(255, Math.max(0, color[2] + threshold))
          ];
        }

        let nearestIdx = 0;
        let minD = Infinity;
        for (let pIdx = 0; pIdx < palette.length; pIdx++) {
          const d = distanceSq(targetColor, palette[pIdx]);
          if (d < minD) { minD = d; nearestIdx = pIdx; }
        }
        pixelIndices[i] = nearestIdx;
      }
    }

    if (settings.smoothing > 0) {
        const passes = settings.smoothing === 1 ? 1 : 2;
        pixelIndices = applySmoothing(pixelIndices, finalW, finalH, passes);
    }

    const finalImageData = ctx.createImageData(finalW, finalH);
    const finalData = finalImageData.data;

    for (let i = 0; i < pixelIndices.length; i++) {
      const pIdx = pixelIndices[i];
      const idx = i * 4;
      
      if (pIdx === -1) {
          finalData[idx] = 0;
          finalData[idx + 1] = 0;
          finalData[idx + 2] = 0;
          finalData[idx + 3] = 0; 
      } else {
          const color = palette[pIdx];
          finalData[idx] = color[0];
          finalData[idx + 1] = color[1];
          finalData[idx + 2] = color[2];
          finalData[idx + 3] = 255;
      }
    }

    canvas.width = finalW;
    canvas.height = finalH;
    setGeneratedBaseData(finalImageData);

  }, [sourceImage, settings, setProcessingState]);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (sourceImage) {
            processImage();
        }
    }, 40);
    return () => clearTimeout(timer);
  }, [sourceImage, settings, processImage]);

  useEffect(() => {
    const handleUpdate = (e: CustomEvent) => {
        const img = new Image();
        img.onload = () => {
            setSourceImage(img);
        };
        img.src = e.detail;
    };
    window.addEventListener('UPDATE_SOURCE_IMAGE' as any, handleUpdate);
    return () => window.removeEventListener('UPDATE_SOURCE_IMAGE' as any, handleUpdate);
  }, []);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setSourceImage(img);
          setZoom(1); 
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
            setSourceImage(img);
            setZoom(1);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
  };

  const getCanvasCoordinates = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
    return { x, y };
  };

  // Interaction Logic (Modified to work with Layers/Project)
  const performToolAction = (e: React.PointerEvent) => {
    if (activeTool === 'pan' || !generatedBaseData) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    const { x, y } = coords;
    const key = `${x},${y}`;
    const activeLayerId = project.activeLayerId;
    const currentFrameIndex = project.currentFrameIndex;

    const updateLayer = (updateFn: (map: Map<string, number[]>) => void) => {
        setProject(prev => {
            const newFrames = [...prev.frames];
            const layers = newFrames[currentFrameIndex].layers.map(l => {
                if (l.id === activeLayerId) {
                    const newData = new Map<string, number[]>(l.data);
                    updateFn(newData);
                    return { ...l, data: newData };
                }
                return l;
            });
            newFrames[currentFrameIndex] = { ...newFrames[currentFrameIndex], layers };
            return { ...prev, frames: newFrames };
        });
    };

    if (activeTool === 'brush') {
        const rgb = hexToRgb(brushColor);
        updateLayer(map => map.set(key, rgb));
    } else if (activeTool === 'eraser') {
        updateLayer(map => map.delete(key));
    } else if (activeTool === 'eyedropper') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        if (pixel[3] === 0) return;
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        setBrushColor(hex);
        setIsDrawing(false); 
    } else if (activeTool === 'bucket') {
        const rgb = hexToRgb(brushColor);
        const layer = project.frames[currentFrameIndex].layers.find(l => l.id === activeLayerId);
        if (!layer) return;

        // BFS Flood Fill on the active layer
        // If we click on an empty pixel, fill connected empty pixels.
        // If we click on a colored pixel, fill connected pixels of that color.
        
        const startColor = layer.data.get(key); // undefined if empty
        
        // Safety: Limit flood fill to avoid infinite loops or massive lag in React state
        // Max pixels to fill
        const MAX_FILL = 2048; 
        let filledCount = 0;

        const queue = [[x, y]];
        const visited = new Set<string>();
        visited.add(key);

        const newMapData = new Map<string, number[]>(layer.data);
        const targetIsPresent = !!startColor;

        while (queue.length > 0 && filledCount < MAX_FILL) {
            const [cx, cy] = queue.shift()!;
            const cKey = `${cx},${cy}`;
            
            // Apply color
            newMapData.set(cKey, rgb);
            filledCount++;

            // Neighbors
            const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || ny < 0 || nx >= generatedBaseData.width || ny >= generatedBaseData.height) continue;
                
                const nKey = `${nx},${ny}`;
                if (visited.has(nKey)) continue;

                const nColor = layer.data.get(nKey);
                const nIsPresent = !!nColor;

                let shouldFill = false;
                if (!targetIsPresent) {
                    // Filling empty space
                    shouldFill = !nIsPresent;
                } else {
                    // Replacing color
                    if (nIsPresent && nColor![0] === startColor![0] && nColor![1] === startColor![1] && nColor![2] === startColor![2]) {
                        shouldFill = true;
                    }
                }

                if (shouldFill) {
                    visited.add(nKey);
                    queue.push([nx, ny]);
                }
            }
        }
        
        updateLayer(map => {
            // merge newMapData into map? Or just use newMapData
            // updateLayer expects a callback to mutate the map, but we calculated a new one effectively.
            // Let's just manually re-set all changed keys.
             newMapData.forEach((v, k) => map.set(k, v));
        });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!sourceImage) return;
    if (activeTool === 'pan') return;
    e.preventDefault(); 
    pushToHistory(); // Save state before action
    setIsDrawing(true);
    performToolAction(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDrawing && activeTool !== 'pan' && activeTool !== 'eyedropper') {
        e.preventDefault();
        performToolAction(e);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (e.key === 'Alt') {
            e.preventDefault();
            if (activeTool !== 'eyedropper') {
                previousToolRef.current = activeTool;
                setActiveTool('eyedropper');
            }
        } else if (key === 'b') {
            setActiveTool('brush');
        } else if (key === 'g') {
            setActiveTool('bucket');
        } else if (key === 'e') {
            setActiveTool('eraser');
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            if (activeTool === 'eyedropper') {
                setActiveTool(previousToolRef.current);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, setActiveTool]);


  return (
    <div 
        className="flex-1 bg-[#050505] relative overflow-hidden flex flex-col"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    >
      
      {/* Toolbar overlay */}
      <div className="absolute top-4 left-4 z-20 flex gap-2 bg-[#111] p-2 cassette-border items-center">
        <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-[#222] text-[#ffb000] border border-transparent hover:border-[#ffb000]" title="Import">
          <Upload className="w-5 h-5" />
        </button>
        <div className="w-px bg-[#333] h-6 mx-1"></div>
        <div className="flex items-center gap-2 px-2">
            <ZoomOut className="w-4 h-4 text-[#00cccc]" />
            <input 
                type="range" 
                min="0.5" 
                max="16" 
                step="0.5" 
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-24 h-1 bg-[#333] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#00cccc] [&::-webkit-slider-thumb]:rotate-45"
            />
            <ZoomIn className="w-4 h-4 text-[#00cccc]" />
        </div>
        <span className="text-xs font-mono text-white w-10 text-right">
            {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(1)} className="p-2 hover:bg-[#222] text-[#00cccc]" title="Reset">
            <Maximize className="w-4 h-4" />
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*"
        />
      </div>

      {/* AI Analysis Overlay */}
      {analysisResult && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30 w-11/12 max-w-xl animate-fade-in-up pointer-events-none">
            <div className="bg-[#0a0a0a]/90 backdrop-blur-md border-l-4 border-[#ffb000] p-4 shadow-[0_0_20px_rgba(255,176,0,0.2)] cassette-border relative overflow-hidden pointer-events-auto">
                <div className="flex justify-between items-start mb-2 border-b border-[#333] pb-1">
                    <h3 className="text-lg font-retro-title tracking-widest text-[#ffb000] uppercase">
                        {analysisResult.title}
                    </h3>
                    <span className="text-[10px] uppercase bg-[#333] text-[#00cccc] px-2 py-1 font-mono border border-[#00cccc]/50">
                        {analysisResult.mood}
                    </span>
                </div>
                <p className="text-[#00cccc] text-sm leading-tight font-mono uppercase">
                    {">>"} {analysisResult.description}
                </p>
            </div>
        </div>
      )}

      {/* Canvas Container */}
      <div 
        ref={containerRef}
        className={`flex-1 flex items-center justify-center overflow-auto p-0 ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'eyedropper' ? 'cursor-crosshair' : activeTool === 'bucket' ? 'cursor-copy' : 'cursor-cell'}`}
        style={{ 
            backgroundImage: 'radial-gradient(#1a1a1a 2px, transparent 2px)', 
            backgroundSize: '32px 32px',
            backgroundColor: '#050505'
        }}
      >
        {!sourceImage ? (
          <div className="text-center text-gray-500 flex flex-col items-center">
            <div className="border border-dashed border-[#444] p-12 bg-[#0a0a0a]/50">
                <Upload className="w-16 h-16 mb-4 opacity-30 text-[#ffb000] mx-auto" />
                <p className="text-xl font-retro-title text-[#ffb000] mb-2 tracking-widest">{t.dragDrop}</p>
                <p className="text-xs font-mono text-gray-600 uppercase">{t.uploadInfo}</p>
            </div>
          </div>
        ) : (
          <div 
            style={{ 
                transform: `scale(${zoom})`, 
                transformOrigin: 'center',
                transition: isDrawing ? 'none' : 'transform 0.1s ease-out'
            }}
            className="shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#222] bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAuSURBVHgB7YwxDQAwDMSg96/0M2LAwY0qK6kC8yW5J2c/B2x2wWIX/JGw2QWdfwL5E5+iS8OAAAAAAElFTkSuQmCC')]"
          >
            <canvas 
                ref={canvasRef} 
                className="pixelated-canvas block touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
            />
          </div>
        )}
      </div>
    </div>
  );
};