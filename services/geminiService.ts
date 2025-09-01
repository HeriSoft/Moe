import { client } from '@gradio/client';
import type { Message, Attachment, UserProfile } from '../types';

/**
 * A robust error handler for fetch requests to the proxy.
 * It tries to parse the error response as JSON, but falls back to text 
 * if that fails. This prevents crashes when the server (e.g., Vercel)
 * returns a non-JSON error like "413 Payload Too Large".
 * @param response The raw Response object from a failed fetch call.
 * @throws An Error with a detailed message from the response body.
 */
async function handleProxyError(response: Response): Promise<never> {
    let errorDetails = `Proxy request failed with status ${response.status}`;
    try {
        const errorData = await response.json();
        errorDetails = errorData.details || errorData.error || JSON.stringify(errorData);
    } catch (e) {
        try {
            errorDetails = await response.text();
        } catch (textError) {
            // Fallback, the initial error message is used.
        }
    }
    throw new Error(errorDetails);
}


export async function logUserLogin(user: UserProfile) {
    try {
        await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'logLogin',
                payload: { user }
            })
        });
    } catch (error) {
        console.error("Failed to log user login:", error);
    }
}

// We only need one service function now, which calls the proxy's streaming endpoint.
// The proxy will handle all the logic for different models and functionalities.
export async function streamModelResponse(
    model: string,
    history: Message[],
    newMessage: string,
    attachments: Attachment[] | null,
    isWebSearchEnabled: boolean,
    isDeepThinkEnabled: boolean,
    systemInstruction: string | undefined,
    user: UserProfile | undefined,
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
                systemInstruction,
                user, // Pass user profile for logging
            }
        })
    });

    if (!response.ok) {
        await handleProxyError(response);
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
export async function generateImage(prompt: string, settings: any, user: UserProfile | undefined): Promise<Attachment[]> {
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
              user, // Pass user profile for logging
          }
      })
    });
    
    if (!response.ok) {
        await handleProxyError(response);
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
export async function editImage(prompt: string, images: Attachment[], settings: any, user: UserProfile | undefined): Promise<{ text: string, attachments: Attachment[] }> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'editImage',
            payload: {
                model: settings.model,
                prompt,
                images,
                config: {}, // Pass any other settings if needed
                user, // Pass user profile for logging
            }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    return await response.json();
}


// New function for translating input text
export async function getTranslation(text: string, targetLanguage: string, user: UserProfile | undefined): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'getTranslation',
            payload: { text, targetLanguage, user }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    const data = await response.json();
    return data.translatedText;
}


export async function generateSpeech(text: string, user: UserProfile | undefined): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateSpeech',
            payload: { text, user }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    const data = await response.json();
    return data.audioContent; // This will be the base64 string
}

// New function for face swapping using a Gradio API
export async function swapFace(targetImage: Attachment, sourceImage: Attachment, user: UserProfile | undefined): Promise<Attachment> {
    console.log("Calling local proxy for face swap...");

    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'swapFace',
            payload: { 
                targetImage: targetImage, 
                sourceImage: sourceImage,
                user, // Pass user profile for logging
            }
        })
    });

    console.log("Response status from proxy:", response.status);

    if (!response.ok) {
        // Use the centralized error handler and wrap its error in a more specific one for this context.
        try {
            await handleProxyError(response);
        } catch (e: any) {
            console.error("Proxy API error details for face swap:", e.message);
            throw new Error(`Face swap failed via proxy: ${e.message}`);
        }
    }

    try {
        const result = await response.json();
        console.log("Proxy API response for swapFace:", JSON.stringify(result, null, 2));

        if (!result || !result.data || !result.mimeType) {
            console.error("Invalid response from proxy for face swap. Missing image data.", result);
            throw new Error("Invalid response from proxy for face swap. Missing image data.");
        }

        return result;
    } catch (e) {
        console.error("Failed to parse successful proxy response as JSON", e);
        throw new Error("Proxy returned a successful status, but the response body was not valid JSON.");
    }
}