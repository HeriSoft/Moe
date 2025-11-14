import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CloseIcon, BookOpenIcon, RefreshIcon, SpeakerWaveIcon, PlayIcon, PauseIcon, StopCircleIcon, AcademicCapIcon, CheckIcon } from './icons';
import type { UserProfile, FullLesson, QuizQuestion, FullQuizResult, StudyStats, Skill, SkillResult } from '../types';
import { generateFullLesson, gradeSingleSkill, generateSpeech, getStudyStats, logLessonCompletion, unlockStarterLanguage } from '../services/geminiService';
import DrawingCanvas, { DrawingCanvasRef } from './DrawingCanvas';


interface StudyZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  handleExpGain: (amount: number) => void;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | undefined>>;
}

const LANGUAGES = ['Japanese', 'English', 'Vietnamese', 'Korean', 'Chinese'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

type View = 'lobby' | 'lesson' | 'results';

const INITIAL_ANSWERS = {
    reading: [],
    listening: [],
    writing: '',
    writingImage: '',
    quiz: [],
    starter: [],
};

export const StudyZoneModal: React.FC<StudyZoneModalProps> = ({ isOpen, onClose, userProfile, setNotifications, handleExpGain, setUserProfile }) => {
    const [view, setView] = useState<View>('lobby');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('Japanese');
    const [selectedLevel, setSelectedLevel] = useState('Beginner');
    const [currentLesson, setCurrentLesson] = useState<FullLesson | null>(null);
    const [userAnswers, setUserAnswers] = useState<any>(INITIAL_ANSWERS);
    const [quizResult, setQuizResult] = useState<FullQuizResult | null>(null);
    const [activeTab, setActiveTab] = useState<Skill>('Reading');
    const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
    const [completedTabs, setCompletedTabs] = useState<Set<Skill>>(new Set());
    const [skillResults, setSkillResults] = useState<SkillResult[]>([]);

    const drawingCanvasRef = useRef<DrawingCanvasRef>(null);
    const [brushColor, setBrushColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);

    const [listeningAudioUrl, setListeningAudioUrl] = useState<string | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordedSpeakingUrl, setRecordedSpeakingUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const isLanguageLocked = useMemo(() => 
        selectedLevel === 'Beginner' && !userProfile?.unlocked_starter_languages?.includes(selectedLanguage),
        [selectedLevel, selectedLanguage, userProfile]
    );
    
    const TABS: Skill[] = useMemo(() => {
        const hasStarter = currentLesson && 'starter' in currentLesson && currentLesson.starter;
        const baseTabs: Skill[] = ['Reading', 'Listening', 'Speaking', 'Writing', 'Quiz'];
        if (selectedLevel === 'Beginner' || hasStarter) {
            return ['Starter', ...baseTabs];
        }
        return baseTabs;
    }, [selectedLevel, currentLesson]);


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
            setCurrentLesson(null);
            setQuizResult(null);
            setUserAnswers(INITIAL_ANSWERS);
            setIsRecording(false);
            setRecordedSpeakingUrl(null);
            setCompletedTabs(new Set());
            setSkillResults([]);
            
            if (userProfile) {
                getStudyStats(userProfile)
                    .then(setStudyStats)
                    .catch(err => {
                        console.error("Failed to fetch study stats:", err);
                        setNotifications(prev => ["Could not load your study profile.", ...prev]);
                    });
            }

        } else {
            document.body.style.overflow = 'auto';
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
    }, [isOpen, listeningAudioUrl, userProfile, setNotifications]);

    const handleStartLesson = async () => {
        setIsLoading(true);
        try {
            const lesson = await generateFullLesson(selectedLanguage, selectedLevel, isLanguageLocked, userProfile);
            setCurrentLesson(lesson);
            setUserAnswers({
                reading: new Array(lesson.reading?.questions.length || 0).fill(-1),
                listening: new Array(lesson.listening?.length || 0).fill(-1),
                writing: '',
                writingImage: '',
                quiz: new Array(lesson.general_questions?.length || 0).fill(-1),
                starter: new Array(lesson.starter?.quiz.length || 0).fill(-1),
            });
            setCompletedTabs(new Set());
            setSkillResults([]);
            setActiveTab(selectedLevel === 'Beginner' ? 'Starter' : 'Reading');
            setView('lesson');
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to generate lesson', ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswerChange = (skill: 'reading' | 'listening' | 'quiz' | 'starter', qIndex: number, aIndex: number) => {
        setUserAnswers((prev: any) => ({ ...prev, [skill]: prev[skill].map((ans: any, i: number) => (i === qIndex ? aIndex : ans)) }));
    };
    
    const handleSubmitSkill = async (skill: Skill) => {
        if (!currentLesson || !userProfile) return;

        // Validation
        let answersForSkill: number[] = [];
        if (skill === 'Starter') answersForSkill = userAnswers.starter;
        if (skill === 'Reading') answersForSkill = userAnswers.reading;
        if (skill === 'Listening') answersForSkill = userAnswers.listening;
        if (skill === 'Quiz') answersForSkill = userAnswers.quiz;

        if (answersForSkill.length > 0 && answersForSkill.includes(-1)) {
             setNotifications(prev => [`Please answer all questions for the ${skill} section.`, ...prev.slice(0, 19)]);
             return;
        }

        const finalAnswers = {...userAnswers};
        if (skill === 'Writing') {
            finalAnswers.writingImage = drawingCanvasRef.current?.toDataURL().split(',')[1] || '';
        }

        setIsLoading(true);
        try {
            const result = await gradeSingleSkill(currentLesson, finalAnswers, skill, userProfile);

            handleExpGain(result.score);
            setNotifications(prev => [`${skill} Score: ${result.score}/100. You earned ${result.score} EXP!`, ...prev.slice(0,19)]);

            if (skill === 'Starter') {
                if (result.score === 100) {
                    setNotifications(prev => ["Perfect score! Unlocking full lesson...", ...prev.slice(0, 19)]);
                    const updatedProfile = await unlockStarterLanguage(selectedLanguage, userProfile);
                    setUserProfile(updatedProfile);
                    setCompletedTabs(prev => new Set(prev).add(skill));
                    setSkillResults(prev => [...prev, result]);
                    
                    // Fetch the full lesson content now, which includes the starter part again
                    const fullLesson = await generateFullLesson(selectedLanguage, selectedLevel, false, updatedProfile);
                    setCurrentLesson(fullLesson);
                    
                    // Reset answers for the newly fetched lesson parts
                    setUserAnswers(prev => ({
                        ...prev,
                        reading: new Array(fullLesson.reading?.questions.length || 0).fill(-1),
                        listening: new Array(fullLesson.listening?.length || 0).fill(-1),
                        writing: '', writingImage: '',
                        quiz: new Array(fullLesson.general_questions?.length || 0).fill(-1),
                    }));

                    setActiveTab('Reading');
                } else {
                    setQuizResult({ totalScore: result.score, skillResults: [result] });
                    setView('results');
                }
                return;
            }

            setCompletedTabs(prev => new Set(prev).add(skill));
            const updatedResults = [...skillResults, result];
            setSkillResults(updatedResults);
            
            const currentIndex = TABS.findIndex(t => t === skill);
            if (currentIndex < TABS.length - 1) {
                setActiveTab(TABS[currentIndex + 1]);
            } else {
                const totalScore = Math.round(updatedResults.reduce((acc, r) => acc + r.score, 0) / updatedResults.length);
                setQuizResult({ totalScore, skillResults: updatedResults });
                await logLessonCompletion(selectedLanguage, totalScore, userProfile);
                const newStats = await getStudyStats(userProfile);
                setStudyStats(newStats);
                setView('results');
            }
        } catch(e) {
            setNotifications(prev => [e instanceof Error ? e.message : `Failed to grade ${skill}`, ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateListeningAudio = useCallback(async (text: string) => {
        if (!userProfile || !text) return;
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
             {userProfile && studyStats && (
                <div className="w-full max-w-sm p-4 bg-slate-100 dark:bg-slate-800 rounded-lg mb-6 text-left">
                    <div className="flex items-center gap-4">
                        <img src={userProfile.imageUrl} alt={userProfile.name} className="w-16 h-16 rounded-full" />
                        <div className="min-w-0">
                            <p className="font-bold text-lg truncate">{userProfile.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <AcademicCapIcon className="w-4 h-4" /> Language Learner
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div><p className="font-semibold text-slate-500 dark:text-slate-400">EXP Earned:</p><p className="font-semibold text-indigo-500 dark:text-indigo-400">{studyStats.total_exp_earned.toLocaleString()}</p></div>
                        <div><p className="font-semibold text-slate-500 dark:text-slate-400">Total Lessons:</p><p>{studyStats.total_lessons_completed}</p></div>
                        <div><p className="font-semibold text-slate-500 dark:text-slate-400">Learned Today:</p><p>{studyStats.today_lessons_completed}</p></div>
                        <div><p className="font-semibold text-slate-500 dark:text-slate-400">Skills Studied:</p><p className="truncate" title={studyStats.languages_studied.join(', ') || 'None'}>{studyStats.languages_studied.join(', ') || 'None'}</p></div>
                    </div>
                </div>
            )}
            <h3 className="text-2xl font-bold mb-6">Start a New Lesson</h3>
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
                    {isLoading ? 'Generating Lesson...' : (isLanguageLocked ? 'Start Starter Lesson' : 'Start Now')}
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
    
    const SkillSubmitButton: React.FC<{ skill: Skill }> = ({ skill }) => {
        const isLastTab = TABS.indexOf(skill) === TABS.length - 1;
        return (
            <div className="mt-6 text-center">
                <button 
                    onClick={() => handleSubmitSkill(skill)}
                    disabled={isLoading}
                    className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors"
                >
                    {isLoading ? 'Submitting...' : isLastTab ? 'Finish & See Results' : 'Submit & Continue'}
                </button>
            </div>
        );
    };

    const renderLesson = () => (
        <div className="flex flex-col h-full">
            <div className="border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto">
                    {TABS.map(skill => {
                        const isCompleted = completedTabs.has(skill);
                        const isUnlocked = !isLanguageLocked;
                        const isDisabled = selectedLevel === 'Beginner' && !isUnlocked && skill !== 'Starter';

                        return (
                             <button key={skill} onClick={() => !isDisabled && !isCompleted && setActiveTab(skill)} 
                                className={`py-2 px-2 sm:px-3 text-sm font-medium whitespace-nowrap rounded-t-md flex items-center gap-1.5 ${
                                    isDisabled ? 'opacity-50 cursor-not-allowed text-slate-400' :
                                    isCompleted ? 'text-green-500 cursor-default' :
                                    (activeTab === skill ? 'border-b-2 text-indigo-500' : 'text-slate-500 hover:text-indigo-500')
                                } ${
                                    skill === 'Starter' && selectedLevel === 'Beginner' && !isUnlocked ? 'bg-yellow-300 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 border-yellow-500' : 
                                    (activeTab === skill ? 'border-indigo-500' : 'border-transparent')
                                }`}
                                disabled={isDisabled || isCompleted}>
                                {isCompleted && <CheckIcon className="w-4 h-4"/>}
                                {skill}
                            </button>
                        );
                    })}
                </nav>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                {currentLesson?.starter && (
                    <div className="max-w-4xl mx-auto space-y-6" style={{ display: activeTab === 'Starter' ? 'block' : 'none' }}>
                        <div>
                            <h4 className="font-bold text-xl mb-2">Learn the Alphabet: {currentLesson.starter.alphabet_name}</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {currentLesson.starter.characters_to_learn.map(char => (
                                    <div key={char.character} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-center">
                                        <p className="text-4xl font-bold">{char.character}</p>
                                        <p className="font-semibold">{char.pronunciation}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{char.example_word}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">({char.example_translation})</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-bold text-xl mb-2">Starter Quiz (10/10 to unlock)</h4>
                            <div className="space-y-4">
                                {currentLesson.starter.quiz.map((q, qIndex) => <QuestionBlock key={qIndex} q={q} qIndex={qIndex} userAnswer={userAnswers.starter[qIndex]} onAnswer={(i,a)=>handleAnswerChange('starter', i, a)}/>)}
                            </div>
                        </div>
                        {!completedTabs.has('Starter') && <SkillSubmitButton skill="Starter" />}
                    </div>
                )}
                {currentLesson?.reading && (
                    <div style={{ display: activeTab === 'Reading' ? 'block' : 'none' }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-semibold flex items-center gap-2">Passage ({selectedLanguage}) <button onClick={() => handleGenerateListeningAudio(currentLesson.reading!.passage)} className="text-slate-500 hover:text-indigo-500"><SpeakerWaveIcon className="w-5 h-5"/></button></h4>
                                <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.reading.passage}</p>
                                <h4 className="font-semibold">Translation (Vietnamese)</h4>
                                <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.reading.passage_translation}</p>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-semibold">Comprehension Questions</h4>
                                {currentLesson.reading.questions.map((q, qIndex) => <QuestionBlock key={qIndex} q={q} qIndex={qIndex} userAnswer={userAnswers.reading[qIndex]} onAnswer={(i,a)=>handleAnswerChange('reading', i, a)}/>)}
                            </div>
                        </div>
                         {!completedTabs.has('Reading') && <SkillSubmitButton skill="Reading" />}
                    </div>
                )}
                {currentLesson?.listening && (
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
                        {!completedTabs.has('Listening') && <SkillSubmitButton skill="Listening" />}
                    </div>
                )}
                {currentLesson?.speaking && (
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
                        {!completedTabs.has('Speaking') && <SkillSubmitButton skill="Speaking" />}
                    </div>
                )}
                {currentLesson?.writing && (
                     <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Writing' ? 'block' : 'none' }}>
                        <h4 className="font-semibold text-xl">Writing Challenge</h4>
                        <p className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md font-semibold">{currentLesson.writing.prompt}</p>
                        <div className="flex flex-wrap items-center justify-center gap-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-md">
                            <label htmlFor="brush-color" className="text-sm font-medium">Color:</label>
                            <input id="brush-color" type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} />
                            <label htmlFor="brush-size" className="text-sm font-medium">Size: {brushSize}</label>
                            <input id="brush-size" type="range" min="1" max="30" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-24 sm:w-32" />
                            <button onClick={() => drawingCanvasRef.current?.clear()} className="px-3 py-1 bg-slate-300 dark:bg-slate-600 text-sm font-semibold rounded-md hover:bg-slate-400 dark:hover:bg-slate-500">Clear</button>
                        </div>
                        <div className="w-full aspect-video border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden">
                            <DrawingCanvas ref={drawingCanvasRef} brushColor={brushColor} brushSize={brushSize} />
                        </div>
                         {!completedTabs.has('Writing') && <SkillSubmitButton skill="Writing" />}
                    </div>
                )}
                {currentLesson?.general_questions && (
                     <div className="max-w-3xl mx-auto space-y-4" style={{ display: activeTab === 'Quiz' ? 'block' : 'none' }}>
                        <h4 className="font-semibold text-xl">General Quiz</h4>
                        {currentLesson.general_questions.map((q, qIndex) => <QuestionBlock key={qIndex} q={q} qIndex={qIndex} userAnswer={userAnswers.quiz[qIndex]} onAnswer={(i,a)=>handleAnswerChange('quiz', i, a)}/>)}
                        {!completedTabs.has('Quiz') && <SkillSubmitButton skill="Quiz" />}
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-start">
                <button onClick={() => setView('lobby')} className="p-3 bg-slate-200 dark:bg-slate-700 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600">Back to Lobby</button>
            </div>
        </div>
    );

    const renderResults = () => {
        const isStarterFailure = quizResult?.skillResults.some(r => r.skill === 'Starter' && r.score < 100);

        return (
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
                    {isStarterFailure ? (
                        <button onClick={() => { setView('lesson'); setActiveTab('Starter'); }} className="p-3 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600">
                            Retry Starter Quiz
                        </button>
                    ) : (
                        <button onClick={() => setView('lobby')} className="p-3 bg-slate-200 dark:bg-slate-700 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600">
                            Back to Lobby
                        </button>
                    )}
                    <button onClick={handleStartLesson} disabled={isLoading} className="p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                        {isLoading ? <RefreshIcon className="w-5 h-5 animate-spin" /> : 'Try Another Lesson'}
                    </button>
                </div>
            </div>
        );
    };

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
