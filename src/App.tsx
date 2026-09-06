import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db, testConnection, handleFirestoreError, OperationType } from './lib/firebase';
import { AppUser, UserInteraction } from './types';
import { Navbar } from './components/Navbar';
import { AuthCard } from './components/AuthCard';
import { JournalEditor } from './components/JournalEditor';
import { ConversationView } from './components/ConversationView';
import { EntryHistory } from './components/EntryHistory';
import {
  PenLine,
  History,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Mic,
  MessageSquare,
  BookOpen,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [interactions, setInteractions] = useState<UserInteraction[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'conversation'>('editor');
  const [selectedEntry, setSelectedEntry] = useState<UserInteraction | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  // 1. Initialize Firebase Auth listener & Firestore connectivity check
  useEffect(() => {
    testConnection().then((connected) => setDbConnected(connected));

    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser: User | null) => {
      if (fbUser) {
        setCurrentUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        });
      } else {
        setCurrentUser(null);
        setInteractions([]);
        setSelectedEntry(null);
        setActiveTab('editor');
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-time Firestore sync for user's interactions (isolated to current user)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const userInteractionsPath = `users/${currentUser.uid}/interactions`;
    const collRef = collection(db, 'users', currentUser.uid, 'interactions');

    const unsubscribeSnapshot = onSnapshot(
      collRef,
      (snapshot) => {
        const items: UserInteraction[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as UserInteraction;
          items.push({
            ...data,
            id: docSnap.id,
          });
        });

        // Client-side sort by updatedAt descending
        items.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        );

        setInteractions(items);

        // Keep selected entry in sync if active
        if (selectedEntry) {
          const fresh = items.find((i) => i.id === selectedEntry.id);
          if (fresh) setSelectedEntry(fresh);
        }
      },
      (error) => {
        console.error('Snapshot listener error:', error);
        handleFirestoreError(error, OperationType.LIST, userInteractionsPath);
      }
    );

    return () => unsubscribeSnapshot();
  }, [currentUser?.uid, selectedEntry?.id]);

  const handleEntryCreated = (newEntry: UserInteraction) => {
    setSelectedEntry(newEntry);
    setActiveTab('conversation');
  };

  const handleSelectEntry = (entry: UserInteraction) => {
    setSelectedEntry(entry);
    setActiveTab('conversation');
  };

  const handleEntryDeleted = (id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
      setActiveTab('history');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-4 text-stone-100">
        <div className="w-12 h-12 border-3 border-stone-800 border-t-amber-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-stone-300">Entering your journal sanctuary...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col relative selection:bg-amber-500/30 selection:text-amber-200 font-sans">
      {/* Warm Golden Fields Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <img
          src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2000&auto=format&fit=crop"
          alt="Warm golden field at sunset"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-105 filter brightness-[0.38] saturate-[1.25]"
        />
        {/* Warm Amber-Dark Vignette Overlay for perfect readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/85 via-stone-950/80 to-stone-950/95 backdrop-blur-[2px]" />
      </div>

      <Navbar
        user={currentUser}
        onNewEntry={() => {
          setSelectedEntry(null);
          setActiveTab('editor');
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {!currentUser ? (
          <AuthCard />
        ) : (
          <div className="space-y-6">
            {/* Global Error Banner */}
            {globalError && (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center justify-between">
                <span>{globalError}</span>
                <button
                  onClick={() => setGlobalError(null)}
                  className="font-bold text-rose-200 underline ml-2 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Feature Overview Strip: visible guidance explaining chat, speech, & modes */}
            <div className="p-4 rounded-3xl bg-stone-900/90 border border-stone-800/80 shadow-lg backdrop-blur-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-stone-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    <span>Journal Workspace & Capabilities</span>
                  </h2>
                  <p className="text-xs text-stone-300 mt-0.5">
                    Visibly understand how each feature works below to reflect, speak, or chat effortlessly:
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-stone-400">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-950 border border-stone-800 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Gemini 3.6 Flash
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Firestore Sync
                  </span>
                </div>
              </div>

              {/* 3 Clear Feature Explainers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <div className="p-3 rounded-2xl bg-stone-950/60 border border-stone-800/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
                    <Compass className="w-3.5 h-3.5 text-amber-400" />
                    <span>How to Reflect: 4 Modes</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    Choose from <strong>Mindful</strong> (empathy & inquiry), <strong>Summary</strong> (bullet points), <strong>Brainstorm</strong> (creative solutions), or <strong>Dialogue</strong> (sounding board).
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-stone-950/60 border border-stone-800/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
                    <Mic className="w-3.5 h-3.5 text-amber-400" />
                    <span>How to Speak: ThoughtStream</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    Click <strong>Speak: ThoughtStream</strong>. Speak freely with continuous recording that never cuts out on pauses. Automatically summarized when paused.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-stone-950/60 border border-stone-800/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    <span>How to Chat: Multi-Turn</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    After any entry is created, type in the bottom reply box to continue talking with Gemini while maintaining your full reflection context.
                  </p>
                </div>
              </div>
            </div>

            {/* Dashboard Navigation Tabs: Easy to distinguish buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/90 border border-stone-800/80 rounded-2xl p-2 sm:p-2.5 shadow-md backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <button
                  id="tab-editor-btn"
                  onClick={() => setActiveTab('editor')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    activeTab === 'editor'
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/40'
                      : 'bg-stone-950/60 text-stone-300 hover:text-stone-100 hover:bg-stone-800 border border-stone-800'
                  }`}
                >
                  <PenLine className="w-4 h-4" />
                  <span>Write Reflection</span>
                </button>

                <button
                  id="tab-history-btn"
                  onClick={() => setActiveTab('history')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/40'
                      : 'bg-stone-950/60 text-stone-300 hover:text-stone-100 hover:bg-stone-800 border border-stone-800'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Past Journals ({interactions.length})</span>
                </button>

                {selectedEntry && activeTab === 'conversation' && (
                  <span className="text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-3 py-1.5 rounded-xl truncate max-w-[180px] sm:max-w-[280px]">
                    Active: {selectedEntry.title}
                  </span>
                )}
              </div>

              {selectedEntry && activeTab !== 'conversation' && (
                <button
                  onClick={() => setActiveTab('conversation')}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer px-2"
                >
                  Resume Active Conversation →
                </button>
              )}
            </div>

            {/* Main Content Area */}
            {activeTab === 'editor' && (
              <JournalEditor
                userId={currentUser.uid}
                onEntryCreated={handleEntryCreated}
                onThoughtStreamCommitted={() => {}}
              />
            )}

            {activeTab === 'conversation' && selectedEntry && (
              <ConversationView
                entry={selectedEntry}
                userId={currentUser.uid}
                onBack={() => setActiveTab('history')}
                onEntryUpdated={(updated) => setSelectedEntry(updated)}
                onEntryDeleted={handleEntryDeleted}
              />
            )}

            {activeTab === 'history' && (
              <EntryHistory
                entries={interactions}
                userId={currentUser.uid}
                onSelectEntry={handleSelectEntry}
                onNewEntry={() => setActiveTab('editor')}
                onEntryDeleted={handleEntryDeleted}
              />
            )}
          </div>
        )}
      </main>

      {/* Verification & Architecture Footer */}
      <footer className="mt-auto border-t border-stone-800/80 bg-stone-950/90 py-4 px-4 sm:px-6 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Isolated user path: <code className="bg-stone-900 border border-stone-800 px-1.5 py-0.5 rounded text-[11px] text-amber-300 font-mono">/users/{currentUser ? currentUser.uid.slice(0, 8) + '...' : '{uid}'}/interactions</code>
            </span>
          </div>

          <button
            onClick={() => setShowWalkthrough(!showWalkthrough)}
            className="inline-flex items-center gap-1 text-stone-300 hover:text-amber-300 font-medium underline cursor-pointer"
          >
            <span>Verification Test Walkthrough</span>
            {showWalkthrough ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Test Walkthrough Checklist */}
        {showWalkthrough && (
          <div className="max-w-6xl mx-auto mt-4 p-5 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-stone-300 space-y-3 shadow-xl">
            <div className="flex items-center gap-2 font-bold text-stone-100 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Functional Test Walkthrough</span>
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed text-stone-300">
              <li>
                <strong>Step 1 (Google Authentication):</strong> Click <em>Continue with Google</em>. Firebase Auth completes federated popup login without custom password handling.
              </li>
              <li>
                <strong>Step 2 (Mode Selection & Prompt):</strong> Select one of 4 reflection modes (<em>Mindful Reflection</em>, <em>Executive Summary</em>, <em>Brainstorm Ideas</em>, <em>Open Dialogue</em>). Type a journal reflection or click an inspiration prompt.
              </li>
              <li>
                <strong>Step 3 (ThoughtStream Speech):</strong> Click <em>Speak: ThoughtStream</em>, grant mic access, and speak continuously. Click <em>Pause Stream</em> to commit the synthesized summary to your journal.
              </li>
              <li>
                <strong>Step 4 (Gemini Fallback Execution):</strong> Submit your entry. Backend executes <code>generateContentWithFallback</code> starting with <code>gemini-3.6-flash</code> down the fallback ladder.
              </li>
              <li>
                <strong>Step 5 (Firestore Persistence & Sanitization):</strong> User prompt, model response, and metadata are sanitized and saved to <code>/users/{'{userId}'}/interactions/{'{interactionId}'}</code>.
              </li>
              <li>
                <strong>Step 6 (Multi-Turn Chat Dialogue):</strong> In the conversation view, input a follow-up query in the reply box. Gemini converses while maintaining context, appending each turn to Firestore.
              </li>
              <li>
                <strong>Step 7 (Action Board & Perspective Flip):</strong> Open the <em>Action Plan</em> to inspect extracted tasks and recurring habits, or <em>Perspective Flip</em> to challenge cognitive distortions.
              </li>
            </ol>
          </div>
        )}
      </footer>
    </div>
  );
}
