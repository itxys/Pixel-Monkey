import { contextBridge, ipcRenderer } from 'electron';
import type { VideoProcessOptions, VideoProcessResult, VideoPreviewOptions, VideoPreviewResult } from '../types';

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
  
  /**
   * 预览视频的单个帧
   */
  previewVideoFrame(options: VideoPreviewOptions): Promise<VideoPreviewResult> {
    return ipcRenderer.invoke('video:previewFrame', options);
  },
  
  /**
   * 获取视频信息
   */
  getVideoInfo(inputPath: string): Promise<{ totalFrames: number; fps: number; duration: number }> {
    return ipcRenderer.invoke('video:getInfo', inputPath);
  },
  
  /**
   * 导出视频序列帧
   */
  exportVideoSequence(options: VideoProcessOptions): Promise<VideoProcessResult> {
    return ipcRenderer.invoke('video:exportSequence', options);
  },
});
