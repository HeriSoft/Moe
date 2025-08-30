import { client } from '@gradio/client';
import type { Message, Attachment } from '../types';

// We only need one service function now, which calls the proxy's streaming endpoint.
// The proxy will handle all the logic for different models and functionalities.
export async function streamModelResponse(
    model: string,
    history: Message[],
    newMessage: string,
    attachments: Attachment[] | null,
    isWebSearchEnabled: boolean,
    isDeepThinkEnabled: boolean,
    systemInstruction?: string, // Added for personas
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
                systemInstruction, // Pass it to the proxy,
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


// Updated to handle different models and settings
export async function generateImage(prompt: string, settings: any): Promise<Attachment[]> {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          action: 'generateImages',
          payload: {
              model: settings.model,
              prompt: prompt,
              config: {
                numberOfImages: settings.numImages || 1,
                outputMimeType: 'image/png',
                aspectRatio: settings.aspectRatio || '1:1',
                quality: settings.quality,
                style: settings.style,
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
        return data.generatedImages.map((img: any) => ({
             data: img.image.imageBytes,
             mimeType: 'image/png',
             fileName: `${prompt.substring(0, 20)}.png`
        }));
    } else {
        throw new Error("Image generation failed.");
    }
}

// New function for image editing
export async function editImage(prompt: string, image: Attachment, settings: any): Promise<{ text: string, attachments: Attachment[] }> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'editImage',
            payload: {
                model: settings.model,
                prompt,
                image,
                config: {}, // Pass any other settings if needed
            }
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Image editing request failed');
    }
    return await response.json();
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

// New function for face swapping using a Gradio API
export async function swapFace(targetImage: Attachment, sourceImage: Attachment): Promise<Attachment> {
    console.log("Calling local proxy for face swap...");

    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'swapFace',
            payload: { 
                targetImage: targetImage, 
                sourceImage: sourceImage 
            }
        })
    });

    console.log("Response status from proxy:", response.status);

    // *** THAY ĐỔI QUAN TRỌNG NHẤT LÀ Ở ĐÂY ***

    // Kiểm tra xem response có thành công không
    if (!response.ok) {
        // Nếu thất bại, đọc body một lần để lấy chi tiết lỗi
        let errorDetails = `Proxy API request failed with status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorDetails = errorData.details || errorData.error || JSON.stringify(errorData) || errorDetails;
        } catch (e) {
            // Nếu không phải JSON, thử đọc dưới dạng text.
            // Cần một try-catch riêng vì body có thể đã được đọc một phần
            try {
                 errorDetails = await response.text();
            } catch (textError) {
                console.error("Could not read error response body", textError);
            }
        }
        console.error("Proxy API error details:", errorDetails);
        // Ném lỗi và dừng thực thi
        throw new Error(`Face swap failed via proxy: ${errorDetails}`);
    }

    // Nếu thành công (response.ok is true), đọc body một lần để lấy kết quả
    try {
        const result = await response.json();
        console.log("Proxy API response for swapFace:", JSON.stringify(result, null, 2));

        if (!result || !result.data || !result.mimeType) {
            console.error("Invalid response from proxy for face swap. Missing image data.", result);
            throw new Error("Invalid response from proxy for face swap. Missing image data.");
        }

        return result; // Trả về kết quả
    } catch (e) {
        console.error("Failed to parse successful proxy response as JSON", e);
        throw new Error("Proxy returned a successful status, but the response body was not valid JSON.");
    }
    // *** KẾT THÚC THAY ĐỔI ***
}
