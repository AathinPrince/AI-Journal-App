import React from 'react';
import { AppUser } from '../types';
import { logoutUser } from '../lib/firebase';
import { BookOpen, LogOut, PlusCircle, ShieldCheck } from 'lucide-react';

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
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 shadow-inner">
            <BookOpen className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-stone-100 tracking-tight">
                AI Journal & Reflection
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                <ShieldCheck className="w-3 h-3" /> Private & Encrypted
              </span>
            </div>
            <p className="text-[11px] text-stone-400 hidden sm:block">
              Warm reflective space powered by Cloud Firestore & Gemini
            </p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="new-entry-btn"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 active:scale-[0.98] transition shadow-md shadow-amber-950/40 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-stone-950" />
              <span>New Entry</span>
            </button>

            <div className="h-5 w-px bg-stone-800 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2.5 pl-1">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-stone-700 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-800 text-amber-300 border border-stone-700 font-bold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-stone-200 max-w-[140px] truncate">
                  {user.displayName || user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-stone-400 max-w-[140px] truncate">{user.email}</p>
              </div>

              <button
                id="sign-out-btn"
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 rounded-xl text-stone-400 hover:text-rose-300 hover:bg-rose-950/30 transition cursor-pointer border border-transparent hover:border-rose-900/30"
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
