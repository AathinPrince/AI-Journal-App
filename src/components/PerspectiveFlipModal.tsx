import React, { useState, useEffect } from 'react';
import { PerspectiveFlipResult } from '../types';
import { db, handleFirestoreError, OperationType, sanitizePayload, auth } from '../lib/firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import {
  Brain,
  X,
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  Compass,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface PerspectiveFlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  interactionId: string;
  reflectionText: string;
  entryTitle?: string;
}

export const PerspectiveFlipModal: React.FC<PerspectiveFlipModalProps> = ({
  isOpen,
  onClose,
  userId,
  interactionId,
  reflectionText,
  entryTitle,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PerspectiveFlipResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId || !interactionId) return;

    let isMounted = true;
    const loadExistingAnalysis = async () => {
      try {
        const snap = await getDocs(collection(db, 'users', userId, 'interactions', interactionId, 'biases'));
        if (!snap.empty && isMounted) {
          const firstDoc = snap.docs[0].data() as PerspectiveFlipResult;
          setResult(firstDoc);
        } else if (isMounted) {
          runPerspectiveAnalysis();
        }
      } catch (err) {
        console.warn('Could not read existing bias analysis:', err);
        if (isMounted) runPerspectiveAnalysis();
      }
    };

    loadExistingAnalysis();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId, interactionId]);

  const runPerspectiveAnalysis = async () => {
    if (!reflectionText?.trim()) {
      setErrorMsg('No reflection text provided to analyze.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : '';

      const response = await fetch('/api/perspective-flip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId,
          interactionId,
          reflectionText,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Analysis failed with status ${response.status}`);
      }

      const data = await response.json();
      const analysisData: PerspectiveFlipResult = {
        id: data.id || `bias_${Date.now()}`,
        interactionId,
        userId,
        empathicSynthesis: data.empathicSynthesis || '',
        detectedBiases: data.detectedBiases || [],
        socraticProbes: data.socraticProbes || [],
        reframedPerspective: data.reframedPerspective || '',
        createdAt: new Date().toISOString(),
      };

      const sanitized = sanitizePayload(analysisData);
      const docPath = `users/${userId}/interactions/${interactionId}/biases/${analysisData.id}`;

      try {
        await setDoc(
          doc(db, 'users', userId, 'interactions', interactionId, 'biases', analysisData.id!),
          sanitized
        );
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, docPath);
      }

      setResult(analysisData);
    } catch (err: any) {
      console.error('Perspective Flip Error:', err);
      setErrorMsg(err?.message || 'Failed to challenge assumptions.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950/80 text-purple-400 border border-purple-800/60 flex items-center justify-center shadow-inner">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-100 tracking-tight">
                Perspective Flip: Socratic Blindspot Challenger
              </h3>
              <p className="text-[11px] text-stone-400">
                Cognitive bias detection & inquiry for "{entryTitle || 'Reflection'}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={runPerspectiveAnalysis}
                className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
              <p className="font-bold text-stone-200 text-sm">Examining Cognitive Biases & Assumptions...</p>
              <p className="text-stone-400 text-xs max-w-sm">
                Gemini is scanning your reflection for unexamined premises, catastrophic thinking, and constructive inquiry angles.
              </p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Empathic Synthesis */}
              <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-800/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 block mb-1">
                  Empathic Synthesis
                </span>
                <p className="text-stone-200 leading-relaxed italic">
                  "{result.empathicSynthesis}"
                </p>
              </div>

              {/* Detected Biases */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Detected Cognitive Traps ({result.detectedBiases.length})
                  </span>
                </div>
                <div className="space-y-2.5">
                  {result.detectedBiases.map((bias, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-100 text-xs sm:text-sm">
                          {bias.biasName}
                        </span>
                        <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md font-semibold">
                          Cognitive Trap
                        </span>
                      </div>
                      <div className="text-xs text-stone-300 bg-stone-900/90 p-2.5 rounded-xl border border-stone-800">
                        <span className="font-semibold text-stone-200">Observed Evidence: </span>
                        "{bias.textEvidence}"
                      </div>
                      <p className="text-xs text-stone-400">
                        <span className="font-medium text-stone-300">Potential Impact: </span>
                        {bias.potentialImpact}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 Socratic Probes */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <HelpCircle className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    Three Socratic Probing Questions
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {result.socraticProbes.slice(0, 3).map((probe, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-4 rounded-2xl bg-stone-950/70 border border-purple-900/40 flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-purple-950 text-purple-300 border border-purple-800/60 font-bold text-xs flex items-center justify-center shrink-0">
                        {qIdx + 1}
                      </span>
                      <p className="text-stone-200 font-medium text-xs sm:text-sm leading-relaxed">
                        {probe}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reframed Perspective */}
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Reframed Grounded Perspective
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-200 leading-relaxed font-normal">
                  {result.reframedPerspective}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-800 flex items-center justify-between bg-stone-950/70">
          <span className="text-[11px] text-stone-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Saved securely to your Firestore interaction
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
