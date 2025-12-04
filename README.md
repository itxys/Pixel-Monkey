# Pixel Monkey // Retro Art Workstation

**Pixel Monkey** is a professional-grade browser-based tool designed to convert high-resolution images into authentic, crisp pixel art. Unlike standard downscaling tools that produce blurry edges, Pixel Monkey uses advanced quantization algorithms (Dominant Color Sampling & K-Means) to ensure razor-sharp, NES/SNES-style graphics.

It doubles as a full-featured pixel art editor with layer support, animation capabilities, and AI-powered tools powered by Google Gemini.

## 🌟 Key Features

### 🎨 True Pixelation Engine
*   **Crisp Edges**: Custom algorithm eliminates anti-aliasing artifacts found in standard image resizing.
*   **Smart Palette**: Automatically extracts dominant colors and snaps pixels to a limited palette (e.g., 16 colors, 32 colors).
*   **Dithering**: Optional Bayer Matrix dithering for retro shading effects.
*   **Auto-Outline**: Algorithmic stroke generation for sprite boundaries.

### 🛠️ Professional Editing Tools
*   **Tools**: Pencil (B), Eraser (E), Paint Bucket (G), Eyedropper (Alt), Pan.
*   **Advanced Color Picker**: HSV-based selector with custom palette management.
*   **Layer System**: Full support for multiple layers per frame with visibility and opacity toggles.

### 🎬 Animation Studio
*   **Timeline**: Frame-based animation workflow.
*   **Onion Skinning**: See previous frames to guide animation.
*   **Playback**: Adjustable FPS control.

### 🤖 AI Integration (Google Gemini)
*   **AI Analysis**: Generates retro RPG descriptions and mood analysis for your art.
*   **AI Edit**: Use text prompts (e.g., "Make it cyberpunk", "Remove background") to transform sprites.
*   **AI Inbetweening**: Generate the next frame of an animation using AI context awareness.

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **B** | Select Pencil Tool |
| **E** | Select Eraser Tool |
| **G** | Select Paint Bucket Tool |
| **Hold Alt** | Temporary Eyedropper (Release to switch back) |
| **Ctrl + Z** | Undo |
| **Ctrl + Y** | Redo |
| **Space** | Pan (Drag canvas) |

## 🚀 Technology Stack

*   **Frontend**: React 19, TypeScript
*   **Styling**: Tailwind CSS (Custom "Cassette Futurism" aesthetic)
*   **AI**: Google GenAI SDK (`gemini-2.5-flash`, `gemini-2.5-flash-image`)
*   **Icons**: Lucide React
*   **Fonts**: 'Press Start 2P' & 'VT323' (Google Fonts)

## 📦 Getting Started

1.  **Clone the repository**.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Set up Environment**:
    Ensure `process.env.API_KEY` is available with a valid Google Gemini API Key.
4.  **Run the app**:
    ```bash
    npm start
    ```

---

*System Status: ONLINE*