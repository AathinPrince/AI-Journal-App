import React, { useState, useEffect } from 'react';
import { PerspectiveFlipResult } from '../types';
import { db, handleFirestoreError, OperationType, sanitizePayload, auth } from '../lib/firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import {
  Brain,
  X,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  ShieldAlert,
  Compass,
  CheckCircle2,
  RefreshCw,
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

  // Check if analysis already exists in subcollection
  useEffect(() => {
    if (!isOpen || !userId || !interactionId) return;

    let isMounted = true;
    const loadExistingAnalysis = async () => {
      try {
        const biasesPath = `users/${userId}/interactions/${interactionId}/biases`;
        const snap = await getDocs(collection(db, 'users', userId, 'interactions', interactionId, 'biases'));
        if (!snap.empty && isMounted) {
          const firstDoc = snap.docs[0].data() as PerspectiveFlipResult;
          setResult(firstDoc);
        } else if (isMounted) {
          // Trigger generation if none exists
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
      // Obtain Firebase auth ID token for server-side verification
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

      // Strict undefined stripping & save to Firestore subcollection
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-stone-50 border border-stone-200 rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-100/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/10 text-purple-900 border border-purple-900/15 flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
                Perspective Flip: Socratic Blindspot Challenger
              </h3>
              <p className="text-[11px] text-stone-500">
                Cognitive bias detection & assumptions inquiry for "{entryTitle || 'Reflection'}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={runPerspectiveAnalysis}
                className="px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-800" />
              <p className="font-semibold text-stone-800 text-sm">Examining Cognitive Biases & Assumptions...</p>
              <p className="text-stone-500 text-xs max-w-sm">
                Gemini 3.6 Flash is scanning your reflection context for unexamined premises, false dilemmas, and Socratic inquiry angles.
              </p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {/* Empathic Synthesis */}
              <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 block mb-1">
                  Empathic Synthesis
                </span>
                <p className="text-stone-800 leading-relaxed italic">
                  "{result.empathicSynthesis}"
                </p>
              </div>

              {/* Detected Biases */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Detected Cognitive Biases & Assumptions ({result.detectedBiases.length})
                  </span>
                </div>
                <div className="space-y-2.5">
                  {result.detectedBiases.map((bias, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white border border-stone-200/90 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900 text-xs sm:text-sm">
                          {bias.biasName}
                        </span>
                        <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                          Cognitive Trap
                        </span>
                      </div>
                      <div className="text-xs text-stone-600 bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                        <span className="font-medium text-stone-700">Observed Evidence: </span>
                        "{bias.textEvidence}"
                      </div>
                      <p className="text-xs text-stone-700">
                        <span className="font-medium text-stone-800">Potential Impact: </span>
                        {bias.potentialImpact}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 Socratic Probes */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <HelpCircle className="w-4 h-4 text-purple-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Three Socratic Probing Questions
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {result.socraticProbes.slice(0, 3).map((probe, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-3.5 rounded-xl bg-white border border-purple-200/60 shadow-2xs flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-900 font-bold text-xs flex items-center justify-center shrink-0">
                        {qIdx + 1}
                      </span>
                      <p className="text-stone-900 font-medium text-xs sm:text-sm leading-relaxed">
                        {probe}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reframed Perspective */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-emerald-800" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                    Reframed Grounded Perspective
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-800 leading-relaxed font-normal">
                  {result.reframedPerspective}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-100/50">
          <span className="text-[11px] text-stone-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Saved to isolated interaction subcollection
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-900 text-stone-50 text-xs font-semibold hover:bg-stone-800 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
