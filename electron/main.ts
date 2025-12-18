import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { VideoProcessOptions, VideoProcessResult } from '../types';

/**
 * 创建主窗口并加载前端页面
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: app.isPackaged 
      ? path.join(__dirname, '../build/icons/icon.ico') 
      : path.join(process.cwd(), 'build/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../index.html'));
  } else {
    win.loadURL('http://localhost:3000');
  }
}

/**
 * 确保目录存在，不存在时递归创建
 */
function ensureDirectory(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 使用 ffmpeg 将视频处理为像素序列帧
 */
function processVideoWithFfmpeg(options: VideoProcessOptions): Promise<VideoProcessResult> {
  const resolvedFfmpegPath = (ffmpegPath || '').toString();

  if (!resolvedFfmpegPath) {
    return Promise.resolve({
      success: false,
      outputDir: '',
      frameCount: 0,
      error: '未找到 ffmpeg 可执行文件，请确认依赖是否安装正确。',
    });
  }

  const baseOutputDir =
    options.outputDir ||
    path.join(app.getPath('videos'), 'PixelMonkey-Frames', Date.now().toString());

  ensureDirectory(baseOutputDir);

  const outputPattern = path.join(baseOutputDir, 'frame_%05d.png');

  const fps = Math.max(1, Math.floor(options.fps || 12));
  const width = Math.max(1, Math.floor(options.width || 32));
  const height = Math.max(1, Math.floor(options.height || 32));

  const args = [
    '-i',
    options.inputPath,
    '-vf',
    `fps=${fps},scale=${width}:${height}:flags=neighbor`,
    '-y',
    outputPattern,
  ];

  return new Promise<VideoProcessResult>((resolve) => {
    const child = spawn(resolvedFfmpegPath, args, {
      windowsHide: true,
    });

    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        outputDir: baseOutputDir,
        frameCount: 0,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          outputDir: baseOutputDir,
          frameCount: 0,
          error: stderr || `ffmpeg 退出码：${code}`,
        });
        return;
      }

      let frameCount = 0;
      try {
        const files = fs.readdirSync(baseOutputDir);
        frameCount = files.filter((f) => f.startsWith('frame_') && f.endsWith('.png')).length;
      } catch {
        frameCount = 0;
      }

      resolve({
        success: true,
        outputDir: baseOutputDir,
        frameCount,
      });
    });
  });
}

// 应用就绪时创建窗口并注册 IPC 处理
app.whenReady().then(() => {
  createWindow();

  ipcMain.handle(
    'video:process',
    async (_event, options: VideoProcessOptions): Promise<VideoProcessResult> => {
      return processVideoWithFfmpeg(options);
    },
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 关闭所有窗口时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
