

import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult, Language } from "../types";

const processEnvApiKey = process.env.API_KEY;

export const analyzePixelArt = async (base64Image: string, language: Language): Promise<AIAnalysisResult> => {
  if (!processEnvApiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: processEnvApiKey });

  const langInstruction = language === 'zh' 
    ? "Respond in Chinese (Simplified)." 
    : "Respond in English.";

  const prompt = `
    Analyze this pixel art image. ${langInstruction}
    1. Give it a retro video game style title (NES/SNES era).
    2. Write a short, creative description (max 2 sentences) describing the scene as if it were a location or character in an 8-bit or 16-bit RPG game.
    3. Identify the mood (e.g., Cyberpunk, Cozy, Eerie, Heroic).
    
    Return the result in JSON.
  `;

  const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            mood: { type: Type.STRING }
          },
          required: ["title", "description", "mood"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIAnalysisResult;
    }
    throw new Error("No response text generated");

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const editPixelArt = async (base64Image: string, prompt: string): Promise<string> => {
  if (!processEnvApiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: processEnvApiKey });
  const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  const optimizedPrompt = `
    ${prompt}. 
    IMPORTANT STYLE INSTRUCTIONS: 
    - Use a "cel-shaded" or "flat color" art style.
    - Ensure high contrast and HARD EDGES.
    - DO NOT use anti-aliasing, blurs, gradients, or realistic lighting.
    - The output should look like vector art or a high-res sprite base.
    - Output a high quality image maintaining the composition.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/png',
            },
          },
          {
            text: optimizedPrompt,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Gemini Edit Failed:", error);
    throw error;
  }
};

export const generateAnimationFrame = async (base64Image: string, prompt: string): Promise<string> => {
    if (!processEnvApiKey) {
      throw new Error("API Key is missing");
    }
  
    const ai = new GoogleGenAI({ apiKey: processEnvApiKey });
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
  
    const animationPrompt = `
      Create the NEXT frame of an animation based on this image.
      Action: ${prompt}.
      Style: Maintain exact same pixel art style, palette, and resolution.
      Only change the parts required for the movement.
      Ensure consistent character details.
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            {
              text: animationPrompt,
            },
          ],
        },
      });
  
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No frame generated");
    } catch (error) {
      console.error("Gemini Animation Failed:", error);
      throw error;
    }
  };