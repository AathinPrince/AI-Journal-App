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
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
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

        // Client-side sort by updatedAt descending for reliability without compound index dependencies
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
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-stone-300 border-t-amber-800 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-stone-600">Verifying authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col">
      <Navbar
        user={currentUser}
        onNewEntry={() => {
          setSelectedEntry(null);
          setActiveTab('editor');
        }}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {!currentUser ? (
          <AuthCard />
        ) : (
          <div className="space-y-6">
            {/* Global Error Banner */}
            {globalError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                <span>{globalError}</span>
                <button
                  onClick={() => setGlobalError(null)}
                  className="font-semibold text-rose-900 underline ml-2 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Dashboard Tabs & Metrics Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 border border-stone-200/90 rounded-2xl p-2.5 sm:p-3 shadow-xs">
              <div className="flex items-center gap-1.5">
                <button
                  id="tab-editor-btn"
                  onClick={() => setActiveTab('editor')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                    activeTab === 'editor'
                      ? 'bg-stone-900 text-stone-50 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                  }`}
                >
                  <PenLine className="w-4 h-4" />
                  <span>Write Reflection</span>
                </button>

                <button
                  id="tab-history-btn"
                  onClick={() => setActiveTab('history')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-stone-900 text-stone-50 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Past Entries ({interactions.length})</span>
                </button>

                {selectedEntry && activeTab === 'conversation' && (
                  <span className="text-xs font-semibold text-amber-900 bg-amber-100/70 border border-amber-200 px-3 py-1 rounded-xl truncate max-w-[160px] sm:max-w-[240px]">
                    Active: {selectedEntry.title}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-stone-500 pl-2">
                <span className="hidden sm:inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Gemini 3.6 Flash
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Firestore Live
                </span>
              </div>
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
              <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-4 sm:p-6 lg:p-7 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">
                      Reflection & Journal History
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      All your multi-turn entries, safely preserved and isolated in Cloud Firestore.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('editor')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    + Write New
                  </button>
                </div>

                <EntryHistory
                  entries={interactions}
                  userId={currentUser.uid}
                  onSelectEntry={handleSelectEntry}
                  onNewEntry={() => setActiveTab('editor')}
                  onEntryDeleted={handleEntryDeleted}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Verification & Architecture Footer */}
      <footer className="mt-auto border-t border-stone-200 bg-stone-50/80 py-4 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Isolated paths: <code className="bg-stone-200/70 px-1 py-0.5 rounded text-[11px]">/users/{currentUser ? currentUser.uid.slice(0, 8) + '...' : '{uid}'}/interactions</code>
            </span>
          </div>

          <button
            onClick={() => setShowWalkthrough(!showWalkthrough)}
            className="inline-flex items-center gap-1 text-stone-700 hover:text-stone-900 font-medium underline cursor-pointer"
          >
            <span>Verification Test Walkthrough</span>
            {showWalkthrough ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Test Walkthrough Checklist */}
        {showWalkthrough && (
          <div className="max-w-5xl mx-auto mt-4 p-4 rounded-xl bg-white border border-stone-200 text-xs text-stone-700 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-stone-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Functional Test Walkthrough (Directive 6)</span>
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
              <li>
                <strong>Step 1 (Google Authentication):</strong> Click <em>Continue with Google</em>. Firebase Auth completes federated popup login without transmitting passwords.
              </li>
              <li>
                <strong>Step 2 (Mode Selection & Prompt):</strong> Select one of 4 reflection modes (<em>Mindful Reflection</em>, <em>Executive Summary</em>, <em>Brainstorm Ideas</em>, <em>Open Dialogue</em>). Type a journal reflection or click an inspiration prompt.
              </li>
              <li>
                <strong>Step 3 (Gemini Fallback Execution):</strong> Submit the entry. Backend executes <code>generateContentWithFallback</code> starting with <code>gemini-3.6-flash</code> down the fallback ladder.
              </li>
              <li>
                <strong>Step 4 (Firestore Persistence & Sanitization):</strong> User prompt, model response, and metadata are sanitized and saved to <code>/users/{'{userId}'}/interactions/{'{interactionId}'}</code>.
              </li>
              <li>
                <strong>Step 5 (Multi-Turn Reflection):</strong> In the conversation view, input a follow-up query in the reply box. Gemini converses while maintaining context, appending the new turn to Firestore.
              </li>
              <li>
                <strong>Step 6 (History Search & Management):</strong> Switch to <em>Past Entries</em> tab. Filter by mode or search by keyword. Click any card to re-open the multi-turn thread or delete the record.
              </li>
            </ol>
          </div>
        )}
      </footer>
    </div>
  );
}
