"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * 向渲染进程暴露安全的视频处理 API
 */
electron_1.contextBridge.exposeInMainWorld('videoAPI', {
    /**
     * 使用主进程通过 ffmpeg 处理视频，生成像素序列帧
     */
    processVideo(options) {
        return electron_1.ipcRenderer.invoke('video:process', options);
    },
    /**
     * 预览视频的单个帧
     */
    previewVideoFrame(options) {
        return electron_1.ipcRenderer.invoke('video:previewFrame', options);
    },
    /**
     * 获取视频信息
     */
    getVideoInfo(inputPath) {
        return electron_1.ipcRenderer.invoke('video:getInfo', inputPath);
    },
    /**
     * 导出视频序列帧
     */
    exportVideoSequence(options) {
        return electron_1.ipcRenderer.invoke('video:exportSequence', options);
    },
});
