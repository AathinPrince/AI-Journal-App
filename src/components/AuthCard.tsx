import React, { useState } from 'react';
import { loginWithGoogle } from '../lib/firebase';
import { BookOpen, Sparkles, Shield, Database, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface AuthCardProps {
  onSuccess?: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      // User cancelled popup or popup was blocked
      if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in was cancelled. Please try again when ready.');
      } else {
        setAuthError(err?.message || 'Unable to complete Google Sign-In. Please check pop-up settings.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-stone-100/50">
      <div className="w-full max-w-md bg-stone-50 border border-stone-200/80 rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-700/10 border border-amber-800/15 flex items-center justify-center text-amber-800">
            <BookOpen className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-semibold text-stone-900 tracking-tight">
            AI Journal & Reflection
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            A private, reflective space to write your thoughts and converse with Gemini 3.6 Flash.
          </p>
        </div>

        {authError && (
          <div className="mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Authentication Notice</p>
              <p className="mt-0.5 text-rose-700">{authError}</p>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <button
            id="google-sign-in-btn"
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-stone-900 text-stone-50 font-medium hover:bg-stone-800 active:scale-[0.99] transition shadow-xs disabled:opacity-60 cursor-pointer text-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-stone-400 border-t-stone-100 rounded-full animate-spin" />
                Connecting to Google...
              </span>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.54 0 2.93.53 4.02 1.57l3.01-3.01C17.21 1.76 14.81 1 12 1 7.51 1 3.73 3.56 1.87 7.27l3.66 2.84C6.41 7.23 8.97 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-1.99 3.71-4.93 3.71-8.7z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.53 14.89c-.23-.68-.36-1.41-.36-2.16s.13-1.48.36-2.16L1.87 7.73C1.1 9.27.67 11.01.67 12.87s.43 3.6 1.2 5.14l3.66-3.12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.07.72-2.45 1.16-4.22 1.16-3.03 0-5.59-2.23-6.47-5.11L1.87 16.1C3.73 19.81 7.51 23 12 23z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 text-stone-400 ml-auto" />
              </>
            )}
          </button>

          <div className="pt-4 border-t border-stone-200/70 space-y-2.5 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                <strong className="text-stone-700 font-medium">Privacy Guaranteed:</strong> No passwords handled directly. Authentication is delegated to Google Identity.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                <strong className="text-stone-700 font-medium">User Isolation:</strong> Firestore rules enforce strict owner-bound paths (<code className="text-[11px] bg-stone-200/60 px-1 py-0.5 rounded">/users/&#123;uid&#125;</code>).
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>
                <strong className="text-stone-700 font-medium">Gemini AI:</strong> Multi-turn reflections, executive summaries, and brainstorming ideas.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
