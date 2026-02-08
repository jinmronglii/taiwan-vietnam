import { GoogleGenAI, Type } from "@google/genai";

export type SummaryType = 'concise' | 'detailed' | 'keypoints';

/**
 * Helper to sleep for a given duration
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wrapper for Gemini API calls with robust exponential backoff retry logic.
 * Designed to handle 429 (Resource Exhausted) errors common in free tier usage.
 */
async function callGeminiWithRetry(
  apiCall: () => Promise<any>,
  maxRetries: number = 5,
  initialDelay: number = 5000
) {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      
      // Check for rate limit or quota exceeded errors
      const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 ||
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED") ||
        error?.message?.includes("quota") ||
        JSON.stringify(error).includes("429") ||
        JSON.stringify(error).includes("RESOURCE_EXHAUSTED") ||
        JSON.stringify(error).includes("quota");

      if (isRateLimit && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Gemini API Quota reached (429). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      // For non-quota errors or last retry, throw immediately
      throw error;
    }
  }
  throw lastError;
}

export async function getAiFeedback(
  question: string,
  maleAnswer: string,
  femaleAnswer: string,
  targetLangName: string
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key not found. Please set VITE_GEMINI_API_KEY in .env.local");
    return "API Key 未設置。請在 .env.local 中設置 VITE_GEMINI_API_KEY / API Key chưa được cấu hình. Vui lòng đặt VITE_GEMINI_API_KEY trong .env.local";
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";
  
  const systemInstruction = `You are an expert consultant for Taiwan-Vietnam marriage interviews. 
  Your goal is to analyze the answers from both the groom and the bride, point out any inconsistencies, and provide professional advice to make their answers more persuasive, consistent, and authentic. 
  IMPORTANT: You must provide your response entirely in ${targetLangName}.`;

  const prompt = `
    Question: ${question}
    Groom's Answer: ${maleAnswer}
    Bride's Answer: ${femaleAnswer}
    
    Please provide feedback and suggestions in ${targetLangName}.
  `;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    }));
    return response.text;
  } catch (error) {
    console.error("AI Error:", error);
    return `AI 暫時無法回應 (已達流量限制或出現錯誤)。請稍候 1 分鐘後再試。/ AI tạm thời không phản hồi (đã đạt giới hạn lưu lượng hoặc gặp lỗi). Vui lòng thử lại sau 1 phút.`;
  }
}

export async function translateText(
  text: string,
  targetLang: 'zh' | 'vi'
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";
  
  const targetLabel = targetLang === 'zh' ? 'Traditional Chinese' : 'Vietnamese';
  const systemInstruction = `You are a professional translator specializing in Taiwan and Vietnam cultural context. 
  Translate the given text into ${targetLabel}. 
  Maintain the original meaning and emotional tone. 
  Only return the translated text. Do not add any explanation or markers.`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.3,
      }
    }));
    return response.text;
  } catch (error) {
    console.error("Translation Error:", error);
    return null;
  }
}

export async function getAiSummary(
  answer: string,
  targetLangName: string,
  type: SummaryType = 'concise'
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return "API Key 未設置。/ API Key chưa được cấu hình.";
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";
  
  let instruction = '';
  if (type === 'concise') {
    instruction = `You are a concise summarization tool. Summarize the following content in under 30 words. You MUST respond entirely in ${targetLangName}.`;
  } else if (type === 'detailed') {
    instruction = `You are a detailed summarization tool. Summarize the following content in about 100 words with details. You MUST respond entirely in ${targetLangName}.`;
  } else if (type === 'keypoints') {
    instruction = `You are a key points extraction tool. List the most important 3 to 5 key points. You MUST respond entirely in ${targetLangName}.`;
  }

  const prompt = `Content to summarize: ${answer}`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: instruction,
        temperature: 0.5,
      }
    }));
    return response.text;
  } catch (error) {
    console.error("AI Summary Error:", error);
    return null;
  }
}

export async function checkAnswerConsistency(
  question: string,
  maleAnswer: string,
  femaleAnswer: string
) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return { consistent: true };
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";
  
  const systemInstruction = `You are a fact-checking assistant for marriage interviews. 
  Compare the Groom's and Bride's answers to the given question. 
  Determine if they are semantically contradictory (e.g., different dates, different locations, different people).
  Ignore minor phrasing differences. Focus only on factual conflicts.
  Respond only in JSON format.`;

  const prompt = `
    Question: ${question}
    Groom's Answer: ${maleAnswer}
    Bride's Answer: ${femaleAnswer}
    
    Check for factual contradictions.
  `;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            consistent: { type: Type.BOOLEAN },
            reason: { type: Type.STRING, description: "A short reason if contradictory" }
          },
          required: ["consistent"]
        }
      }
    }));
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Consistency Check Error:", error);
    return { consistent: true }; 
  }
}