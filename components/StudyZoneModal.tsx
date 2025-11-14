import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CloseIcon, BookOpenIcon, RefreshIcon } from './icons';
import type { UserProfile, ReadingLesson, StudyZoneQuestion, QuizResult } from '../types';
import { generateReadingLesson, gradeReadingAnswers } from '../services/geminiService';

interface StudyZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  handleExpGain: (amount: number) => void;
}

const LANGUAGES = ['Japanese', 'English', 'Vietnamese', 'Korean', 'Chinese'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
type Skill = 'Reading' | 'Listening' | 'Speaking' | 'Writing' | 'Questions';
const SKILLS: Skill[] = ['Reading', 'Listening', 'Speaking', 'Writing', 'Questions'];

type View = 'lobby' | 'lesson' | 'results';

export const StudyZoneModal: React.FC<StudyZoneModalProps> = ({ isOpen, onClose, userProfile, setNotifications, handleExpGain }) => {
    const [view, setView] = useState<View>('lobby');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('Japanese');
    const [selectedLevel, setSelectedLevel] = useState('Beginner');
    const [currentLesson, setCurrentLesson] = useState<ReadingLesson | null>(null);
    const [userAnswers, setUserAnswers] = useState<(string|number)[]>([]);
    const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
    const [activeTab, setActiveTab] = useState<Skill>('Reading');

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Reset to lobby when modal opens
            setView('lobby');
            setCurrentLesson(null);
            setQuizResult(null);
            setUserAnswers([]);
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);

    const handleStartLesson = async () => {
        setIsLoading(true);
        try {
            const lesson = await generateReadingLesson(selectedLanguage, selectedLevel, userProfile);
            setCurrentLesson(lesson);
            setUserAnswers(new Array(lesson.questions.length).fill(-1));
            setActiveTab('Reading');
            setView('lesson');
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to generate lesson', ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswerChange = (questionIndex: number, answerIndex: number) => {
        setUserAnswers(prev => {
            const newAnswers = [...prev];
            newAnswers[questionIndex] = answerIndex;
            return newAnswers;
        });
    };

    const handleSubmitLesson = async () => {
        if (!currentLesson) return;
        if (userAnswers.includes(-1)) {
            setNotifications(prev => ['Please answer all questions before submitting.', ...prev.slice(0, 19)]);
            return;
        }
        setIsLoading(true);
        try {
            const result = await gradeReadingAnswers(currentLesson, userAnswers, userProfile);
            setQuizResult(result);
            handleExpGain(result.score); // Award EXP equal to the score
            setView('results');
        } catch (e) {
            setNotifications(prev => [e instanceof Error ? e.message : 'Failed to grade answers', ...prev.slice(0, 19)]);
        } finally {
            setIsLoading(false);
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
            <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-full max-w-sm">
                <h4 className="font-semibold mb-2">Coming Soon</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Weekly tests, statistics, and leaderboards are on the way!</p>
            </div>
        </div>
    );
    
    const renderLesson = () => (
        <div className="flex flex-col h-full">
            <div className="border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <nav className="flex space-x-4">
                    {SKILLS.map(skill => (
                        <button key={skill} onClick={() => setActiveTab(skill)} className={`py-2 px-3 text-sm font-medium ${activeTab === skill ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-slate-500 hover:text-indigo-500'}`}>
                            {skill}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                {activeTab === 'Reading' && currentLesson && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="font-semibold">Passage ({selectedLanguage})</h4>
                            <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.passage}</p>
                            <h4 className="font-semibold">Translation (Vietnamese)</h4>
                            <p className="whitespace-pre-wrap leading-relaxed bg-slate-100 dark:bg-slate-800 p-3 rounded-md">{currentLesson.passage_translation}</p>
                        </div>
                        <div className="space-y-4">
                            <h4 className="font-semibold">Questions</h4>
                            {currentLesson.questions.map((q, qIndex) => (
                                <div key={qIndex} className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md">
                                    <p className="font-medium mb-2">{qIndex + 1}. {q.question_text}</p>
                                    <div className="space-y-2">
                                        {q.options.map((opt, oIndex) => (
                                            <label key={oIndex} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                                                <input type="radio" name={`q-${qIndex}`} checked={userAnswers[qIndex] === oIndex} onChange={() => handleAnswerChange(qIndex, oIndex)} className="text-indigo-600 focus:ring-indigo-500"/>
                                                <span>{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                 {activeTab !== 'Reading' && <p className="text-center text-slate-500 mt-8">{activeTab} exercises are coming soon!</p>}
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
            <p className="text-6xl font-bold my-4">{quizResult?.score || 0}/100</p>
            <p className="text-xl font-semibold text-indigo-500">You earned {quizResult?.score || 0} EXP!</p>
            <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-full max-w-xl text-left">
                <h4 className="font-semibold mb-2">Feedback from AI Tutor:</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{quizResult?.feedback}</p>
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
