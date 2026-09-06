import React, { useState, useMemo } from 'react';
import { UserInteraction, ReflectionMode } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import {
  Search,
  Filter,
  Calendar,
  MessageSquare,
  Compass,
  ListChecks,
  Lightbulb,
  Trash2,
  ChevronRight,
  BookOpen,
  Mic,
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
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
            <Mic className="w-3 h-3 text-amber-700" /> ThoughtStream
          </span>
        );
      case 'summary':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md">
            <ListChecks className="w-3 h-3" /> Summary
          </span>
        );
      case 'brainstorm':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
            <Lightbulb className="w-3 h-3" /> Brainstorm
          </span>
        );
      case 'converse':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 bg-purple-50 border border-purple-200/80 px-2 py-0.5 rounded-md">
            <MessageSquare className="w-3 h-3" /> Dialogue
          </span>
        );
      case 'reflection':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
            <Compass className="w-3 h-3" /> Reflection
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-history-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search past reflections and summaries..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider pl-1">
            Filter:
          </span>
          {['all', 'reflection', 'summary', 'brainstorm', 'converse', 'thoughtstream'].map((m) => (
            <button
              key={m}
              id={`filter-${m}-btn`}
              onClick={() => setSelectedMode(m)}
              className={`text-xs px-2.5 py-1 rounded-lg capitalize font-medium transition cursor-pointer shrink-0 ${
                selectedMode === m
                  ? 'bg-stone-900 text-stone-50'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70 border border-stone-200/60'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-stone-50 border border-dashed border-stone-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-amber-800/10 text-amber-800 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-800">
              {searchTerm || selectedMode !== 'all'
                ? 'No matching entries found'
                : 'No reflections logged yet'}
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
              {searchTerm || selectedMode !== 'all'
                ? 'Try clearing your search term or mode filter.'
                : 'Write your first journal entry to receive guidance and reflections from Gemini.'}
            </p>
          </div>
          <button
            onClick={onNewEntry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-stone-900 text-stone-50 hover:bg-stone-800 transition cursor-pointer"
          >
            Start First Reflection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredEntries.map((entry) => {
            const formattedDate = new Date(entry.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const turnCount = entry.messages ? Math.floor(entry.messages.length / 2) : 1;

            return (
              <div
                key={entry.id}
                id={`history-item-${entry.id}`}
                onClick={() => onSelectEntry(entry)}
                className="group bg-stone-50 hover:bg-stone-100/80 border border-stone-200/90 hover:border-amber-700/30 rounded-xl p-4 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {getModeBadge(entry.mode)}
                      <span className="text-[11px] text-stone-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formattedDate}
                      </span>
                      {turnCount > 1 && (
                        <span className="text-[10px] text-stone-500 bg-stone-200/60 px-1.5 py-0.5 rounded">
                          {turnCount} dialogue turns
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm sm:text-base font-semibold text-stone-900 tracking-tight group-hover:text-amber-900 transition truncate">
                      {entry.title || 'Untitled Journal Entry'}
                    </h4>

                    <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                      {entry.prompt}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-1">
                    <button
                      onClick={(e) => handleDelete(e, entry.id)}
                      disabled={deletingId === entry.id}
                      title="Delete entry from Firestore"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 group-hover:translate-x-0.5 transition" />
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
