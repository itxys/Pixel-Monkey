import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PixelSettings, ProcessingState, Language, LABELS, DrawingTool, ProjectState, Layer, HistoryDelta } from '../types';
import { Upload, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface WorkstationProps {
  settings: PixelSettings;
  setProcessingState: React.Dispatch<React.SetStateAction<ProcessingState>>;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  language: Language;
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  activeLayer: Layer;
  setActiveLayer: React.Dispatch<React.SetStateAction<Layer>>;
  pushToHistory: () => void;
  // Symmetry drawing props
  symmetryEnabled: boolean;
  symmetryType: 'vertical' | 'horizontal';
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
};

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
  language,
  activeTool,
  setActiveTool,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  project,
  setProject,
  activeLayer,
  setActiveLayer,
  pushToHistory,
  symmetryEnabled,
  symmetryType
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
  
  // Move tool state
  const [isMoving, setIsMoving] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [moveOffset, setMoveOffset] = useState({ dx: 0, dy: 0 });
  const initialLayerDataRef = useRef<Map<string, number[]> | null>(null);
  
  // Pan tool state
  const [isPanning, setIsPanning] = useState(false);
  const [panStartPos, setPanStartPos] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  

  // Canvas Rendering Optimization
  const isRenderingRef = useRef(false);
  const renderTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Dirty Rect for Partial Redraw
  const dirtyRectRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
  
  // Update Dirty Rect with Brush Area
  const updateDirtyRect = useCallback((x: number, y: number, width: number, height: number) => {
    const canvasWidth = generatedBaseData?.width || 0;
    const canvasHeight = generatedBaseData?.height || 0;
    
    // Ensure coordinates are within bounds
    const newX = Math.max(0, x);
    const newY = Math.max(0, y);
    const newWidth = Math.min(width, canvasWidth - newX);
    const newHeight = Math.min(height, canvasHeight - newY);
    
    if (newWidth <= 0 || newHeight <= 0) {
      return;
    }
    
    if (dirtyRectRef.current) {
      // Merge with existing dirty rect
      const current = dirtyRectRef.current;
      const mergedX = Math.min(current.x, newX);
      const mergedY = Math.min(current.y, newY);
      const mergedWidth = Math.max(current.x + current.width, newX + newWidth) - mergedX;
      const mergedHeight = Math.max(current.y + current.height, newY + newHeight) - mergedY;
      
      dirtyRectRef.current = {
        x: mergedX,
        y: mergedY,
        width: mergedWidth,
        height: mergedHeight
      };
    } else {
      // Set initial dirty rect
      dirtyRectRef.current = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      };
    }
  }, [generatedBaseData]);
  
  // Reset Dirty Rect
  const resetDirtyRect = useCallback(() => {
    dirtyRectRef.current = null;
  }, []);

  // Main Rendering Pipeline - Direct Render
  const renderFinalCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !generatedBaseData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width;
    const h = canvas.height;
    
    // Determine render region
    const renderRegion = dirtyRectRef.current || { x: 0, y: 0, width: w, height: h };
    
    // 1. Start with Generated Base (Background) for the render region
    const combinedData = new Uint8ClampedArray(generatedBaseData.data);
    
    // 2. Render Active Layer
    if (activeLayer && activeLayer.visible) {
        const layerWidth = activeLayer.width;
        const layerHeight = activeLayer.height;
        const layerData = activeLayer.data;
        
        // Iterate through the layer data and render pixels within the render region
        for (let y = 0; y < layerHeight; y++) {
            // Check if this row is within the render region (with buffer)
            if (y < renderRegion.y - 2 || y > renderRegion.y + renderRegion.height + 2) {
                continue;
            }
            
            for (let x = 0; x < layerWidth; x++) {
                // Check if this column is within the render region (with buffer)
                if (x < renderRegion.x - 2 || x > renderRegion.x + renderRegion.width + 2) {
                    continue;
                }
                
                // Check if pixel is within canvas bounds
                if (x >= 0 && x < w && y >= 0 && y < h) {
                    const layerIdx = (y * layerWidth + x) * 4;
                    const alpha = layerData[layerIdx + 3];
                    
                    // Only render visible pixels
                    if (alpha > 0) {
                        const canvasIdx = (y * w + x) * 4;
                        combinedData[canvasIdx] = layerData[layerIdx];     // R
                        combinedData[canvasIdx + 1] = layerData[layerIdx + 1]; // G
                        combinedData[canvasIdx + 2] = layerData[layerIdx + 2]; // B
                        combinedData[canvasIdx + 3] = alpha; // Use layer's alpha
                    }
                }
            }
        }
    }

    // 3. Calculate Outline (Stroke) if enabled
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

        // Only check pixels within render region (with buffer)
        for (let y = Math.max(0, renderRegion.y - 2); y < Math.min(h, renderRegion.y + renderRegion.height + 2); y++) {
            for (let x = Math.max(0, renderRegion.x - 2); x < Math.min(w, renderRegion.x + renderRegion.width + 2); x++) {
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

    // 4. Merge Outline
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

    if (dirtyRectRef.current) {
        // Partial Redraw - Only update the dirty region
        const { x, y, width, height } = dirtyRectRef.current;
        
        // Create image data for only the dirty region
        const dirtyImageData = new ImageData(
            combinedData.slice(
                (y * w + x) * 4, 
                (y * w + x) * 4 + (width * height * 4)
            ), 
            width, 
            height
        );
        
        // Put only the dirty region back to canvas
        ctx.putImageData(dirtyImageData, x, y);
        
        // Reset dirty rect after render
        resetDirtyRect();
    } else {
        // Full Redraw - Update the entire canvas
        const finalImageData = new ImageData(combinedData, w, h);
        ctx.putImageData(finalImageData, 0, 0);
    }
    
    // 5. Draw Grid if enabled
    if (settings.showGrid) {
        ctx.save();
        
        // Set grid style - pixel grid with white lines between pixels, similar to Photoshop
        ctx.strokeStyle = '#ffffff'; // Fixed white color for pixel grid
        ctx.lineWidth = 1; // 1px line width
        ctx.globalAlpha = 0.5; // Semi-transparent for better visibility
        
        // Draw vertical grid lines between pixels - use 0.5 offset to draw between pixels
        for (let x = 0; x < w; x++) {
            const lineX = x + 0.5;
            ctx.beginPath();
            ctx.moveTo(lineX, 0);
            ctx.lineTo(lineX, h);
            ctx.stroke();
        }
        
        // Draw horizontal grid lines between pixels - use 0.5 offset to draw between pixels
        for (let y = 0; y < h; y++) {
            const lineY = y + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, lineY);
            ctx.lineTo(w, lineY);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // 6. Draw Symmetry Axis if enabled
    if (symmetryEnabled) {
        ctx.save();
        
        // Set axis style
        ctx.strokeStyle = '#00cccc';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1; // Slightly thicker than grid lines
        
        if (symmetryType === 'vertical') {
            // Draw vertical axis at center
            const centerX = Math.floor(w / 2);
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, h);
            ctx.stroke();
        } else {
            // Draw horizontal axis at center
            const centerY = Math.floor(h / 2);
            ctx.beginPath();
            ctx.moveTo(0, centerY);
            ctx.lineTo(w, centerY);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    onCanvasReady(canvas);

  }, [generatedBaseData, activeLayer, settings, onCanvasReady, resetDirtyRect]);

  // Optimized Render with requestAnimationFrame and Debounce
  const scheduleRender = useCallback(() => {
    if (isRenderingRef.current) {
      return;
    }

    isRenderingRef.current = true;
    requestAnimationFrame(() => {
      renderFinalCanvas();
      isRenderingRef.current = false;
    });
  }, [renderFinalCanvas]);

  // Debounced Render for State Changes
  const debouncedRender = useCallback(() => {
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }
    
    renderTimeoutRef.current = setTimeout(() => {
      scheduleRender();
    }, 16); // ~60fps
  }, [scheduleRender]);

  // Update useEffect to use debounced render
  useEffect(() => {
    debouncedRender();
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [debouncedRender]);

  // Update renderFinalCanvas calls to use scheduleRender
  useEffect(() => {
    scheduleRender();
  }, [generatedBaseData, scheduleRender]);


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
    
    // Update active layer size to match canvas size - create new empty layer to avoid infinite loop
    setActiveLayer(prev => {
      // Create new data array with matching dimensions
      const newData = new Uint8ClampedArray(finalW * finalH * 4);
      
      return {
        ...prev,
        width: finalW,
        height: finalH,
        data: newData
      };
    });

  }, [sourceImage, settings, setProcessingState, setActiveLayer]);

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


  /**
   * 调整图片大小，使其最长边不超过1024像素
   * @param img 原始图片对象
   * @returns 调整大小后的图片对象
   */
  const resizeImage = (img: HTMLImageElement): HTMLImageElement => {
    const MAX_SIZE = 1024;
    const width = img.width;
    const height = img.height;
    
    // 如果图片已经小于等于1024像素，直接返回
    if (width <= MAX_SIZE && height <= MAX_SIZE) {
      return img;
    }
    
    // 计算缩放比例
    const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
    const newWidth = Math.floor(width * scale);
    const newHeight = Math.floor(height * scale);
    
    // 创建新的canvas和image对象
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;
    
    // 绘制缩放后的图片
    ctx.imageSmoothingEnabled = false; // 保持像素风格
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    
    // 创建新的Image对象
    const resizedImg = new Image();
    resizedImg.src = canvas.toDataURL('image/png');
    resizedImg.width = newWidth;
    resizedImg.height = newHeight;
    
    return resizedImg;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const resizedImg = resizeImage(img);
          setSourceImage(resizedImg);
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
            const resizedImg = resizeImage(img);
            setSourceImage(resizedImg);
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

    // Update Layer function for TypedArray with Delta Recording
    const updateLayer = (updateFn: (data: Uint8ClampedArray) => void, recordChanges: boolean = true) => {
        const originalData = activeLayer.data;
        const newData = new Uint8ClampedArray(originalData);
        const layerWidth = activeLayer.width;
        
        // Collect changes for history delta
        const changes: Array<{
          x: number;
          y: number;
          oldColor: [number, number, number, number];
          newColor: [number, number, number, number];
        }> = [];
        
        updateFn(newData);
        
        // Record changes if needed
        if (recordChanges) {
            // This is a simplified approach - in practice, we'd only check modified area
            // For now, we'll check all pixels in the brush area
            const halfSize = Math.floor(brushSize / 2);
            for (let dx = -halfSize; dx <= halfSize; dx++) {
                for (let dy = -halfSize; dy <= halfSize; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < layerWidth && ny >= 0 && ny < activeLayer.height) {
                        const idx = (ny * layerWidth + nx) * 4;
                        
                        const oldColor: [number, number, number, number] = [
                            originalData[idx],
                            originalData[idx + 1],
                            originalData[idx + 2],
                            originalData[idx + 3]
                        ];
                        
                        const newColor: [number, number, number, number] = [
                            newData[idx],
                            newData[idx + 1],
                            newData[idx + 2],
                            newData[idx + 3]
                        ];
                        
                        // Only record actual changes
                        if (oldColor[0] !== newColor[0] || oldColor[1] !== newColor[1] || 
                            oldColor[2] !== newColor[2] || oldColor[3] !== newColor[3]) {
                            changes.push({ x: nx, y: ny, oldColor, newColor });
                        }
                    }
                }
            }
            
            // Create and push delta if there are changes
            if (changes.length > 0) {
                const delta: HistoryDelta = {
                    type: 'pixel',
                    layerId: activeLayer.id,
                    changes,
                    timestamp: Date.now()
                };
                
                // Create a wrapper object to match pushToHistory expectations
                pushToHistory(delta);
            }
        }
        
        setActiveLayer(prev => ({ ...prev, data: newData }));
    };

    // Helper function to apply brush/eraser action with symmetry
    const applySymmetryAction = (data: Uint8ClampedArray, action: (nx: number, ny: number) => void) => {
        const layerWidth = activeLayer.width;
        const layerHeight = activeLayer.height;
        
        // Apply action to original position
        action(x, y);
        
        // Apply symmetry if enabled
        if (symmetryEnabled) {
            if (symmetryType === 'vertical') {
                // Vertical symmetry - mirror over center vertical line
                const centerX = Math.floor(layerWidth / 2);
                const mirroredX = centerX + (centerX - x);
                action(mirroredX, y);
            } else {
                // Horizontal symmetry - mirror over center horizontal line
                const centerY = Math.floor(layerHeight / 2);
                const mirroredY = centerY + (centerY - y);
                action(x, mirroredY);
            }
        }
    };
    
    if (activeTool === 'brush') {
        const rgb = hexToRgb(brushColor);
        // Update dirty rect with brush area
        const halfSize = Math.floor(brushSize / 2);
        updateDirtyRect(x - halfSize, y - halfSize, brushSize, brushSize);
        
        // Also update dirty rect for symmetry area if enabled
        if (symmetryEnabled) {
            if (symmetryType === 'vertical') {
                const centerX = Math.floor(activeLayer.width / 2);
                const mirroredX = centerX + (centerX - x);
                updateDirtyRect(mirroredX - halfSize, y - halfSize, brushSize, brushSize);
            } else {
                const centerY = Math.floor(activeLayer.height / 2);
                const mirroredY = centerY + (centerY - y);
                updateDirtyRect(x - halfSize, mirroredY - halfSize, brushSize, brushSize);
            }
        }
        
        updateLayer(data => {
            // Calculate brush area (square centered at x,y with size brushSize)
            const layerWidth = activeLayer.width;
            
            // Define brush action
            const brushAction = (posX: number, posY: number) => {
                for (let dx = -halfSize; dx <= halfSize; dx++) {
                    for (let dy = -halfSize; dy <= halfSize; dy++) {
                        const nx = posX + dx;
                        const ny = posY + dy;
                        // Check if the pixel is within canvas bounds
                        if (nx >= 0 && nx < layerWidth && ny >= 0 && ny < activeLayer.height) {
                            const idx = (ny * layerWidth + nx) * 4;
                            data[idx] = rgb[0];     // R
                            data[idx + 1] = rgb[1]; // G
                            data[idx + 2] = rgb[2]; // B
                            data[idx + 3] = 255;     // A (opaque)
                        }
                    }
                }
            };
            
            // Apply brush action with symmetry
            applySymmetryAction(data, brushAction);
        });
    } else if (activeTool === 'eraser') {
        // Update dirty rect with eraser area
        const halfSize = Math.floor(brushSize / 2);
        updateDirtyRect(x - halfSize, y - halfSize, brushSize, brushSize);
        
        // Also update dirty rect for symmetry area if enabled
        if (symmetryEnabled) {
            if (symmetryType === 'vertical') {
                const centerX = Math.floor(activeLayer.width / 2);
                const mirroredX = centerX + (centerX - x);
                updateDirtyRect(mirroredX - halfSize, y - halfSize, brushSize, brushSize);
            } else {
                const centerY = Math.floor(activeLayer.height / 2);
                const mirroredY = centerY + (centerY - y);
                updateDirtyRect(x - halfSize, mirroredY - halfSize, brushSize, brushSize);
            }
        }
        
        updateLayer(data => {
            // Calculate eraser area (square centered at x,y with size brushSize)
            const layerWidth = activeLayer.width;
            
            // Define eraser action
            const eraserAction = (posX: number, posY: number) => {
                for (let dx = -halfSize; dx <= halfSize; dx++) {
                    for (let dy = -halfSize; dy <= halfSize; dy++) {
                        const nx = posX + dx;
                        const ny = posY + dy;
                        // Check if the pixel is within canvas bounds
                        if (nx >= 0 && nx < layerWidth && ny >= 0 && ny < activeLayer.height) {
                            const idx = (ny * layerWidth + nx) * 4;
                            data[idx] = 0;     // R
                            data[idx + 1] = 0; // G
                            data[idx + 2] = 0; // B
                            data[idx + 3] = 0;     // A (transparent)
                        }
                    }
                }
            };
            
            // Apply eraser action with symmetry
            applySymmetryAction(data, eraserAction);
        });
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
        const layerWidth = activeLayer.width;
        const layerHeight = activeLayer.height;
        
        // Get start pixel color
        const startIdx = (y * layerWidth + x) * 4;
        const startR = activeLayer.data[startIdx];
        const startG = activeLayer.data[startIdx + 1];
        const startB = activeLayer.data[startIdx + 2];
        const startA = activeLayer.data[startIdx + 3];
        
        // Check if start pixel is already the target color
        if (startR === rgb[0] && startG === rgb[1] && startB === rgb[2] && startA === 255) {
            return;
        }
        
        // BFS Flood Fill on the active layer
        // Safety: Limit flood fill to avoid infinite loops or massive lag in React state
        const MAX_FILL = 4096; // Increased fill limit
        let filledCount = 0;
        
        // Create array to hold all coordinates to fill
        const allFillCoords: Array<{ x: number; y: number }> = [];
        const allSymmetryCoords: Array<{ x: number; y: number }> = [];
        
        // Main flood fill
        const queue = [[x, y]];
        const visited = new Set<number>();
        visited.add(y * layerWidth + x);
        
        // Create dirty rect for the fill area
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        
        while (queue.length > 0 && filledCount < MAX_FILL) {
            const [cx, cy] = queue.shift()!;
            
            // Add to fill coordinates
            allFillCoords.push({ x: cx, y: cy });
            
            // Add symmetry coordinates if enabled
            if (symmetryEnabled) {
                if (symmetryType === 'vertical') {
                    // Vertical symmetry - mirror over center vertical line
                    const centerX = Math.floor(layerWidth / 2);
                    const mirroredX = centerX + (centerX - cx);
                    if (mirroredX >= 0 && mirroredX < layerWidth) {
                        allSymmetryCoords.push({ x: mirroredX, y: cy });
                    }
                } else {
                    // Horizontal symmetry - mirror over center horizontal line
                    const centerY = Math.floor(layerHeight / 2);
                    const mirroredY = centerY + (centerY - cy);
                    if (mirroredY >= 0 && mirroredY < layerHeight) {
                        allSymmetryCoords.push({ x: cx, y: mirroredY });
                    }
                }
            }
            
            filledCount++;
            
            // Update dirty rect bounds
            minX = Math.min(minX, cx);
            minY = Math.min(minY, cy);
            maxX = Math.max(maxX, cx);
            maxY = Math.max(maxY, cy);
            
            // Neighbors
            const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || ny < 0 || nx >= layerWidth || ny >= layerHeight) continue;
                
                const pixelKey = ny * layerWidth + nx;
                if (visited.has(pixelKey)) continue;
                
                const nIdx = pixelKey * 4;
                const nR = activeLayer.data[nIdx];
                const nG = activeLayer.data[nIdx + 1];
                const nB = activeLayer.data[nIdx + 2];
                const nA = activeLayer.data[nIdx + 3];
                
                // Check if neighbor has the same color as start pixel
                if (nR === startR && nG === startG && nB === startB && nA === startA) {
                    visited.add(pixelKey);
                    queue.push([nx, ny]);
                }
            }
        }
        
        // Reset fill arrays and use a proper BFS approach
        // We'll use a single array for all pixels to fill and properly handle symmetry
        const pixelsToFill: Array<{ x: number; y: number }> = [];
        const visited = new Set<number>();
        const queue = [[x, y]];
        visited.add(y * layerWidth + x);
        
        // Helper function to check if a pixel has the same color as the start pixel
        const isSameColor = (px: number, py: number): boolean => {
            if (px < 0 || px >= layerWidth || py < 0 || py >= layerHeight) {
                return false;
            }
            const idx = (py * layerWidth + px) * 4;
            return (
                activeLayer.data[idx] === startR &&
                activeLayer.data[idx + 1] === startG &&
                activeLayer.data[idx + 2] === startB &&
                activeLayer.data[idx + 3] === startA
            );
        };
        
        // Clear previous fill data
        allFillCoords.length = 0;
        allSymmetryCoords.length = 0;
        
        // Proper BFS flood fill that handles symmetry correctly
        while (queue.length > 0 && pixelsToFill.length < MAX_FILL) {
            const [cx, cy] = queue.shift()!;
            
            // Add current pixel to fill list
            pixelsToFill.push({ x: cx, y: cy });
            
            // Get symmetric pixel if symmetry is enabled
            if (symmetryEnabled) {
                let symmetricX = cx;
                let symmetricY = cy;
                
                if (symmetryType === 'vertical') {
                    // Vertical symmetry - mirror over center vertical line
                    const centerX = Math.floor(layerWidth / 2);
                    symmetricX = centerX + (centerX - cx);
                } else {
                    // Horizontal symmetry - mirror over center horizontal line
                    const centerY = Math.floor(layerHeight / 2);
                    symmetricY = centerY + (centerY - cy);
                }
                
                // Check if symmetric pixel is within bounds and has the same color
                const symmetricKey = symmetricY * layerWidth + symmetricX;
                if (
                    symmetricX >= 0 && symmetricX < layerWidth &&
                    symmetricY >= 0 && symmetricY < layerHeight &&
                    !visited.has(symmetricKey) &&
                    isSameColor(symmetricX, symmetricY)
                ) {
                    // Add symmetric pixel to queue and mark as visited
                    visited.add(symmetricKey);
                    queue.push([symmetricX, symmetricY]);
                }
            }
            
            // Check four neighbors (up, down, left, right)
            const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
            for (const [nx, ny] of neighbors) {
                const neighborKey = ny * layerWidth + nx;
                if (
                    nx >= 0 && nx < layerWidth &&
                    ny >= 0 && ny < layerHeight &&
                    !visited.has(neighborKey) &&
                    isSameColor(nx, ny)
                ) {
                    // Add neighbor to queue and mark as visited
                    visited.add(neighborKey);
                    queue.push([nx, ny]);
                }
            }
        }
        
        // Create a copy of the original layer data
        const originalData = activeLayer.data;
        const newData = new Uint8ClampedArray(originalData);
        
        // Create changes array for history delta
        const changes: Array<{
          x: number;
          y: number;
          oldColor: [number, number, number, number];
          newColor: [number, number, number, number];
        }> = [];
        
        // Apply fill to all pixels and record changes
        for (const { x: fillX, y: fillY } of pixelsToFill) {
            if (fillX >= 0 && fillX < layerWidth && fillY >= 0 && fillY < layerHeight) {
                const idx = (fillY * layerWidth + fillX) * 4;
                
                // Record old color for history
                const oldColor: [number, number, number, number] = [
                    originalData[idx],
                    originalData[idx + 1],
                    originalData[idx + 2],
                    originalData[idx + 3]
                ];
                
                // Apply new color
                const newColor: [number, number, number, number] = [
                    rgb[0],
                    rgb[1],
                    rgb[2],
                    255
                ];
                
                newData[idx] = newColor[0];     // R
                newData[idx + 1] = newColor[1]; // G
                newData[idx + 2] = newColor[2]; // B
                newData[idx + 3] = newColor[3]; // A (opaque)
                
                // Record change if color actually changed
                if (oldColor[0] !== newColor[0] || oldColor[1] !== newColor[1] || 
                    oldColor[2] !== newColor[2] || oldColor[3] !== newColor[3]) {
                    changes.push({ x: fillX, y: fillY, oldColor, newColor });
                }
            }
        }
        
        // Update layer with new data
        setActiveLayer(prev => ({ ...prev, data: newData }));
        
        // Record history delta if there are changes
        if (changes.length > 0) {
            const delta: HistoryDelta = {
                type: 'pixel',
                layerId: activeLayer.id,
                changes,
                timestamp: Date.now()
            };
            
            pushToHistory(delta);
        }
        
        // Calculate new dirty rect based on actual filled pixels
        if (pixelsToFill.length > 0) {
            let minFillX = pixelsToFill[0].x;
            let minFillY = pixelsToFill[0].y;
            let maxFillX = pixelsToFill[0].x;
            let maxFillY = pixelsToFill[0].y;
            
            for (const { x: px, y: py } of pixelsToFill) {
                minFillX = Math.min(minFillX, px);
                minFillY = Math.min(minFillY, py);
                maxFillX = Math.max(maxFillX, px);
                maxFillY = Math.max(maxFillY, py);
            }
            
            // Update dirty rect with the actual fill area
            updateDirtyRect(minFillX, minFillY, maxFillX - minFillX + 1, maxFillY - minFillY + 1);
        }
    }
  };

  // Move Tool Logic
  const handleMoveStart = (e: React.PointerEvent) => {
    if (activeTool !== 'move' || !generatedBaseData) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    e.preventDefault();
    setIsMoving(true);
    setStartPos(coords);
    setMoveOffset({ dx: 0, dy: 0 });
    
    // Store initial layer data for reference during move
    initialLayerDataRef.current = new Uint8ClampedArray(activeLayer.data);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!isMoving || !generatedBaseData || !initialLayerDataRef.current) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    e.preventDefault();
    
    // Calculate offset from start position
    const dx = coords.x - startPos.x;
    const dy = coords.y - startPos.y;
    setMoveOffset({ dx, dy });
    
    // Update layer data with offset
    const newData = new Uint8ClampedArray(generatedBaseData.width * generatedBaseData.height * 4);
    const layerWidth = activeLayer.width;
    const layerHeight = activeLayer.height;
    
    // Iterate through initial data and apply offset
    for (let y = 0; y < layerHeight; y++) {
      for (let x = 0; x < layerWidth; x++) {
        const idx = (y * layerWidth + x) * 4;
        const alpha = initialLayerDataRef.current[idx + 3];
        
        if (alpha > 0) {
          const newX = x + dx;
          const newY = y + dy;
          
          // Only keep pixels within canvas bounds
          if (newX >= 0 && newX < layerWidth && newY >= 0 && newY < layerHeight) {
            const newIdx = (newY * layerWidth + newX) * 4;
            newData[newIdx] = initialLayerDataRef.current[idx];
            newData[newIdx + 1] = initialLayerDataRef.current[idx + 1];
            newData[newIdx + 2] = initialLayerDataRef.current[idx + 2];
            newData[newIdx + 3] = initialLayerDataRef.current[idx + 3];
          }
        }
      }
    }
    
    setActiveLayer(prev => ({ ...prev, data: newData }));
  };

  const handleMoveEnd = () => {
    if (initialLayerDataRef.current) {
      // Record move operation for history
      const changes: Array<{
        x: number;
        y: number;
        oldColor: [number, number, number, number];
        newColor: [number, number, number, number];
      }> = [];
      
      const layerWidth = activeLayer.width;
      const layerHeight = activeLayer.height;
      const currentData = activeLayer.data;
      
      // Compare current data with initial data to find changes
      for (let y = 0; y < layerHeight; y++) {
        for (let x = 0; x < layerWidth; x++) {
          const idx = (y * layerWidth + x) * 4;
          
          const oldColor: [number, number, number, number] = [
            initialLayerDataRef.current[idx],
            initialLayerDataRef.current[idx + 1],
            initialLayerDataRef.current[idx + 2],
            initialLayerDataRef.current[idx + 3]
          ];
          
          const newColor: [number, number, number, number] = [
            currentData[idx],
            currentData[idx + 1],
            currentData[idx + 2],
            currentData[idx + 3]
          ];
          
          // Only record actual changes
          if (oldColor[0] !== newColor[0] || oldColor[1] !== newColor[1] || 
              oldColor[2] !== newColor[2] || oldColor[3] !== newColor[3]) {
            changes.push({ x, y, oldColor, newColor });
          }
        }
      }
      
      // Create and push delta if there are changes
      if (changes.length > 0) {
        const delta: HistoryDelta = {
          type: 'pixel',
          layerId: activeLayer.id,
          changes,
          timestamp: Date.now()
        };
        
        pushToHistory(delta);
      }
    }
    
    setIsMoving(false);
    initialLayerDataRef.current = null;
  };

  // Pan Tool Logic
  const handlePanStart = (e: React.PointerEvent) => {
    if (activeTool !== 'pan' || !containerRef.current) return;
    
    e.preventDefault();
    setIsPanning(true);
    setPanStartPos({ x: e.clientX, y: e.clientY });
    // Store current scroll position
    containerRef.current.style.scrollBehavior = 'auto';
  };

  const handlePan = (e: React.PointerEvent) => {
    if (!isPanning || !containerRef.current) return;
    
    e.preventDefault();
    
    const dx = e.clientX - panStartPos.x;
    const dy = e.clientY - panStartPos.y;
    
    // Scroll the container to pan the view
    containerRef.current.scrollLeft -= dx;
    containerRef.current.scrollTop -= dy;
    
    setPanStartPos({ x: e.clientX, y: e.clientY });
  };

  const handlePanEnd = () => {
    if (containerRef.current) {
      containerRef.current.style.scrollBehavior = 'smooth';
    }
    setIsPanning(false);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!sourceImage) return;
    
    // Handle pan tool separately
    if (activeTool === 'pan') {
        handlePanStart(e);
        return;
    }
    
    // Handle move tool separately
    if (activeTool === 'move') {
        handleMoveStart(e);
        return;
    }
    
    e.preventDefault(); 
    pushToHistory(); // Save state before action
    setIsDrawing(true);
    performToolAction(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Handle pan tool separately
    if (activeTool === 'pan') {
        handlePan(e);
        return;
    }
    
    // Handle move tool separately
    if (activeTool === 'move') {
        handleMove(e);
        return;
    }
    
    if (isDrawing && activeTool !== 'pan' && activeTool !== 'eyedropper') {
        e.preventDefault();
        performToolAction(e);
    }
  };

  const handlePointerUp = () => {
    // Handle pan tool end
    if (isPanning) {
        handlePanEnd();
    }
    
    // Handle move tool end
    if (isMoving) {
        handleMoveEnd();
    }
    
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
        } else if (e.key === ' ') {
            e.preventDefault();
            if (activeTool !== 'pan') {
                previousToolRef.current = activeTool;
                setActiveTool('pan');
            }
        } else if (key === 'b') {
            setActiveTool('brush');
        } else if (key === 'v') {
            setActiveTool('move');
        } else if (key === 'e') {
            setActiveTool('eraser');
        } else if (key === 'g') {
            setActiveTool('bucket');
        } else if (key === 'p') {
            setActiveTool('pan');
        } else if (key === 'i') {
            setActiveTool('eyedropper');
        } else if (key === '[') {
            // Decrease brush size
            e.preventDefault();
            setBrushSize(prev => Math.max(1, prev - 1));
        } else if (key === ']') {
            // Increase brush size
            e.preventDefault();
            setBrushSize(prev => Math.min(10, prev + 1));
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
            if (activeTool === 'eyedropper') {
                setActiveTool(previousToolRef.current);
            }
        } else if (e.key === ' ') {
            if (activeTool === 'pan') {
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
  }, [activeTool, setActiveTool, brushSize, setBrushSize]);

  // Mouse Wheel Zoom
  useEffect(() => {
    const handleWheelZoom = (e: WheelEvent) => {
        e.preventDefault();
        const zoomFactor = 1.1; // Zoom multiplier
        const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
        const newZoom = Math.max(0.5, Math.min(16, zoom * delta));
        setZoom(newZoom);
    };

    const container = containerRef.current;
    if (container) {
        container.addEventListener('wheel', handleWheelZoom, { passive: false });
    }

    return () => {
        if (container) {
            container.removeEventListener('wheel', handleWheelZoom);
        }
    };
  }, [zoom, setZoom]);


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
                className="w-24 h-1 bg-[#333] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#00cccc] [&::-webkit-slider-thumb]:rotate-[0deg]"
            />
            <ZoomIn className="w-4 h-4 text-[#00cccc]" />
        </div>
        <span className="text-xs font-mono text-white w-10 text-right">
            {Math.round(zoom * 100)}%
        </span>
        <div className="w-px bg-[#333] h-6 mx-1"></div>
        <span className="text-xs font-mono text-[#ffb000] w-16 text-center">
            {generatedBaseData ? `${generatedBaseData.width}x${generatedBaseData.height}` : '0x0'}
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

      {/* Canvas Container */}
      <div 
        ref={containerRef}
        className={`flex-1 flex items-center justify-center overflow-auto p-0 ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'eyedropper' ? 'cursor-crosshair' : activeTool === 'bucket' ? 'cursor-copy' : ''}`}
        style={{ 
            backgroundColor: '#050505',
            // Create custom cursor with size relative to brush size and canvas zoom, similar to Aseprite
            cursor: activeTool === 'brush' ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${Math.min(brushSize * zoom * 2, 32)}' height='${Math.min(brushSize * zoom * 2, 32)}' viewBox='0 0 ${Math.min(brushSize * zoom * 2, 32)} ${Math.min(brushSize * zoom * 2, 32)}'%3E%3Crect width='${brushSize * zoom}' height='${brushSize * zoom}' fill='${brushColor.replace('#', '%23')}' x='${Math.min(brushSize * zoom * 2, 32) / 2 - brushSize * zoom / 2}' y='${Math.min(brushSize * zoom * 2, 32) / 2 - brushSize * zoom / 2}'/%3E%3C/svg%3E") ${Math.min(brushSize * zoom * 2, 32) / 2} ${Math.min(brushSize * zoom * 2, 32) / 2}, auto` : 
                     activeTool === 'eraser' ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${Math.min(brushSize * zoom * 2, 32)}' height='${Math.min(brushSize * zoom * 2, 32)}' viewBox='0 0 ${Math.min(brushSize * zoom * 2, 32)} ${Math.min(brushSize * zoom * 2, 32)}'%3E%3Crect width='${brushSize * zoom}' height='${brushSize * zoom}' fill='white' x='${Math.min(brushSize * zoom * 2, 32) / 2 - brushSize * zoom / 2}' y='${Math.min(brushSize * zoom * 2, 32) / 2 - brushSize * zoom / 2}'/%3E%3C/svg%3E") ${Math.min(brushSize * zoom * 2, 32) / 2} ${Math.min(brushSize * zoom * 2, 32) / 2}, auto` : 'auto'
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
            className="shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-[#222] bg-black"
          >
            <canvas 
                ref={canvasRef} 
                className="pixelated-canvas block touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            />
          </div>
        )}
      </div>
    </div>
  );
};