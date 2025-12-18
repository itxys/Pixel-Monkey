const { app, BrowserWindow } = require('electron');
const path = require('path');

// 创建浏览器窗口的函数
function createWindow() {
  // 创建浏览器窗口
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载Vite开发服务器
  win.loadURL('http://localhost:3000');
  win.webContents.openDevTools();
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS上，当点击dock图标且没有其他窗口打开时，重新创建一个窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 关闭所有窗口时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
