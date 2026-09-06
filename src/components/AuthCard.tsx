import React, { useState } from 'react';
import { loginWithGoogle } from '../lib/firebase';
import { BookOpen, Shield, ArrowRight, AlertCircle, Sparkles, Mic, Compass } from 'lucide-react';

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
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg bg-stone-900/90 border border-stone-800/80 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <BookOpen className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight">
            AI Journal & Reflection
          </h2>
          <p className="text-sm text-stone-300 leading-relaxed max-w-sm mx-auto">
            A private, peaceful sanctuary to write, speak, and converse with Gemini AI against a warm golden horizon.
          </p>
        </div>

        {/* Feature Explanations for New Visitors */}
        <div className="my-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-stone-800/80">
          <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 text-center">
            <div className="w-7 h-7 mx-auto mb-1.5 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Compass className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-stone-200">Reflect & Chat</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Empathetic multi-turn dialogue with AI</p>
          </div>

          <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 text-center">
            <div className="w-7 h-7 mx-auto mb-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-stone-200">ThoughtStream</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Continuous hands-free voice capture</p>
          </div>

          <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 text-center">
            <div className="w-7 h-7 mx-auto mb-1.5 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-stone-200">Action & Reframes</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Automated habits and perspective shifts</p>
          </div>
        </div>

        {authError && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Authentication Notice</p>
              <p className="mt-0.5">{authError}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <button
            id="google-sign-in-btn"
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold transition shadow-lg shadow-amber-950/50 disabled:opacity-60 cursor-pointer text-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                Connecting securely to Google...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                <ArrowRight className="w-4 h-4 text-stone-950 ml-auto" />
              </>
            )}
          </button>

          <div className="pt-4 border-t border-stone-800/80 space-y-2 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-stone-300 font-medium">Privacy First:</strong> Your entries are strictly isolated in your Firestore database. Only you can read or write your journals.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
