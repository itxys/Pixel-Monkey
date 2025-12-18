// 预加载脚本，用于在渲染进程和主进程之间通信
// 可以安全地暴露API给渲染进程

// 示例：暴露一个简单的API给渲染进程
window.addEventListener('DOMContentLoaded', () => {
  // 可以在这里添加一些预加载逻辑
  console.log('Preload script loaded');
});
