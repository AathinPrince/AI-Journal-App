import React, { useState, useMemo } from 'react';
import { UserInteraction, ReflectionMode } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import {
  Search,
  Calendar,
  MessageSquare,
  Compass,
  ListChecks,
  Lightbulb,
  Trash2,
  ChevronRight,
  BookOpen,
  Mic,
  PlusCircle,
} from 'lucide-react';

interface EntryHistoryProps {
  entries: UserInteraction[];
  userId: string;
  onSelectEntry: (entry: UserInteraction) => void;
  onNewEntry: () => void;
  onEntryDeleted: (id: string) => void;
}

export const EntryHistory: React.FC<EntryHistoryProps> = ({
  entries,
  userId,
  onSelectEntry,
  onNewEntry,
  onEntryDeleted,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.response.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMode = selectedMode === 'all' || entry.mode === selectedMode;

      return matchesSearch && matchesMode;
    });
  }, [entries, searchTerm, selectedMode]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      setDeletingId(id);
      await deleteDoc(doc(db, 'users', userId, 'interactions', id));
      onEntryDeleted(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/interactions/${id}`);
    } finally {
      setDeletingId(null);
    }
  };

  const getModeBadge = (mode: ReflectionMode) => {
    switch (mode) {
      case 'thoughtstream':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-md">
            <Mic className="w-3 h-3 text-amber-400" /> ThoughtStream
          </span>
        );
      case 'summary':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 bg-blue-950/80 border border-blue-800/60 px-2 py-0.5 rounded-md">
            <ListChecks className="w-3 h-3 text-blue-400" /> Summary
          </span>
        );
      case 'brainstorm':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded-md">
            <Lightbulb className="w-3 h-3 text-amber-400" /> Brainstorm
          </span>
        );
      case 'converse':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-300 bg-purple-950/80 border border-purple-800/60 px-2 py-0.5 rounded-md">
            <MessageSquare className="w-3 h-3 text-purple-400" /> Dialogue
          </span>
        );
      case 'reflection':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-md">
            <Compass className="w-3 h-3 text-emerald-400" /> Reflection
          </span>
        );
    }
  };

  return (
    <div className="bg-stone-900/90 border border-stone-800/80 rounded-3xl p-5 sm:p-7 lg:p-8 shadow-2xl backdrop-blur-xl space-y-6">
      {/* Title & Explanatory Micro-Text */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-stone-100 tracking-tight">
              Past Journals & Dialogues
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700 font-semibold">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Search, review, and continue any past conversation. Click on any entry to resume chatting.
          </p>
        </div>

        <button
          onClick={onNewEntry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-stone-950" />
          <span>Write New Entry</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search entries by topic, thoughts, or AI response..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-800 bg-stone-950/70 text-stone-100 text-xs placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/80 transition"
          />
        </div>

        {/* Filter Pills with Clear Active State */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Modes' },
            { id: 'reflection', label: 'Reflection' },
            { id: 'thoughtstream', label: 'ThoughtStream' },
            { id: 'converse', label: 'Dialogue' },
            { id: 'summary', label: 'Summary' },
            { id: 'brainstorm', label: 'Brainstorm' },
          ].map((tab) => {
            const isSelected = selectedMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedMode(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-xs'
                    : 'bg-stone-950/60 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entries List Layout */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-stone-950/40 border border-stone-800/80">
          <BookOpen className="w-10 h-10 text-stone-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-stone-300">
            {entries.length === 0 ? 'Your journal is waiting for its first thought' : 'No reflections match your search'}
          </p>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            {entries.length === 0
              ? 'Start by typing your reflections or capturing your voice through ThoughtStream.'
              : 'Try clearing the search term or switching to "All Modes".'}
          </p>
          {entries.length === 0 && (
            <button
              onClick={onNewEntry}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold cursor-pointer"
            >
              Compose Reflection
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const messageCount = entry.messages?.length || 2;
            return (
              <div
                key={entry.id}
                onClick={() => onSelectEntry(entry)}
                className="group p-4 sm:p-5 rounded-2xl border border-stone-800/90 bg-stone-950/60 hover:bg-stone-850/80 hover:border-amber-500/40 transition cursor-pointer shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {getModeBadge(entry.mode)}
                      <h3 className="text-sm sm:text-base font-bold text-stone-100 group-hover:text-amber-200 transition truncate">
                        {entry.title || 'Untitled Reflection'}
                      </h3>
                      {messageCount > 2 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/60 font-medium">
                          {messageCount} turns
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-stone-300 line-clamp-2 leading-relaxed">
                      {entry.prompt}
                    </p>

                    <div className="flex items-center gap-4 mt-3 text-[11px] text-stone-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-stone-500" />
                        {new Date(entry.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span>•</span>
                      <span className="text-stone-400">
                        {new Date(entry.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-1">
                    <button
                      onClick={(e) => handleDelete(e, entry.id)}
                      disabled={deletingId === entry.id}
                      title="Delete Entry"
                      className="p-2 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="p-2 text-stone-500 group-hover:text-amber-300 group-hover:translate-x-0.5 transition">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
