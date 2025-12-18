import { contextBridge, ipcRenderer } from 'electron';
import type { VideoProcessOptions, VideoProcessResult } from '../types';

/**
 * 向渲染进程暴露安全的视频处理 API
 */
contextBridge.exposeInMainWorld('videoAPI', {
  /**
   * 使用主进程通过 ffmpeg 处理视频，生成像素序列帧
   */
  processVideo(options: VideoProcessOptions): Promise<VideoProcessResult> {
    return ipcRenderer.invoke('video:process', options);
  },
});
