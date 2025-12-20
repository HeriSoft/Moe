import { GoogleGenAI } from "@google/genai";
import type { UserProfile, Attachment, Message, FullLesson, StudyStats, Skill, SkillResult } from '../types';

async function handleProxyError(response: Response) {
    let errorDetails = '';
    try {
        const errorJson = await response.json();
        errorDetails = errorJson.details || errorJson.error || response.statusText;
    } catch {
        errorDetails = response.statusText;
    }
    throw new Error(`API Error: ${errorDetails}`);
}

export async function fetchUserProfileAndLogLogin(user: UserProfile): Promise<UserProfile> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logLogin', payload: { user } })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.user;
}

export async function streamModelResponse(
    model: string,
    history: Message[],
    newMessage: string,
    attachments: Attachment[],
    isWebSearchEnabled: boolean,
    isDeepThinkEnabled: boolean,
    systemInstruction: string | undefined,
    user: UserProfile | undefined
): Promise<any> { // Returns an async generator
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
                user
            }
        })
    });

    if (!response.ok) await handleProxyError(response);
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
        async *[Symbol.asyncIterator]() {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            yield data;
                        } catch (e) {
                            // ignore parse errors for partial chunks
                        }
                    }
                }
            }
        }
    };
}

export async function generateImage(prompt: string, config: any, user: UserProfile | undefined): Promise<Attachment[]> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateImages',
            payload: { prompt, config, user, model: config.model }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    
    // Adapt response format to Attachment[]
    // Gemini/Imagen returns `generatedImages` array with `image.imageBytes`
    if (data.generatedImages) {
        return data.generatedImages.map((img: any) => ({
            data: img.image.imageBytes,
            mimeType: 'image/png', // Default assumption
            fileName: `generated-${Date.now()}.png`
        }));
    }
    return [];
}

export async function editImage(prompt: string, images: Attachment[], settings: any, user: UserProfile | undefined): Promise<{ text: string, attachments: Attachment[] }> {
    const config: any = { ...settings };
    delete config.model; 

    if (settings.model === 'gemini-3-pro-image-preview') {
        config.imageConfig = {};
        if (settings.aspectRatio && settings.aspectRatio !== 'auto') {
            config.imageConfig.aspectRatio = settings.aspectRatio;
        }
        if (settings.imageSize) {
            config.imageConfig.imageSize = settings.imageSize;
        }
        delete config.aspectRatio; 
        delete config.imageSize;
        delete config.outputSize;
    } else {
        if (settings?.outputSize?.width && settings?.outputSize?.height) {
            config.output = {
                width: settings.outputSize.width,
                height: settings.outputSize.height,
            };
        }
        delete config.outputSize;
        if (config.aspectRatio === 'auto' || !config.aspectRatio) {
            delete config.aspectRatio;
        }
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
                config: config,
                user,
            }
        })
    });
    if (!response.ok) await handleProxyError(response);
    return await response.json();
}

export async function swapFace(targetImage: Attachment, sourceImage: Attachment, user: UserProfile | undefined): Promise<Attachment> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'swapFace',
            payload: { targetImage, sourceImage, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    return await response.json();
}

export async function generateSpeech(text: string, user: UserProfile | undefined, voice = 'echo', speed = 1.0): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateSpeech',
            payload: { text, voice, speed, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.audioContent;
}

export async function getTranslation(text: string, targetLanguage: string, user: UserProfile | undefined): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'getTranslation',
            payload: { text, targetLanguage, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.translatedText;
}

export async function addExp(amount: number, user: UserProfile): Promise<UserProfile> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'add_exp',
            payload: { amount, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.user;
}

export async function addPoints(amount: number, user: UserProfile): Promise<{ points: number }> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'add_points',
            payload: { amount, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.user; 
}

export async function generateFullLesson(language: string, level: string, isStarterOnly: boolean, user: UserProfile | undefined): Promise<FullLesson> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateReadingLesson', 
            payload: { language, level, isStarterOnly, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    const data = await response.json();
    return data.lesson;
}

export async function gradeSingleSkill(lesson: FullLesson, userAnswers: any, skill: Skill, user: UserProfile | undefined): Promise<SkillResult> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'gradeSkill',
            payload: { lesson, userAnswers, skill, user }
        })
    });
    if (!response.ok) await handleProxyError(response);
    return await response.json();
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

export async function logLessonCompletion(language: string, expGained: number, user: UserProfile | undefined): Promise<StudyStats> {
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

export async function unlockStarterLanguage(language: string, user: UserProfile | undefined): Promise<UserProfile> {
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

export async function generateInterviewQuestion(context: string, user: UserProfile | undefined, targetLanguage: string, subtitleLanguage: string): Promise<{ question: string, subtitle?: string }> {
    return { question: "Tell me more about yourself.", subtitle: "Hãy nói thêm về bản thân bạn." }; 
}
