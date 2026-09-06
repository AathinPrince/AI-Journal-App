import React, { useState } from 'react';
import { ReflectionMode, UserInteraction } from '../types';
import { db, handleFirestoreError, OperationType, sanitizePayload } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  Sparkles,
  Compass,
  Lightbulb,
  ListChecks,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Send,
  Mic,
  Brain,
  CheckCircle2,
  HelpCircle,
  Info,
} from 'lucide-react';
import { ThoughtStream } from './ThoughtStream';
import { PerspectiveFlipModal } from './PerspectiveFlipModal';

interface JournalEditorProps {
  userId: string;
  onEntryCreated: (entry: UserInteraction) => void;
  onThoughtStreamCommitted?: () => void;
}

const MODES: Array<{
  id: ReflectionMode;
  label: string;
  shortDesc: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'reflection',
    label: 'Mindful Reflection',
    shortDesc: 'Deep empathy & open inquiry',
    detail: 'Validates emotions, highlights patterns, and asks 1-2 thoughtful guiding questions.',
    icon: Compass,
  },
  {
    id: 'summary',
    label: 'Executive Summary',
    shortDesc: 'Structured takeaway points',
    detail: 'Organizes your thoughts into core themes, key observations, and action items.',
    icon: ListChecks,
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm Ideas',
    shortDesc: 'Fresh angles & pathways',
    detail: 'Generates creative alternatives, micro-experiments, and constructive solutions.',
    icon: Lightbulb,
  },
  {
    id: 'converse',
    label: 'Open Dialogue (Chat)',
    shortDesc: 'Back-and-forth conversational partner',
    detail: 'Chat with Gemini as an empathetic sounding board, continuing across multiple turns.',
    icon: MessageSquare,
  },
];

const SUGGESTED_PROMPTS = [
  "Today I faced a difficult decision and felt unsure because...",
  "Reflecting on a recent milestone: what went well and what I learned...",
  "I noticed myself feeling drained by a recurring situation with...",
  "An unexpected moment of calm today that made me realize...",
];

