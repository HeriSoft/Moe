import { client } from '@gradio/client';
import type { Message, Attachment, UserProfile, FullLesson, FullQuizResult, UserAnswers, StudyStats, SkillResult, Skill } from '../types';

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


export async function addExp(amount: number, user: UserProfile): Promise<{level: number, exp: number}> {
    if (!user || !user.email) {
        throw new Error("User must be logged in to gain EXP.");
    }
    try {
        const response = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add_exp',
                payload: { amount, user }
            })
        });

        if (!response.ok) {
            await handleProxyError(response);
        }
        
        const data = await response.json();
        if (data.success && data.user) {
            return data.user;
        } else {
            throw new Error("Failed to update EXP on the server.");
        }
    } catch (error) {
        console.error("Failed to add EXP:", error);
        throw error;
    }
}

export async function addPoints(amount: number, user: UserProfile): Promise<{ points: number }> {
    if (!user || !user.email) {
        throw new Error("User must be logged in to gain points.");
    }
    try {
        const response = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add_points',
                payload: { amount, user }
            })
        });

        if (!response.ok) {
            await handleProxyError(response);
        }
        
        const data = await response.json();
        if (data.success && data.user) {
            return data.user;
        } else {
            throw new Error("Failed to update points on the server.");
        }
    } catch (error) {
        console.error("Failed to add points:", error);
        throw error;
    }
}


export async function fetchUserProfileAndLogLogin(user: UserProfile): Promise<UserProfile> {
    try {
        const response = await fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'logLogin',
                payload: { user }
            })
        });
        if (!response.ok) {
            // Fallback to original user profile if API fails
            console.error("Failed to fetch full user profile:", await response.text());
            return user;
        }
        const data = await response.json();
        return data.user || user; // Return full profile from DB, or original as fallback
    } catch (error) {
        console.error("Failed to log user login/fetch profile:", error);
        return user; // Fallback
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
    
    // Create a config object from settings, excluding properties we don't want to send.
    const config: any = { ...settings };
    delete config.model; // model is passed separately.

    // Per user feedback, explicitly set output size to prevent cropping, especially with multiple input images (e.g. when applying outfits).
    // The Gemini API expects an `output` object within the `config`.
    if (settings?.outputSize?.width && settings?.outputSize?.height) {
        config.output = {
            width: settings.outputSize.width,
            height: settings.outputSize.height,
        };
    }
    delete config.outputSize; // clean up

    // Let's also handle the 'auto' aspect ratio here on the client-side to be safe.
    if (config.aspectRatio === 'auto' || !config.aspectRatio) {
        delete config.aspectRatio;
    }

    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'editImage',
            payload: {
                model: settings.model,
                prompt,
                images,
                config: config, // Pass the constructed config object
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


export async function generateSpeech(text: string, user: UserProfile | undefined, voice?: string, speed?: number): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateSpeech',
            payload: { text, user, voice, speed }
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

// --- NEW functions for Study Zone ---

export async function generateFullLesson(language: string, level: string, isStarterOnly: boolean, user: UserProfile | undefined): Promise<FullLesson> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateReadingLesson',
            payload: { language, level, isStarterOnly, user }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    const data = await response.json();
    return data.lesson;
}

export async function gradeFullLesson(lesson: FullLesson, userAnswers: UserAnswers, user: UserProfile | undefined): Promise<FullQuizResult> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'gradeReadingAnswers',
            payload: { lesson, userAnswers, user }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    const data = await response.json();
    return data.result;
}

export async function gradeSingleSkill(lesson: FullLesson, userAnswers: UserAnswers, skill: Skill, user: UserProfile | undefined): Promise<SkillResult> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'gradeSkill',
            payload: { lesson, userAnswers, skill, user }
        })
    });
    if (!response.ok) {
        await handleProxyError(response);
    }
    return await response.json();
}

export async function unlockStarterLanguage(language: string, user: UserProfile): Promise<UserProfile> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'unlock_starter_language',
            payload: { language, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.user;
}

export async function getStudyStats(user: UserProfile): Promise<StudyStats> {
     const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'get_study_stats',
            payload: { user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.stats;
}

export async function logLessonCompletion(language: string, expGained: number, user: UserProfile): Promise<StudyStats> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'log_lesson_completion',
            payload: { language, expGained, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.stats;
}
