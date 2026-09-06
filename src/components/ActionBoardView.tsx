import React, { useState, useEffect } from 'react';
import { ActionBoard, ActionItem } from '../types';
import { db, handleFirestoreError, OperationType, sanitizePayload, auth } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import {
  CheckSquare,
  Square,
  Clock,
  Zap,
  Repeat,
  Sparkles,
  AlertCircle,
  Calendar,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  X,
  RefreshCw,
} from 'lucide-react';

interface ActionBoardViewProps {
  userId: string;
  interactionId: string;
  entryTitle: string;
  reflectionText: string;
  isOpen: boolean;
  onClose: () => void;
  onBoardSaved?: (board: ActionBoard) => void;
}

export const ActionBoardView: React.FC<ActionBoardViewProps> = ({
  userId,
  interactionId,
  entryTitle,
  reflectionText,
  isOpen,
  onClose,
  onBoardSaved,
}) => {
  const [board, setBoard] = useState<ActionBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<'urgency' | 'category'>('urgency');

  const boardId = `board_${interactionId}`;

  // Check if an action board already exists for this interaction
  useEffect(() => {
    if (!isOpen || !userId || !interactionId) return;

    let isMounted = true;
    const fetchExistingBoard = async () => {
      try {
        const docRef = doc(db, 'users', userId, 'action_boards', boardId);
        const snap = await getDoc(docRef);
        if (snap.exists() && isMounted) {
          setBoard(snap.data() as ActionBoard);
        } else if (isMounted) {
          generateActionBoard();
        }
      } catch (err) {
        console.warn('Error reading action board:', err);
        if (isMounted) generateActionBoard();
      }
    };

    fetchExistingBoard();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId, interactionId]);

  const generateActionBoard = async () => {
    if (!reflectionText?.trim()) {
      setErrorMsg('No reflection text provided to extract actions from.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : '';

      const res = await fetch('/api/extract-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId,
          interactionId,
          entryTitle,
          journalText: reflectionText,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Task extraction failed with status ${res.status}`);
      }

      const data = await res.json();
      const newBoard: ActionBoard = {
        id: boardId,
        userId,
        interactionId,
        entryTitle: entryTitle || 'Reflection Entry',
        actionItems: (data.actionItems || []).map((item: any, idx: number) => ({
          ...item,
          id: item.id || `task_${idx}_${Date.now()}`,
          completed: Boolean(item.completed),
        })),
        suggestedMicroHabit: data.suggestedMicroHabit || {
          habit: 'Set a 5-minute reflection timer each morning.',
          cue: 'After pouring morning coffee.',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Strict undefined stripping & save to /users/{userId}/action_boards/{boardId}
      const sanitized = sanitizePayload(newBoard);
      const docPath = `users/${userId}/action_boards/${boardId}`;

      try {
        await setDoc(doc(db, 'users', userId, 'action_boards', boardId), sanitized);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, docPath);
      }

      setBoard(newBoard);
      if (onBoardSaved) onBoardSaved(newBoard);
    } catch (err: any) {
      console.error('Task extraction error:', err);
      setErrorMsg(err?.message || 'Failed to extract actionable tasks.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    if (!board) return;

    const updatedItems = board.actionItems.map((item) =>
      item.id === taskId ? { ...item, completed: !item.completed } : item
    );

    const updatedBoard: ActionBoard = {
      ...board,
      actionItems: updatedItems,
      updatedAt: new Date().toISOString(),
    };

    setBoard(updatedBoard);

    try {
      const sanitized = sanitizePayload(updatedBoard);
      const docPath = `users/${userId}/action_boards/${boardId}`;
      await setDoc(doc(db, 'users', userId, 'action_boards', boardId), sanitized, { merge: true });
      if (onBoardSaved) onBoardSaved(updatedBoard);
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.UPDATE, `users/${userId}/action_boards/${boardId}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-stone-50 border border-stone-200 rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-100/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-900/10 text-blue-900 border border-blue-900/15 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
                Thought to Task: Action Board
              </h3>
              <p className="text-[11px] text-stone-500">
                Actionable atomic items & habit cues for "{entryTitle || 'Reflection'}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={generateActionBoard}
                className="px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-800" />
              <p className="font-semibold text-stone-800 text-sm">Synthesizing Actionable Tasks & Micro-Habits...</p>
              <p className="text-stone-500 text-xs max-w-sm">
                Parsing your journal entry into high-leverage atomic tasks categorized by effort and urgency.
              </p>
            </div>
          ) : board ? (
            <div className="space-y-5">
              {/* Micro-Habit Recommendation Card */}
              {board.suggestedMicroHabit && (
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs uppercase tracking-wider">
                    <Repeat className="w-4 h-4 text-amber-700" />
                    <span>Suggested Recurring Micro-Habit</span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-stone-900">
                    "{board.suggestedMicroHabit.habit}"
                  </p>
                  <div className="text-xs text-stone-600 bg-white/70 p-2 rounded-lg border border-amber-200/60 flex items-center gap-1.5">
                    <span className="font-semibold text-amber-900">Habit Cue:</span>
                    <span>{board.suggestedMicroHabit.cue}</span>
                  </div>
                </div>
              )}

              {/* View Filter Switcher */}
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Extracted Action Checklist ({board.actionItems.filter((i) => i.completed).length} / {board.actionItems.length} completed)
                </span>
                <div className="flex items-center gap-1 bg-stone-200/70 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setViewFilter('urgency')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      viewFilter === 'urgency' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600'
                    }`}
                  >
                    By Urgency
                  </button>
                  <button
                    onClick={() => setViewFilter('category')}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      viewFilter === 'category' ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-600'
                    }`}
                  >
                    By Category
                  </button>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-2.5">
                {board.actionItems.map((task) => {
                  const urgencyColors =
                    task.urgency === 'Today'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : task.urgency === 'This Week'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-stone-100 text-stone-700 border-stone-200';

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleToggleTask(task.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                        task.completed
                          ? 'bg-stone-100/60 border-stone-200 text-stone-400 opacity-80'
                          : 'bg-white border-stone-200/90 hover:border-blue-700/40 shadow-2xs'
                      }`}
                    >
                      <button
                        type="button"
                        className="mt-0.5 text-stone-500 hover:text-blue-800 transition"
                      >
                        {task.completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${urgencyColors}`}
                          >
                            {task.urgency}
                          </span>
                          <span className="text-[10px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                            {task.category}
                          </span>
                          <span className="text-[10px] text-stone-500 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {task.estimatedEffort}
                          </span>
                        </div>

                        <p
                          className={`text-xs sm:text-sm font-semibold text-stone-900 ${
                            task.completed ? 'line-through text-stone-500' : ''
                          }`}
                        >
                          {task.title}
                        </p>

                        {task.contextSnippet && (
                          <p className="text-[11px] text-stone-500 italic">
                            Origin: "{task.contextSnippet}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-100/50">
          <span className="text-[11px] text-stone-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Synced to <code>/users/&#123;uid&#125;/action_boards</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-900 text-stone-50 text-xs font-semibold hover:bg-stone-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
