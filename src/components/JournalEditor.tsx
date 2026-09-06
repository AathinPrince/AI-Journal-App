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
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'reflection',
    label: 'Mindful Reflection',
    description: 'Empathetic feedback, emotional perspective & guiding questions',
    icon: Compass,
  },
  {
    id: 'summary',
    label: 'Executive Summary',
    description: 'Structured breakdown of key themes, sentiments & action items',
    icon: ListChecks,
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm Ideas',
    description: 'Fresh perspectives, creative pathways & actionable solutions',
    icon: Lightbulb,
  },
  {
    id: 'converse',
    label: 'Open Dialogue',
    description: 'Conversational back-and-forth exploration of thoughts',
    icon: MessageSquare,
  },
];

const SUGGESTED_PROMPTS = [
  "Today I navigated a difficult transition and felt overwhelmed by...",
  "Reflecting on a recent milestone I reached: what went well and what I learned...",
  "I'm feeling stuck between two paths and want to explore my true motivations...",
  "An unexpected moment of gratitude today that made me pause and realize...",
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      const generatedResponse: string = data.response;

      const newId = `interaction_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const nowIso = new Date().toISOString();

      const newEntry: UserInteraction = {
        id: newId,
        userId,
        title: title.trim() || `${mode.charAt(0).toUpperCase() + mode.slice(1)} (${new Date().toLocaleDateString()})`,
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

      // 2. Strict undefined-stripping before Firestore mutation
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
    <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-4 sm:p-6 lg:p-7 shadow-xs relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">
            Compose Reflection or Journal
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Express your thoughts freely. Gemini 3.6 Flash will read and provide mindful guidance, structured summaries, or creative brainstorming.
          </p>
        </div>

        {/* ThoughtStream Toggle Button */}
        <button
          type="button"
          id="thoughtstream-toggle-btn"
          onClick={() => setShowThoughtStream((prev) => !prev)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer self-start sm:self-auto ${
            showThoughtStream
              ? 'bg-amber-900 text-stone-50 border-amber-950 shadow-xs'
              : 'bg-white text-stone-800 border-stone-300 hover:bg-stone-100'
          }`}
        >
          <Mic className={`w-3.5 h-3.5 ${showThoughtStream ? 'text-amber-300' : 'text-amber-800'}`} />
          <span>ThoughtStream</span>
        </button>
      </div>

      {/* Inline ThoughtStream Continuous Audio-to-Text Panel */}
      {showThoughtStream && (
        <div className="mb-6">
          <ThoughtStream
            userId={userId}
            onCommitSuccess={() => {
              setShowThoughtStream(false);
              showToast('ThoughtStream committed to journal silently!');
              if (onThoughtStreamCommitted) onThoughtStreamCommitted();
            }}
            onClose={() => setShowThoughtStream(false)}
          />
        </div>
      )}

      {errorMessage && (
        <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Operation Notice</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          {pendingSaveData && (
            <button
              id="retry-save-btn"
              onClick={handleRetrySave}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Retry Save to Firestore
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Reflection Mode Selectors */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
            Select Reflection Style
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  id={`mode-btn-${m.id}`}
                  onClick={() => setMode(m.id)}
                  className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'border-amber-700 bg-amber-50/60 ring-1 ring-amber-700/20'
                      : 'border-stone-200 bg-stone-100/40 hover:bg-stone-100 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-800' : 'text-stone-500'}`} />
                    <span className={`text-xs font-semibold ${isSelected ? 'text-amber-900' : 'text-stone-800'}`}>
                      {m.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-snug">
                    {m.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Title */}
        <div>
          <label htmlFor="journal-title" className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
            Title (Optional)
          </label>
          <input
            id="journal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Reflections on Leadership & Patience"
            maxLength={120}
            className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 transition"
          />
        </div>

        {/* Journal Content Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor="journal-content" className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                Journal Entry / Reflection
              </label>
            </div>
            <span className="text-[11px] text-stone-400">
              {prompt.length} / 10,000 characters
            </span>
          </div>
          <textarea
            id="journal-content"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Write freely about your day, a dilemma, a realization, or an emotional hurdle..."
            maxLength={10000}
            className="w-full px-3.5 py-3 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 transition resize-y"
          />
        </div>

        {/* Action Buttons below textarea */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Challenge My Assumptions Button */}
          <button
            type="button"
            id="challenge-assumptions-editor-btn"
            onClick={() => setShowPerspectiveFlip(true)}
            disabled={!prompt.trim() || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Brain className="w-3.5 h-3.5 text-purple-700" />
            <span>Challenge My Assumptions</span>
          </button>

          {/* Inspiration Prompts Accordion */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <span className="text-[11px] text-stone-400 font-medium shrink-0">Prompts:</span>
            {SUGGESTED_PROMPTS.slice(0, 2).map((sample, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setPrompt(sample)}
                className="text-left text-[11px] px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 transition cursor-pointer truncate max-w-[220px]"
              >
                "{sample}"
              </button>
            ))}
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-200">
          <p className="text-[11px] text-stone-500 hidden sm:block">
            Auto-saved to your private Firestore database upon completion.
          </p>

          <button
            type="submit"
            id="submit-reflection-btn"
            disabled={loading || !prompt.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 font-medium text-sm hover:bg-stone-800 active:scale-[0.98] transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ml-auto"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                <span>Generating Reflection...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Reflect with Gemini</span>
                <Send className="w-3.5 h-3.5 text-stone-400 ml-1" />
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
