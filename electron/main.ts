import { app, BrowserWindow, ipcMain, screen } from 'electron';
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

  // 如果有文件数据，先写入临时文件
  const processVideoFile = async (videoPath: string): Promise<VideoProcessResult> => {
    const args = [
      '-i',
      videoPath,
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
  };

  // 如果有文件数据，从文件数据创建临时文件
  if (options.fileData && options.fileData.length > 0) {
    const tempVideoPath = path.join(baseOutputDir, options.inputPath);
    try {
      fs.writeFileSync(tempVideoPath, new Uint8Array(options.fileData));
      return processVideoFile(tempVideoPath);
    } catch (error) {
      return Promise.resolve({
        success: false,
        outputDir: baseOutputDir,
        frameCount: 0,
        error: `无法写入临时视频文件：${error instanceof Error ? error.message : '未知错误'}`,
      });
    }
  } else {
    // 直接使用提供的文件路径
    return processVideoFile(options.inputPath);
  }
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

  // 预览单个视频帧
  ipcMain.handle(
    'video:previewFrame',
    async (_event, options: { inputPath: string; frameIndex: number; width: number; height: number }): Promise<{ success: boolean; frameData: string; totalFrames: number; error?: string }> => {
      const resolvedFfmpegPath = (ffmpegPath || '').toString();
      
      if (!resolvedFfmpegPath) {
        return {
          success: false,
          frameData: '',
          totalFrames: 0,
          error: '未找到 ffmpeg 可执行文件，请确认依赖是否安装正确。',
        };
      }

      try {
        // 获取视频信息
        const videoInfo = await getVideoInfo(options.inputPath);
        
        // 临时文件路径
        const tempOutput = path.join(os.tmpdir(), `preview_frame_${Date.now()}.png`);
        
        // 使用 ffmpeg 提取指定帧
        const args = [
          '-i', options.inputPath,
          '-vf', `select=eq(n\,${options.frameIndex}),scale=${options.width}:${options.height}:flags=neighbor`,
          '-vframes', '1',
          '-y',
          tempOutput
        ];

        await new Promise<void>((resolve, reject) => {
          const child = spawn(resolvedFfmpegPath, args, { windowsHide: true });
          let stderr = '';
          
          child.stderr.on('data', (data) => stderr += data.toString());
          
          child.on('error', (err) => reject(new Error(`FFmpeg 执行错误: ${err.message}`)));
          
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`FFmpeg 退出码: ${code}, 错误信息: ${stderr}`));
            } else {
              resolve();
            }
          });
        });

        // 读取临时文件并转换为 base64
        const frameBuffer = fs.readFileSync(tempOutput);
        const frameData = `data:image/png;base64,${frameBuffer.toString('base64')}`;
        
        // 删除临时文件
        fs.unlinkSync(tempOutput);
        
        return {
          success: true,
          frameData,
          totalFrames: videoInfo.totalFrames
        };
      } catch (error) {
        return {
          success: false,
          frameData: '',
          totalFrames: 0,
          error: `预览帧失败: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  );

  // 获取视频信息
  ipcMain.handle(
    'video:getInfo',
    async (_event, inputPath: string): Promise<{ totalFrames: number; fps: number; duration: number }> => {
      return getVideoInfo(inputPath);
    }
  );

  // 辅助函数：获取视频信息
  async function getVideoInfo(inputPath: string): Promise<{ totalFrames: number; fps: number; duration: number }> {
    const resolvedFfmpegPath = (ffmpegPath || '').toString();
    
    if (!resolvedFfmpegPath) {
      throw new Error('未找到 ffmpeg 可执行文件');
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-count_frames',
        '-show_entries', 'stream=nb_read_frames,r_frame_rate,duration',
        '-of', 'csv=p=0',
        inputPath
      ];

      const child = spawn(resolvedFfmpegPath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => stdout += data.toString());
      child.stderr.on('data', (data) => stderr += data.toString());

      child.on('error', (err) => reject(new Error(`FFmpeg 执行错误: ${err.message}`)));

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg 退出码: ${code}, 错误信息: ${stderr}`));
          return;
        }

        const [totalFramesStr, fpsStr, durationStr] = stdout.trim().split(',');
        
        let totalFrames = parseInt(totalFramesStr || '0');
        let fps = parseFloat(fpsStr || '0');
        let duration = parseFloat(durationStr || '0');

        // 处理分数形式的 FPS (如 24/1)
        if (fpsStr?.includes('/')) {
          const [numerator, denominator] = fpsStr.split('/').map(Number);
          if (denominator) fps = numerator / denominator;
        }

        resolve({ totalFrames, fps, duration });
      });
    });
  };

  // 导出视频序列帧
  ipcMain.handle(
    'video:exportSequence',
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
