import type { Message, Attachment } from '../types';

// We only need one service function now, which calls the proxy's streaming endpoint.
// The proxy will handle all the logic for different models and functionalities.
export async function streamModelResponse(
    model: string,
    history: Message[],
    newMessage: string,
    attachments: Attachment[] | null,
    isWebSearchEnabled: boolean,
    isDeepThinkEnabled: boolean
) {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateContentStream',
            payload: {
                model,
                history,
                newMessage,
                attachments,
                isWebSearchEnabled,
                isDeepThinkEnabled,
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `[${response.status}] Proxy request failed`);
    }

    if (!response.body) {
        throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return (async function*() {
        while(true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr) {
                         try {
                            yield JSON.parse(jsonStr);
                         } catch (e) {
                            console.error("Failed to parse stream chunk:", jsonStr);
                         }
                    }
                }
            }
        }
    })();
}


// This specific Gemini/Imagen function is still needed for the /imagine command.
export async function generateImage(prompt: string): Promise<Attachment> {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          action: 'generateImages',
          payload: {
              model: 'imagen-4.0-generate-001',
              prompt: prompt,
              config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
              },
          }
      })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Proxy request failed');
    }

    const data = await response.json();

    if (data.generatedImages && data.generatedImages.length > 0) {
        return {
            data: data.generatedImages[0].image.imageBytes,
            mimeType: 'image/png',
            fileName: `${prompt.substring(0, 20)}.png`
        };
    } else {
        throw new Error("Image generation failed.");
    }
}

// New function for translating input text
export async function getTranslation(text: string, targetLanguage: string): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'getTranslation',
            payload: { text, targetLanguage }
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Translation request failed');
    }
    const data = await response.json();
    return data.translatedText;
}


export async function generateSpeech(text: string): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateSpeech',
            payload: { text }
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Speech generation request failed');
    }
    const data = await response.json();
    return data.audioContent; // This will be the base64 string
}