export const JournalEditor: React.FC<JournalEditorProps> = ({
  userId,
  onEntryCreated,
  onThoughtStreamCommitted,
}) => {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ReflectionMode>('reflection');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showThoughtStream, setShowThoughtStream] = useState(false);
  const [showPerspectiveFlip, setShowPerspectiveFlip] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingSaveData, setPendingSaveData] = useState<{
    entry: UserInteraction;
    docRefPath: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Request AI reflection from backend API proxy
      const response = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          mode,
          messages: [],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server failed to generate reflection response.');
      }

      const resData = await response.json();
      const generatedResponse: string = resData.response || '';

      // 2. Prepare isolated user interaction document
      const newId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      const newEntry: UserInteraction = {
        id: newId,
        userId,
        title: title.trim() || `Reflection: ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        prompt: cleanPrompt,
        response: generatedResponse,
        mode,
        messages: [
          {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: cleanPrompt,
            timestamp: nowIso,
          },
          {
            id: `msg_${Date.now()}_model`,
            role: 'model',
            content: generatedResponse,
            timestamp: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // 3. Strict undefined-stripping & save to Firestore
      const sanitized = sanitizePayload(newEntry);
      const docPath = `users/${userId}/interactions/${newId}`;

      try {
        await setDoc(doc(db, 'users', userId, 'interactions', newId), sanitized);
      } catch (dbErr) {
        setPendingSaveData({ entry: newEntry, docRefPath: docPath });
        handleFirestoreError(dbErr, OperationType.CREATE, docPath);
      }

      // Reset form on verified success
      setTitle('');
      setPrompt('');
      setPendingSaveData(null);
      onEntryCreated(newEntry);
    } catch (err: any) {
      console.error('Error submitting reflection:', err);
      setErrorMessage(
        err?.message || 'We could not generate or save your reflection. Your text has been preserved.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySave = async () => {
    if (!pendingSaveData) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const sanitized = sanitizePayload(pendingSaveData.entry);
      await setDoc(
        doc(db, 'users', userId, 'interactions', pendingSaveData.entry.id),
        sanitized
      );
      const saved = pendingSaveData.entry;
      setPendingSaveData(null);
      setTitle('');
      setPrompt('');
      onEntryCreated(saved);
    } catch (dbErr) {
      setErrorMessage(
        dbErr instanceof Error ? dbErr.message : 'Retry save failed. Please check your connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-stone-900/90 border border-stone-800/80 rounded-3xl p-5 sm:p-7 lg:p-8 shadow-2xl backdrop-blur-xl relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-800/60 text-emerald-200 text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header with Feature Explanation */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-stone-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
              Compose Your Reflection
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 font-semibold">
              Gemini 3.6 Flash
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl leading-relaxed">
            Write down your thoughts, dilemma, or feelings. Gemini analyzes your entry according to your chosen reflection style and saves it privately to Firestore.
          </p>
        </div>

        {/* ThoughtStream Toggle Button (Easier to distinguish) */}
        <button
          type="button"
          id="thoughtstream-toggle-btn"
          onClick={() => setShowThoughtStream((prev) => !prev)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border transition shadow-sm cursor-pointer self-start sm:self-auto shrink-0 ${
            showThoughtStream
              ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-amber-950/50'
              : 'bg-stone-800/90 text-amber-300 border-amber-500/30 hover:bg-stone-800 hover:border-amber-500/60'
          }`}
        >
          <Mic className={`w-4 h-4 ${showThoughtStream ? 'text-stone-950' : 'text-amber-400'}`} />
          <span>{showThoughtStream ? 'Close ThoughtStream' : 'Speak: ThoughtStream'}</span>
        </button>
      </div>

      {/* Inline ThoughtStream Continuous Audio-to-Text Panel */}
      {showThoughtStream && (
        <div className="mb-6">
          <ThoughtStream
            userId={userId}
            onCommitSuccess={() => {
              setShowThoughtStream(false);
              showToast('ThoughtStream audio transcribed & committed to journal silently!');
              if (onThoughtStreamCommitted) onThoughtStreamCommitted();
            }}
            onClose={() => setShowThoughtStream(false)}
          />
        </div>
      )}

      {errorMessage && (
        <div className="mb-5 p-4 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Operation Notice</p>
              <p className="text-xs text-rose-300 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          {pendingSaveData && (
            <button
              id="retry-save-btn"
              onClick={handleRetrySave}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Retry Save to Firestore
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Function Layout 1: Reflection Mode Selectors with Clear Explanations */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
              1. Choose Reflection Mode
            </label>
            <span className="text-[11px] text-stone-400">
              How Gemini will respond to your words
            </span>
          </div>
          <p className="text-xs text-stone-400 mb-3">
            Select how you would like Gemini to frame its response:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  id={`mode-btn-${m.id}`}
                  onClick={() => setMode(m.id)}
                  className={`text-left p-3.5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-amber-500/90 bg-amber-500/15 ring-1 ring-amber-500/40 text-stone-100 shadow-md shadow-amber-950/30'
                      : 'border-stone-800/90 bg-stone-950/60 text-stone-300 hover:bg-stone-800/60 hover:border-stone-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-800 text-stone-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-stone-200'}`}>
                        {m.label}
                      </span>
                    </div>
                    <p className={`text-[11px] font-medium leading-snug ${isSelected ? 'text-stone-200' : 'text-stone-400'}`}>
                      {m.shortDesc}
                    </p>
                  </div>
                  <p className="text-[10px] text-stone-500 mt-2 pt-2 border-t border-stone-800/80 leading-relaxed">
                    {m.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Function Layout 2: Title Field */}
        <div>
          <label htmlFor="journal-title" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
            2. Title (Optional)
          </label>
          <p className="text-xs text-stone-400 mb-2">
            Give this reflection a label or leave empty for an automatic timestamp.
          </p>
          <input
            id="journal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Clarity on Career Transition & Staying Grounded"
            maxLength={120}
            className="w-full px-4 py-3 rounded-2xl border border-stone-800 bg-stone-950/70 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/80 transition"
          />
        </div>

        {/* Function Layout 3: Journal Content Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="journal-content" className="block text-xs font-bold uppercase tracking-wider text-amber-400">
              3. Journal Entry / Reflection Text
            </label>
            <span className="text-[11px] text-stone-400">
              {prompt.length} / 10,000 characters
            </span>
          </div>
          <p className="text-xs text-stone-400 mb-2">
            Pour your uncensored thoughts here. You can also click any inspiration prompt below.
          </p>

          <textarea
            id="journal-content"
            rows={7}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Write freely about what happened, what you are feeling, what feels difficult, or what you hope to achieve..."
            maxLength={10000}
            className="w-full px-4 py-3.5 rounded-2xl border border-stone-800 bg-stone-950/70 text-stone-100 text-sm leading-relaxed placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/80 transition resize-y font-normal"
          />
        </div>

        {/* Function Layout 4: Action Tools & Inspiration Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-stone-950/60 border border-stone-800/80">
          {/* Cognitive Bias Challenger */}
          <button
            type="button"
            id="challenge-assumptions-editor-btn"
            onClick={() => setShowPerspectiveFlip(true)}
            disabled={!prompt.trim() || loading}
            title="Analyze cognitive blind spots in your text"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-950/60 text-purple-300 border border-purple-800/60 hover:bg-purple-900/60 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span>Perspective Flip: Challenge Assumptions</span>
          </button>

          {/* Inspiration Prompts Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
            <span className="text-[11px] text-stone-400 font-semibold shrink-0">Starters:</span>
            {SUGGESTED_PROMPTS.slice(0, 2).map((sample, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setPrompt(sample)}
                className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-stone-800/80 text-stone-300 hover:bg-stone-800 hover:text-amber-200 border border-stone-700/60 transition cursor-pointer truncate max-w-[200px] sm:max-w-[260px]"
              >
                "{sample}"
              </button>
            ))}
          </div>
        </div>

        {/* Function Layout 5: Distinct Primary Submit Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-stone-800/80">
          <p className="text-[11px] text-stone-400">
            🔒 Strictly isolated in your Cloud Firestore database.
          </p>

          <button
            type="submit"
            id="submit-reflection-btn"
            disabled={loading || !prompt.trim()}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm active:scale-[0.98] transition shadow-lg shadow-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-stone-950" />
                <span>Reflecting with Gemini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-stone-950" />
                <span>Reflect with Gemini</span>
                <Send className="w-3.5 h-3.5 text-stone-950 ml-1" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Perspective Flip Modal */}
      {showPerspectiveFlip && (
        <PerspectiveFlipModal
          isOpen={showPerspectiveFlip}
          onClose={() => setShowPerspectiveFlip(false)}
          userId={userId}
          interactionId={`draft_${Date.now()}`}
          reflectionText={prompt}
          entryTitle={title || 'Draft Reflection'}
        />
      )}
    </div>
  );
};
