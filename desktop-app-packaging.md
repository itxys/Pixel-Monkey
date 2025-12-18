# 像素艺术编辑工具桌面应用打包方案分析

## 项目现状

当前项目是一个使用Vite+React+TypeScript开发的像素艺术编辑工具，项目结构如下：
```
- components/
- services/
- App.tsx
- index.html
- package.json
- tsconfig.json
- vite.config.ts
```

## 方案比较：Electron vs Tauri

### 1. Electron

#### 优点
- **成熟稳定**：Electron已经存在多年，拥有庞大的社区和丰富的文档
- **开发门槛低**：完全使用JavaScript/TypeScript开发，不需要学习新语言
- **生态丰富**：拥有大量的第三方库和插件
- **跨平台支持**：支持Windows、macOS和Linux
- **Node.js集成**：可以直接调用Node.js API和系统功能

#### 缺点
- **包体积大**：通常生成的安装包大小在50-100MB之间
- **内存占用高**：每个Electron应用都包含完整的Chromium和Node.js运行时
- **启动速度慢**：需要加载完整的浏览器引擎
- **安全性**：基于Chromium，存在潜在的安全漏洞

### 2. Tauri

#### 优点
- **包体积小**：生成的安装包通常只有几MB
- **内存占用低**：使用系统原生WebView，不需要自带浏览器引擎
- **启动速度快**：直接使用系统WebView，加载速度快
- **安全性高**：核心使用Rust编写，具有内存安全保证
- **性能优秀**：Rust核心提供高效的系统调用

#### 缺点
- **学习成本高**：需要安装Rust环境，部分功能需要编写Rust代码
- **生态相对薄弱**：第三方库和插件不如Electron丰富
- **WebView差异**：不同平台的WebView可能存在兼容性问题
- **开发环境配置复杂**：需要安装多个依赖

### 3. 综合对比表

| 特性 | Electron | Tauri |
|------|----------|-------|
| 包体积 | 大（50-100MB） | 小（2-10MB） |
| 内存占用 | 高 | 低 |
| 启动速度 | 慢 | 快 |
| 开发语言 | JavaScript/TypeScript | JavaScript/TypeScript + Rust |
| 学习成本 | 低 | 高 |
| 社区活跃度 | 高 | 中 |
| 生态丰富度 | 高 | 中 |
| 安全性 | 中 | 高 |
| 跨平台支持 | 优 | 良 |

## 实现步骤

### 方案一：使用Electron

#### 步骤1：安装Electron相关依赖

```bash
npm install --save-dev electron electron-builder vite-plugin-electron vite-plugin-electron-renderer
```

#### 步骤2：配置Vite集成Electron

修改 `vite.config.ts` 文件：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: {
          preload: 'electron/preload.ts',
        },
      },
    }),
    electronRenderer(),
  ],
})
```

#### 步骤3：创建Electron主进程文件

创建 `electron/main.ts` 文件：

```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow() {
  // 创建浏览器窗口
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 加载Vite开发服务器或打包后的HTML文件
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../index.html'))
  } else {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  }
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 关闭所有窗口时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

创建 `electron/preload.ts` 文件：

```typescript
// 预加载脚本，用于在渲染进程和主进程之间通信
window.addEventListener('DOMContentLoaded', () => {
  // 可以在这里添加一些预加载逻辑
})
```

#### 步骤4：修改package.json配置

```json
{
  "name": "pixel-monkey",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "vite",
    "electron:build": "tsc && vite build && electron-builder"
  },
  "build": {
    "appId": "com.pixelmonkey.app",
    "productName": "Pixel Monkey",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "dist/**/*",
      "dist-electron/**/*"
    ],
    "win": {
      "target": ["nsis", "zip"]
    },
    "mac": {
      "target": ["dmg", "zip"]
    },
    "linux": {
      "target": ["deb", "rpm", "AppImage"]
    }
  },
  // 其他依赖...
}
```

#### 步骤5：打包应用

```bash
npm run electron:build
```

### 方案二：使用Tauri

#### 步骤1：安装Rust环境

- **Windows**：下载并运行 [rustup-init.exe](https://www.rust-lang.org/tools/install)
- **macOS/Linux**：运行 `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

#### 步骤2：安装Tauri CLI

```bash
npm install --save-dev @tauri-apps/cli
```

#### 步骤3：初始化Tauri配置

```bash
npx tauri init
```

按照提示填写配置信息：
- 应用名称：Pixel Monkey
- 应用窗口标题：Pixel Monkey
- 资源目录：dist
- 入口文件：index.html

#### 步骤4：修改vite.config.ts配置

确保Vite配置中 `base` 选项为 `./`，以便Tauri能够正确加载资源：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
})
```

#### 步骤5：修改tauri.conf.json配置

```json
{
  "$schema": "https://schema.tauri.app/config/2.0",
  "productName": "Pixel Monkey",
  "version": "0.0.0",
  "identifier": "com.pixelmonkey.app",
  "platforms": {
    "windows": {},
    "macos": {},
    "linux": {}
  },
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "distDir": "../dist",
    "withGlobalTauri": true
  },
  "app": {
    "windows": [
      {
        "title": "Pixel Monkey",
        "width": 800,
        "height": 600
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

#### 步骤6：修改package.json脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  // 其他配置...
}
```

#### 步骤7：打包应用

```bash
npm run tauri:build
```

## 方案选择建议

### 选择Electron的情况
- 对开发速度要求高
- 团队不熟悉Rust语言
- 需要使用大量Node.js API
- 依赖丰富的第三方Electron插件

### 选择Tauri的情况
- 对应用性能要求高
- 希望生成更小的安装包
- 注重应用的安全性
- 愿意学习Rust语言
- 应用功能相对简单，不需要复杂的系统调用

## 结论

对于像素艺术编辑工具这类轻量级应用，**Tauri** 是更优的选择，因为它具有更小的包体积、更快的启动速度和更低的内存占用，能够提供更好的用户体验。虽然学习曲线较陡，但对于长期发展来说是值得的。

如果团队时间紧张或不熟悉Rust，**Electron** 也是一个可行的选择，它的成熟生态和低学习成本可以让团队快速上手。

最终的选择应该基于团队的技术栈、时间预算和应用的具体需求来决定。