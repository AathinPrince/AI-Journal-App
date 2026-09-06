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
  Info,
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to receive conversation reply.');
      }

      const resData = await response.json();
      const modelReplyText: string = resData.response || '';

      const modelMsg: ChatMessage = {
        id: `msg_${Date.now()}_model`,
        role: 'model',
        content: modelReplyText,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...conversationContext, modelMsg];
      const updatedEntry: UserInteraction = {
        ...entry,
        response: modelReplyText,
        messages: updatedMessages,
        updatedAt: new Date().toISOString(),
      };

      const sanitized = sanitizePayload(updatedEntry);
      const docPath = `users/${userId}/interactions/${entry.id}`;

      try {
        await setDoc(doc(db, 'users', userId, 'interactions', entry.id), sanitized);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.UPDATE, docPath);
      }

      setFollowUp('');
      onEntryUpdated(updatedEntry);
    } catch (err: any) {
      console.error('Follow-up error:', err);
      setErrorMsg(err?.message || 'Could not send reply. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      const docPath = `users/${userId}/interactions/${entry.id}`;
      await deleteDoc(doc(db, 'users', userId, 'interactions', entry.id));
      onEntryDeleted(entry.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/interactions/${entry.id}`);
    }
  };

  const getModeIcon = () => {
    switch (entry.mode) {
      case 'thoughtstream':
        return <Mic className="w-3.5 h-3.5 text-amber-400" />;
      case 'summary':
        return <ListChecks className="w-3.5 h-3.5 text-blue-400" />;
      case 'brainstorm':
        return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />;
      case 'converse':
        return <MessageSquare className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Compass className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="bg-stone-900/90 border border-stone-800/80 rounded-3xl p-5 sm:p-7 lg:p-8 shadow-2xl backdrop-blur-xl space-y-6">
      {/* Navigation & Header Layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-800/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/70 hover:bg-stone-800 text-stone-300 hover:text-stone-100 transition cursor-pointer"
            title="Back to Journal History"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-stone-100 tracking-tight">
                {entry.title || 'Journal Conversation'}
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-500/30 px-2 py-0.5 rounded-md">
                {getModeIcon()}
                <span className="capitalize">{entry.mode || 'reflection'}</span>
              </span>
            </div>
            <p className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3 h-3 text-stone-500" />
              <span>Created {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons with High Distinction */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action Board (Tasks & Habits Extractor) */}
          <button
            type="button"
            id="open-action-board-btn"
            onClick={() => setShowActionBoard(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60 text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Action Plan</span>
          </button>

          {/* Perspective Flip Button */}
          <button
            type="button"
            id="open-perspective-flip-btn"
            onClick={() => setShowPerspectiveFlip(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-950/70 text-purple-300 border border-purple-800/60 hover:bg-purple-900/60 text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span>Perspective Flip</span>
          </button>

          {/* Delete Action */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-xl border border-stone-800 text-stone-400 hover:text-rose-400 hover:bg-rose-950/40 hover:border-rose-900/50 transition cursor-pointer"
            title="Delete this entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Feature Explanation Banner */}
      <div className="p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800/80 flex items-start gap-2.5 text-xs text-stone-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-amber-300 font-semibold">How to Chat:</strong> Gemini remembers the context of your original journal entry and past responses. Type in the reply box at the bottom to continue exploring your thoughts, ask for reframing, or ask for guidance.
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800/70 text-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Permanently delete this entry from your private Firestore database?</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-xl border border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteEntry}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 underline font-semibold cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Conversation Thread Messages */}
      <div className="space-y-4">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id || index}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-stone-400 mb-1 px-1">
                {isUser ? (
                  <>
                    <span>You</span>
                    <User className="w-3 h-3 text-stone-400" />
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300 font-semibold">Gemini 3.6 Flash</span>
                  </>
                )}
                <span>•</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div
                className={`max-w-3xl rounded-2xl p-4 sm:p-5 shadow-sm ${
                  isUser
                    ? 'bg-amber-500/15 border border-amber-500/30 text-stone-100'
                    : 'bg-stone-950/80 border border-stone-800 text-stone-200'
                }`}
              >
                {isUser ? (
                  <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                ) : (
                  <div className="text-xs sm:text-sm leading-relaxed space-y-2 prose prose-invert prose-stone max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    <div className="flex items-center justify-end pt-2 border-t border-stone-800/80">
                      <button
                        onClick={() => handleCopyText(msg.content)}
                        className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-amber-300 transition cursor-pointer"
                        title="Copy response text"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-Turn Reply Form */}
      <form onSubmit={handleSendFollowUp} className="pt-4 border-t border-stone-800/80">
        <label htmlFor="follow-up-input" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5">
          Continue The Conversation
        </label>
        <p className="text-xs text-stone-400 mb-2">
          Ask Gemini follow-up questions, request deeper exploration of an emotion, or seek tangible next steps.
        </p>
        <div className="flex gap-2.5">
          <textarea
            id="follow-up-input"
            rows={3}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Type your response to continue this reflection thread..."
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-2xl border border-stone-800 bg-stone-950/70 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/80 transition resize-none font-normal"
          />
          <button
            type="submit"
            id="send-reply-btn"
            disabled={loading || !followUp.trim()}
            className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex flex-col items-center justify-center gap-1 transition shadow-lg shadow-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-stone-950" />
            ) : (
              <>
                <Send className="w-4 h-4 text-stone-950" />
                <span>Send</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Modals */}
      {showPerspectiveFlip && (
        <PerspectiveFlipModal
          isOpen={showPerspectiveFlip}
          onClose={() => setShowPerspectiveFlip(false)}
          userId={userId}
          interactionId={entry.id}
          reflectionText={entry.prompt}
          entryTitle={entry.title}
        />
      )}

      {showActionBoard && (
        <ActionBoardView
          isOpen={showActionBoard}
          onClose={() => setShowActionBoard(false)}
          userId={userId}
          interactionId={entry.id}
          entryTitle={entry.title}
          reflectionText={entry.prompt}
        />
      )}
    </div>
  );
};
