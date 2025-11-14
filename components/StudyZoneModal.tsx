import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CloseIcon, BookOpenIcon, RefreshIcon, SpeakerWaveIcon, PlayIcon, PauseIcon, StopCircleIcon } from './icons';
import type { UserProfile, FullLesson, QuizQuestion, FullQuizResult } from '../types';
import { generateFullLesson, gradeFullLesson, generateSpeech } from '../services/geminiService';

interface StudyZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  handleExpGain: (amount: number) => void;
}

const LANGUAGES = ['Japanese', 'English', 'Vietnamese', 'Korean', 'Chinese'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
type Skill = 'Reading' | 'Listening' | 'Speaking' | 'Writing' | 'Quiz';
const SKILLS: Skill[] = ['Reading', 'Listening', 'Speaking', 'Writing', 'Quiz'];

type View = 'lobby' | 'lesson' | 'results';

const INITIAL_ANSWERS = {
    reading: [],
    listening: [],
    writing: '',
    quiz: [],
};

export const StudyZoneModal: React.FC<StudyZoneModalProps> = ({ isOpen, onClose, userProfile, setNotifications, handleExpGain }) => {
    const [view, setView] = useState<View>('lobby');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('Japanese');
    const [selectedLevel, setSelectedLevel] = useState('Beginner');
    const [currentLesson, setCurrentLesson] = useState<FullLesson | null>(null);
    const [userAnswers, setUserAnswers] = useState<any>(INITIAL_ANSWERS);
    const [quizResult, setQuizResult] = useState<FullQuizResult | null>(null);
    const [activeTab, setActiveTab] = useState<Skill>('Reading');

    // State for Listening feature
    const [listeningAudioUrl, setListeningAudioUrl] = useState<string | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // State for Speaking feature
    const [isRecording, setIsRecording] = useState(false);
    const [recordedSpeakingUrl, setRecordedSpeakingUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        audioRef.current = new Audio();
        const onEnded = () => setIsAudioPlaying(false);
        audioRef.current.addEventListener('ended', onEnded);
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('ended', onEnded);
                audioRef.current.pause();
            }
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setView('lobby');
            // Other state resets
            setCurrentLesson(null);
            setQuizResult(null);
            setUserAnswers(INITIAL_ANSWERS);
            setIsRecording(false);
            setRecordedSpeakingUrl(null);
        } else {
            document.body.style.overflow = 'auto';
            // Cleanup audio
            if (audioRef.current) audioRef.current.pause();
            if (listeningAudioUrl) {
                URL.revokeObjectURL(listeningAudioUrl);
                setListeningAudioUrl(null);
            }
            setIsAudioPlaying(false);
            setIsAudioLoading(false);
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        }
    }, [isOpen, listeningAudioUrl]);

    const handleStartLesson = async () => {
        setIsLoading(true);
        try {
            // FIX: Pass the missing 'isStarterOnly' boolean argument, defaulting to 'false'.
            const lesson = await generateFullLesson(selectedLanguage, selectedLevel, false, userProfile);
            setCurrentLesson(lesson);
            setUserAnswers({
                reading: new Array(lesson.reading.questions.length).fill(-1),
                listening: new Array(lesson.listening.length).fill(-1),
                writing: '',
                quiz: new Array(lesson.general_questions.length).fill(-1),
            });
            setActiveTab('Reading');
            setView('lesson');
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to generate lesson', ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswerChange = (skill: 'reading' | 'listening' | 'quiz', qIndex: number, aIndex: number) => {
        setUserAnswers(prev => ({ ...prev, [skill]: prev[skill].map((ans: any, i: number) => (i === qIndex ? aIndex : ans)) }));
    };

    const handleSubmitLesson = async () => {
        if (!currentLesson) return;
        const allAnswered = !userAnswers.reading.includes(-1) && !userAnswers.listening.includes(-1) && !userAnswers.quiz.includes(-1);
        if (!allAnswered) {
            setNotifications(prev => ['Please answer all multiple-choice questions.', ...prev.slice(0, 19)]);
            return;
        }
        setIsLoading(true);
        try {
            const result = await gradeFullLesson(currentLesson, userAnswers, userProfile);
            setQuizResult(result);
            handleExpGain(Math.round(result.totalScore));
            setView('results');
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to grade answers', ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerateListeningAudio = useCallback(async (text: string) => {
        if (!userProfile) return;
        setIsAudioLoading(true);
        setIsAudioPlaying(false);
        if (listeningAudioUrl) URL.revokeObjectURL(listeningAudioUrl);
        setListeningAudioUrl(null);
        if (audioRef.current) audioRef.current.pause();

        try {
            const base64Audio = await generateSpeech(text, userProfile, 'nova', 1.0);
            const byteCharacters = atob(base64Audio);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
            const blob = new Blob([byteArray], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            setListeningAudioUrl(url);

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.play().catch(console.error);
                setIsAudioPlaying(true);
            }
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to generate audio', ...prev]);
        } finally {
            setIsAudioLoading(false);
        }
    }, [userProfile, setNotifications, listeningAudioUrl]);


    const toggleAudioPlayback = () => {
        if (!audioRef.current || !listeningAudioUrl) return;
        if (isAudioPlaying) {
            audioRef.current.pause();
            setIsAudioPlaying(false);
        } else {
            audioRef.current.play().catch(console.error);
            setIsAudioPlaying(true);
        }
    };

    const handleToggleRecording = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream);
                mediaRecorderRef.current.ondataavailable = e => { if(e.data.size > 0) recordedChunksRef.current.push(e.data); };
                mediaRecorderRef.current.onstop = () => {
                    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                    setRecordedSpeakingUrl(URL.createObjectURL(blob));
                    recordedChunksRef.current = [];
                    stream.getTracks().forEach(track => track.stop());
                };
                recordedChunksRef.current = [];
                mediaRecorderRef.current.start();
                setIsRecording(true);
                setRecordedSpeakingUrl(null);
            } catch (err) {
                setNotifications(prev => ["Microphone access denied or not available.", ...prev]);
            }
        }
    };

    const renderLobby = () => (
        <div className="flex flex-col items-center justify-center h-full text-center">
            <h3 className="text-3xl font-bold mb-6">Welcome to the Study Zone</h3>
            <div className="space-y-4 max-w-sm w-full">
                <div>
                    <label htmlFor="language-select" className="block text-sm font-medium mb-1">Choose a language</label>
                    <select id="language-select" value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700">
                        {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="level-select" className="block text-sm font-medium mb-1">Choose your level</label>
                    <select id="level-select" value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)} className="w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700">
                        {LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                    </select>
                </div>
                <button onClick={handleStartLesson} disabled={isLoading} className="w-full p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? 'Generating Lesson...' : 'Start New Lesson'}
                </button>
            </div>
        </div>
    );
    
    const QuestionBlock: React.FC<{q: QuizQuestion, qIndex: number, userAnswer: number, onAnswer: (qIndex: number, aIndex: number) => void}> = ({q, qIndex, userAnswer, onAnswer}) => (
        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
            <p className="font-medium mb-2">{qIndex + 1}. {q.question_text}</p>
            <div className="space-y-2">
                {q.options.map((opt, oIndex) => (
                    <label key={oIndex} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                        <input type="radio" name={`q-${q.question_text}-${qIndex}`} checked={userAnswer === oIndex} onChange={() => onAnswer(qIndex, oIndex)} className="text-indigo-600 focus:ring-indigo-500"/>
                        <span>{opt}</span>
                    </label>
                ))}
            </div>
        </div>
    );

    const renderLesson = () => (
        <div className="flex flex-col h-full">
            <div className="border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto">
                    {SKILLS.map(skill => (
                        <button key={skill} onClick={() => setActiveTab(skill)} className={`py-2 px-2 sm:px-3 text-sm font-medium whitespace-nowrap ${activeTab === skill ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-slate-500 hover:text-indigo-500'}`}>
                            {skill}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                {currentLesson && (
                    <div style={{ display: activeTab === 'Reading' ? 'block' : 'none' }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-semibold flex items-center gap-2">Passage ({selectedLanguage}) <button onClick={() => handleGenerateListeningAudio(currentLesson.reading.passage)} className="text-slate-500 hover:text-indigo-500"><SpeakerWaveIcon className="w-5 h-5"/></button></h4>
                                <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.reading.passage}</p>
                                <h4 className="font-semibold">Translation (Vietnamese)</h4>
                                <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.reading.passage_translation}</p>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-semibold">Comprehension Questions</h4>
                                {currentLesson.reading.questions.map((q, qIndex) => <QuestionBlock key={qIndex} q={q} qIndex={qIndex} userAnswer={userAnswers.reading[qIndex]} onAnswer={(i,a)=>handleAnswerChange('reading', i, a)}/>)}
                            </div>
                        </div>
                    </div>
                )}
                {currentLesson && (
                    <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Listening' ? 'block' : 'none' }}>
                       {currentLesson.listening.map((task, index) => (
                           <div key={index}>
                               <h4 className="font-semibold text-xl mb-2">Listening Task {index + 1}</h4>
                               <button onClick={() => handleGenerateListeningAudio(task.audio_text)} disabled={isAudioLoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:bg-indigo-400">
                                   {isAudioLoading ? <><RefreshIcon className="w-5 h-5 animate-spin"/>Generating...</> : <><PlayIcon className="w-5 h-5"/>Play Audio</>}
                               </button>
                               <div className="mt-4"><QuestionBlock q={task} qIndex={index} userAnswer={userAnswers.listening[index]} onAnswer={(i,a)=>handleAnswerChange('listening',i,a)}/></div>
                           </div>
                       ))}
                    </div>
                )}
                {currentLesson && (
                     <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Speaking' ? 'block' : 'none' }}>
                        <h4 className="font-semibold text-xl">Speaking Practice</h4>
                        <p className="text-sm text-slate-500">Read the following prompt out loud. Record yourself and play it back to check your fluency and pronunciation.</p>
                        <p className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md font-semibold text-lg">"{currentLesson.speaking.prompt}"</p>
                        <div className="flex items-center gap-4">
                           <button onClick={handleToggleRecording} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold transition-colors ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-600'}`}>
                                {isRecording ? <><StopCircleIcon className="w-5 h-5"/>Stop</> : <><SpeakerWaveIcon className="w-5 h-5"/>Record</>}
                           </button>
                           {recordedSpeakingUrl && <audio src={recordedSpeakingUrl} controls />}
                        </div>
                    </div>
                )}
                {currentLesson && (
                     <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Writing' ? 'block' : 'none' }}>
                        <h4 className="font-semibold text-xl">Writing Challenge</h4>
                        <p className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md font-semibold">{currentLesson.writing.prompt}</p>
                        <textarea value={userAnswers.writing} onChange={(e) => setUserAnswers(prev => ({...prev, writing: e.target.value}))} rows={8} className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Your answer here..."/>
                    </div>
                )}
                {currentLesson && (
                     <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Quiz' ? 'block' : 'none' }}>
                        <h4 className="font-semibold text-xl">General Quiz</h4>
                        {currentLesson.general_questions.map((q, qIndex) => <QuestionBlock key={qIndex} q={q} qIndex={qIndex} userAnswer={userAnswers.quiz[qIndex]} onAnswer={(i,a)=>handleAnswerChange('quiz', i, a)}/>)}
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between">
                <button onClick={() => setView('lobby')} className="p-3 bg-slate-200 dark:bg-slate-700 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600">Back to Lobby</button>
                <button onClick={handleSubmitLesson} disabled={isLoading} className="p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-green-400">
                    {isLoading ? 'Grading...' : 'Submit & See Results'}
                </button>
            </div>
        </div>
    );

    const renderResults = () => (
        <div className="flex flex-col items-center justify-center h-full text-center">
            <h3 className="text-3xl font-bold">Lesson Complete!</h3>
            <p className="text-6xl font-bold my-4">{quizResult?.totalScore || 0}/100</p>
            <p className="text-xl font-semibold text-indigo-500">You earned {Math.round(quizResult?.totalScore || 0)} EXP!</p>
            <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-full max-w-3xl text-left grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quizResult?.skillResults.map(res => (
                    <div key={res.skill} className="p-3 bg-white dark:bg-slate-700 rounded-md">
                        <div className="flex justify-between items-baseline">
                           <h4 className="font-bold text-lg">{res.skill}</h4>
                           <span className="font-bold text-lg">{res.score}/100</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-1">{res.feedback}</p>
                    </div>
                ))}
            </div>
            <div className="mt-8 flex gap-4">
                <button onClick={() => setView('lobby')} className="p-3 bg-slate-200 dark:bg-slate-700 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600">Back to Lobby</button>
                <button onClick={handleStartLesson} disabled={isLoading} className="p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? <RefreshIcon className="w-5 h-5 animate-spin" /> : 'Try Another Lesson'}
                </button>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col p-6 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><BookOpenIcon className="w-7 h-7 text-teal-500"/> Study Zone</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><CloseIcon className="w-6 h-6"/></button>
                </div>

                {!userProfile ? (
                    <div className="flex-grow flex items-center justify-center text-center"><p>Please sign in to access the Study Zone.</p></div>
                ) : (
                    <div className="flex-grow min-h-0">
                        {view === 'lobby' && renderLobby()}
                        {view === 'lesson' && renderLesson()}
                        {view === 'results' && renderResults()}
                    </div>
                )}
            </div>
        </div>
    );
};
