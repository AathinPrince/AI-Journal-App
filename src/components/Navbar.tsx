import React from 'react';
import { AppUser } from '../types';
import { logoutUser } from '../lib/firebase';
import { BookOpen, LogOut, Sparkles, PlusCircle, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  user: AppUser | null;
  onNewEntry: () => void;
  onOpenHistory?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onNewEntry }) => {
  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-700/10 text-amber-800 flex items-center justify-center border border-amber-800/15 shadow-xs">
            <BookOpen className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold text-stone-900 tracking-tight">
                AI Journal & Reflection
              </h1>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3" /> User-Isolated
              </span>
            </div>
            <p className="text-xs text-stone-500 hidden sm:block">
              Private journaling backed by Cloud Firestore & Gemini
            </p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="new-entry-btn"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-stone-900 text-stone-50 hover:bg-stone-800 active:scale-98 transition shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-amber-400" />
              <span>New Entry</span>
            </button>

            <div className="h-5 w-px bg-stone-200 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2.5 pl-1">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-stone-300 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 font-semibold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-medium text-stone-800 max-w-[140px] truncate">
                  {user.displayName || user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-stone-500 max-w-[140px] truncate">{user.email}</p>
              </div>

              <button
                id="sign-out-btn"
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
