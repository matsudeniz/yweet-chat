import { GoogleGenAI } from '@google/genai';
import type { Route } from './+types/api.ai';

const GEMINI_API_KEY = 'AIzaSyCwrbqdDCUikmaR9DCGruf66eRBZTcBy_A';

export async function action({ request }: Route.ActionArgs) {
  try {
    const { message, conversationHistory } = await request.json();

    const ai = new GoogleGenAI({ vertexai: false, apiKey: GEMINI_API_KEY });
    
    // Build conversation context
    let prompt = 'You are a helpful AI assistant in a collaborative chat room. Keep responses concise and friendly.\n\n';
    
    if (conversationHistory && conversationHistory.length > 0) {
      prompt += 'Recent conversation:\n';
      conversationHistory.forEach((msg: any) => {
        prompt += `${msg.sender}: ${msg.text}\n`;
      });
      prompt += '\n';
    }
    
    prompt += `User message: ${message}\n\nYour response:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });

    return Response.json({ 
      success: true, 
      response: response.text 
    });
  } catch (error) {
    console.error('AI API Error:', error);
    return Response.json({ 
      success: false, 
      error: 'Failed to generate AI response' 
    }, { status: 500 });
  }
}
