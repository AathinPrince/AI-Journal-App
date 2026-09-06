import React, { useState } from 'react';
import { UserInteraction, ChatMessage } from '../types';
import { db, handleFirestoreError, OperationType, sanitizePayload } from '../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles,
  User,
  ArrowLeft,
  Send,
  Trash2,
  Copy,
  Check,
  Calendar,
  Compass,
  ListChecks,
  Lightbulb,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Brain,
  CheckSquare,
  Mic,
} from 'lucide-react';
import { PerspectiveFlipModal } from './PerspectiveFlipModal';
import { ActionBoardView } from './ActionBoardView';

interface ConversationViewProps {
  entry: UserInteraction;
  userId: string;
  onBack: () => void;
  onEntryUpdated: (updatedEntry: UserInteraction) => void;
  onEntryDeleted: (id: string) => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  entry,
  userId,
  onBack,
  onEntryUpdated,
  onEntryDeleted,
}) => {
  const [followUp, setFollowUp] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPerspectiveFlip, setShowPerspectiveFlip] = useState(false);
  const [showActionBoard, setShowActionBoard] = useState(false);

  // Normalize messages: ensure legacy or single-turn entries display cleanly as messages
  const messages: ChatMessage[] =
    entry.messages && entry.messages.length > 0
      ? entry.messages
      : [
          {
            id: 'm_prompt',
            role: 'user',
            content: entry.prompt,
            timestamp: entry.createdAt,
          },
          {
            id: 'm_resp',
            role: 'model',
            content: entry.response,
            timestamp: entry.createdAt,
          },
        ];

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFollowUp = followUp.trim();
    if (!cleanFollowUp || loading) return;

    setLoading(true);
    setErrorMsg(null);

    const nowIso = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: cleanFollowUp,
      timestamp: nowIso,
    };

    const conversationContext = [...messages, userMsg];

    try {
      // 1. Send conversation history to backend proxy
      const response = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanFollowUp,
          mode: entry.mode || 'converse',
          messages: conversationContext.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      const newResponseText: string = data.response;

      const modelMsg: ChatMessage = {
        id: `msg_${Date.now()}_model`,
        role: 'model',
        content: newResponseText,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...conversationContext, modelMsg];

      const updatedEntry: UserInteraction = {
        ...entry,
        response: newResponseText,
        messages: updatedMessages,
        updatedAt: nowIso,
      };

      // 2. Strict undefined-stripping & Firestore atomic update
      const sanitized = sanitizePayload(updatedEntry);
      const docPath = `users/${userId}/interactions/${entry.id}`;

      try {
        await setDoc(doc(db, 'users', userId, 'interactions', entry.id), sanitized, { merge: true });
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.UPDATE, docPath);
      }

      setFollowUp('');
      onEntryUpdated(updatedEntry);
    } catch (err: any) {
      console.error('Follow-up error:', err);
      setErrorMsg(err?.message || 'Failed to send follow-up reflection.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const docPath = `users/${userId}/interactions/${entry.id}`;
      await deleteDoc(doc(db, 'users', userId, 'interactions', entry.id));
      onEntryDeleted(entry.id);
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.DELETE, `users/${userId}/interactions/${entry.id}`);
    }
  };

  const handleCopy = () => {
    const textToCopy = messages
      .map((m) => `[${m.role.toUpperCase()}]:\n${m.content}\n`)
      .join('\n---\n\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getModeIcon = () => {
    switch (entry.mode) {
      case 'thoughtstream':
        return <Mic className="w-3.5 h-3.5 text-amber-700" />;
      case 'summary':
        return <ListChecks className="w-3.5 h-3.5 text-blue-700" />;
      case 'brainstorm':
        return <Lightbulb className="w-3.5 h-3.5 text-amber-700" />;
      case 'converse':
        return <MessageSquare className="w-3.5 h-3.5 text-purple-700" />;
      case 'reflection':
      default:
        return <Compass className="w-3.5 h-3.5 text-emerald-700" />;
    }
  };

  const formattedDate = new Date(entry.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
        <button
          id="back-to-journal-btn"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200/80 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Editor / History</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Challenge My Assumptions Button */}
          <button
            type="button"
            id="challenge-assumptions-header-btn"
            onClick={() => setShowPerspectiveFlip(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition cursor-pointer"
          >
            <Brain className="w-3.5 h-3.5 text-purple-700" />
            <span>Challenge My Assumptions</span>
          </button>

          {/* Extract Action Plan Button */}
          <button
            type="button"
            id="extract-action-plan-header-btn"
            onClick={() => setShowActionBoard(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-700" />
            <span>Extract Action Plan</span>
          </button>

          <button
            onClick={handleCopy}
            title="Copy reflection thread"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          {showDeleteConfirm ? (
            <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg p-1">
              <span className="text-[11px] text-rose-800 px-1 font-medium">Delete?</span>
              <button
                id="confirm-delete-btn"
                onClick={handleDelete}
                className="px-2 py-0.5 rounded text-[11px] bg-rose-600 text-white font-medium hover:bg-rose-700 transition cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-0.5 rounded text-[11px] text-stone-600 hover:bg-stone-200 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              id="delete-entry-btn"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete this entry from Firestore"
              className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Entry Metadata & Title */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-200/80 text-stone-800">
            {getModeIcon()}
            <span className="capitalize">{entry.mode || 'Reflection'}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <Calendar className="w-3 h-3" />
            {formattedDate}
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
          {entry.title || 'Journal Reflection'}
        </h2>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Thread Messages */}
      <div className="space-y-4">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id || index}
              className={`flex gap-3 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-amber-900/10 text-amber-900 flex items-center justify-center shrink-0 mt-1 border border-amber-900/15 shadow-2xs">
                  <Sparkles className="w-4 h-4 text-amber-800" />
                </div>
              )}

              <div
                className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-4 sm:p-5 shadow-xs leading-relaxed text-sm ${
                  isUser
                    ? 'bg-stone-900 text-stone-50 rounded-tr-xs'
                    : 'bg-stone-50 border border-stone-200/90 text-stone-900 rounded-tl-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1.5 pb-1 border-b border-stone-200/30 text-[11px]">
                  <span className={`font-semibold ${isUser ? 'text-stone-300' : 'text-stone-700'}`}>
                    {isUser ? 'You' : 'Gemini 3.6 Flash'}
                  </span>
                  <span className={isUser ? 'text-stone-400' : 'text-stone-400'}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-stone prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-li:my-0.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-stone-200 text-stone-700 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 sm:gap-4 justify-start">
            <div className="w-8 h-8 rounded-xl bg-amber-900/10 text-amber-900 flex items-center justify-center shrink-0 mt-1 border border-amber-900/15 animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-800" />
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 rounded-tl-xs flex items-center gap-2.5 text-xs text-stone-600">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
              <span>Gemini is synthesizing thoughts...</span>
            </div>
          </div>
        )}
      </div>

      {/* Reply / Follow-up Input */}
      <form onSubmit={handleSendFollowUp} className="bg-stone-50 border border-stone-200 rounded-2xl p-3 sm:p-4 shadow-xs">
        <label htmlFor="followup-input" className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
          Continue Reflection Thread
        </label>
        <div className="flex gap-2">
          <input
            id="followup-input"
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ask for clarification, dig deeper, or explore an alternative perspective..."
            disabled={loading}
            maxLength={3000}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 transition"
          />
          <button
            type="submit"
            id="send-followup-btn"
            disabled={loading || !followUp.trim()}
            className="px-4 py-2.5 rounded-xl bg-stone-900 text-stone-50 font-medium text-xs sm:text-sm hover:bg-stone-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reply</span>
          </button>
        </div>
      </form>

      {/* Perspective Flip Modal */}
      {showPerspectiveFlip && (
        <PerspectiveFlipModal
          isOpen={showPerspectiveFlip}
          onClose={() => setShowPerspectiveFlip(false)}
          userId={userId}
          interactionId={entry.id}
          reflectionText={entry.prompt + (entry.response ? `\n\n${entry.response}` : '')}
          entryTitle={entry.title}
        />
      )}

      {/* Action Board View */}
      {showActionBoard && (
        <ActionBoardView
          isOpen={showActionBoard}
          onClose={() => setShowActionBoard(false)}
          userId={userId}
          interactionId={entry.id}
          entryTitle={entry.title}
          reflectionText={entry.prompt + (entry.response ? `\n\n${entry.response}` : '')}
        />
      )}
    </div>
  );
};
