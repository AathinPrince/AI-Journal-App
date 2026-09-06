import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType, sanitizePayload } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { UserInteraction } from '../types';
import {
  Mic,
  MicOff,
  RotateCcw,
  Check,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Loader2,
  Info,
  ExternalLink,
  Volume2,
} from 'lucide-react';

interface ThoughtStreamProps {
  userId: string;
  onCommitSuccess: () => void;
  onClose?: () => void;
}

type StreamState = 'idle' | 'recording' | 'review' | 'confirm';

// Helper for client-side grammar & punctuation capitalization
function formatGrammarBasic(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();
  text = text.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  text = text.replace(/\s+([,.:;?!])/g, '$1');
  return text;
}

export const ThoughtStream: React.FC<ThoughtStreamProps> = ({
  userId,
  onCommitSuccess,
  onClose,
}) => {
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Clean up all resources on unmount
  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, []);

  const stopAllMedia = () => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const handleStartCapturing = async () => {
    setErrorMessage(null);
    setTranscript('');
    setInterimText('');
    setRecordedAudioBlob(null);
    setMicVolume(0);

    // 1. Request microphone access explicitly
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setErrorMessage(
        'Microphone access denied. Please click the lock or camera/mic icon in your browser URL address bar to enable microphone access.'
      );
      setShowPermissionGuide(true);
      return;
    }

    // 2. Setup Audio Visualizer (real-time feedback that mic is picking up sound)
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          if (!streamRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      }
    } catch (visErr) {
      console.warn('Audio visualizer setup skipped:', visErr);
    }

    // 3. Setup MediaRecorder for fail-safe audio transcription via Gemini
    try {
      let chosenMime = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          chosenMime = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          chosenMime = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          chosenMime = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          chosenMime = 'audio/ogg';
        }
        mimeTypeRef.current = chosenMime;

        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      }
    } catch (recErr) {
      console.warn('MediaRecorder error:', recErr);
    }

    // 4. Setup SpeechRecognition (Live on-screen transcription)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    shouldListenRef.current = true;
    setStreamState('recording');

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let finalChunk = '';
          let interimChunk = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalChunk += item[0].transcript + ' ';
            } else {
              interimChunk += item[0].transcript;
            }
          }

          if (finalChunk) {
            setTranscript((prev) => {
              const combined = prev ? `${prev.trim()} ${finalChunk.trim()}` : finalChunk.trim();
              return formatGrammarBasic(combined);
            });
          }
          setInterimText(interimChunk);
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition notice:', event.error);
          // If speech recognition drops or errors in an iframe, MediaRecorder is still actively capturing
        };

        recognition.onend = () => {
          if (shouldListenRef.current) {
            try {
              recognition.start();
            } catch (e) {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (speechErr) {
        console.warn('SpeechRecognition start failed, will rely on MediaRecorder & Gemini AI:', speechErr);
      }
    }
  };

  const handlePauseStream = async () => {
    shouldListenRef.current = false;
    setStreamState('review');

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Stop volume visualizer
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicVolume(0);

    // Stop MediaRecorder and harvest audio Blob
    let audioBlob: Blob | null = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current) return resolve();
        mediaRecorderRef.current.onstop = () => {
          audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
          setRecordedAudioBlob(audioBlob);
          resolve();
        };
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          resolve();
        }
      });
    }

    // Release microphone hardware
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    // Determine current transcript state
    const currentText = (transcript + (interimText ? ` ${interimText}` : '')).trim();
    setInterimText('');

    // If WebSpeech caught words, format and keep
    if (currentText.length > 0) {
      setTranscript(formatGrammarBasic(currentText));
      return;
    }

    // FAIL-SAFE: If WebSpeech API failed to capture any words (common in sandboxed iframes),
    // automatically transcribe the recorded audio via Gemini 3.5 Transcribe!
    if (audioBlob && (audioBlob as Blob).size > 1000) {
      await transcribeAudioBlob(audioBlob);
    } else {
      setErrorMessage(
        'No audio detected. Please check that your microphone is unmuted and speak clearly into it.'
      );
    }
  };

  const transcribeAudioBlob = async (blob: Blob) => {
    setIsTranscribing(true);
    setErrorMessage(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);

      await new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64Audio = dataUrl.split(',')[1];
            const mimeType = blob.type || 'audio/webm';

            const response = await fetch('/api/transcribe-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audio: base64Audio,
                mimeType,
              }),
            });

            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              throw new Error(err.error || 'Failed to transcribe audio.');
            }

            const data = await response.json();
            if (data.transcript && data.transcript.trim()) {
              setTranscript(formatGrammarBasic(data.transcript));
            } else {
              setErrorMessage(
                'No words were heard in the audio recording. Check your microphone volume or type your thoughts below.'
              );
            }
            resolve();
          } catch (err: any) {
            reject(err);
          }
        };
        reader.onerror = reject;
      });
    } catch (err: any) {
      console.error('Audio transcription error:', err);
      setErrorMessage(
        err?.message || 'Could not transcribe speech. You can type or paste your thoughts directly below.'
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTakeTwo = () => {
    setTranscript('');
    setInterimText('');
    setErrorMessage(null);
    setRecordedAudioBlob(null);
    handleStartCapturing();
  };

  const handleReviewAndCommit = () => {
    if (!transcript.trim()) {
      setErrorMessage('Please capture or enter your thoughts before committing.');
      return;
    }
    setStreamState('confirm');
  };

  const handleCommitToJournal = async () => {
    const rawText = transcript.trim();
    if (!rawText) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawText,
          mode: 'summary',
          messages: [],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to summarize audio journal.');
      }

      const resData = await response.json();
      const summarizedText: string = resData.response || rawText;

      const newId = `thoughtstream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();

      const newEntry: UserInteraction = {
        id: newId,
        userId,
        title: `ThoughtStream Voice Entry (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        prompt: rawText,
        response: summarizedText,
        mode: 'thoughtstream',
        messages: [
          {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: `[ThoughtStream Audio Transcript]:\n${rawText}`,
            timestamp: nowIso,
          },
          {
            id: `msg_${Date.now()}_model`,
            role: 'model',
            content: summarizedText,
            timestamp: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Strict undefined-stripping & save to Firestore silently
      const sanitized = sanitizePayload(newEntry);
      const docPath = `users/${userId}/interactions/${newId}`;

      try {
        await setDoc(doc(db, 'users', userId, 'interactions', newId), sanitized);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, docPath);
      }

      // UX rule: Do NOT display final summary on screen. Reset inline UI and notify parent
      setTranscript('');
      setInterimText('');
      setRecordedAudioBlob(null);
      setStreamState('idle');
      onCommitSuccess();
    } catch (err: any) {
      console.error('Commit to journal error:', err);
      setErrorMessage(err?.message || 'Failed to commit ThoughtStream to journal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-amber-950/5 border border-amber-900/15 transition-all">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-800/15 text-amber-900 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
            ThoughtStream
          </span>
          <span className="text-[10px] text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
            Continuous Audio Journal
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPermissionGuide(!showPermissionGuide)}
            className="text-stone-500 hover:text-amber-900 text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer"
            title="Microphone Permissions & Troubleshooting"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Permissions Help</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 text-xs px-2 py-0.5 rounded hover:bg-stone-200/50 transition cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Permissions & Troubleshooting Guide Banner */}
      {showPermissionGuide && (
        <div className="mb-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-stone-700 space-y-2">
          <div className="flex items-center justify-between font-semibold text-amber-950">
            <span className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-amber-800" /> Microphone Access Checklist:
            </span>
            <button
              onClick={() => setShowPermissionGuide(false)}
              className="text-stone-400 hover:text-stone-700 font-normal"
            >
              Dismiss
            </button>
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed">
            <li>
              <strong>Browser Permission:</strong> When prompted, click <strong>"Allow"</strong>. If previously blocked, click the <strong>lock / tune icon</strong> in the browser's URL address bar next to the domain name and set <strong>Microphone</strong> to <strong>"Allow"</strong>.
            </li>
            <li>
              <strong>AI Studio Iframe Preview:</strong> Browsers sometimes restrict native speech recognition inside embedded iframes. Our app automatically records high-fidelity audio and transcribes it with Gemini AI, but for native live speech recognition, click the <strong>"Open in new window"</strong> icon at the top right of the AI Studio preview.
            </li>
            <li>
              <strong>System Microphone:</strong> Ensure your computer or headset microphone is unmuted and set as the default input device in your system settings.
            </li>
          </ol>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* State 1: Idle & Recording */}
      {streamState === 'idle' && (
        <div className="space-y-3">
          <p className="text-xs text-stone-600 leading-relaxed">
            Continuously capture your raw thoughts through your microphone. We'll transcribe and format your speech, then silently save an executive summary to your private journal.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="start-capturing-btn"
              onClick={handleStartCapturing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-900 hover:bg-amber-950 text-stone-50 text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Mic className="w-4 h-4 text-amber-300" />
              <span>Start Capturing</span>
            </button>
            <span className="text-[11px] text-stone-500">
              No timeouts — speak for as long as you need.
            </span>
          </div>
        </div>
      )}

      {streamState === 'recording' && (
        <div className="space-y-3">
          {/* Real-time speech display */}
          <div className="p-3.5 rounded-xl bg-white border border-amber-900/20 shadow-xs min-h-[100px] max-h-[190px] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                  Listening continuously...
                </span>
              </div>

              {/* Real-time Voice Audio Visualizer */}
              <div className="flex items-center gap-1.5" title={`Mic input level: ${micVolume}%`}>
                <Volume2 className={`w-3.5 h-3.5 ${micVolume > 5 ? 'text-emerald-600' : 'text-stone-400'}`} />
                <div className="flex items-end gap-0.5 h-4 w-16 bg-stone-100 p-0.5 rounded">
                  {[20, 40, 60, 80, 100].map((threshold, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 rounded-xs transition-all duration-75 ${
                        micVolume >= threshold
                          ? 'bg-emerald-500 h-full'
                          : micVolume >= threshold - 15
                          ? 'bg-emerald-300 h-2/3'
                          : 'bg-stone-300 h-1/3'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-900 leading-relaxed">
              {transcript || (
                <span className="text-stone-400 italic">
                  {micVolume > 10
                    ? 'Hearing your voice! Transcribing speech...'
                    : 'Speak freely, your words will appear here...'}
                </span>
              )}
              {interimText && <span className="text-amber-800 italic"> {interimText}</span>}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-500">
              Pause anytime. Gemini will ensure complete accuracy when you finish.
            </span>
            <button
              type="button"
              id="pause-stream-btn"
              onClick={handlePauseStream}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
            >
              <MicOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Pause Stream</span>
            </button>
          </div>
        </div>
      )}

      {/* State 2: Live Grammar Correction & Review */}
      {streamState === 'review' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-xs min-h-[110px] space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-stone-100 text-[11px] text-stone-500">
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Grammar & Punctuation Corrected
              </span>
              <span>{transcript.length} characters</span>
            </div>

            {isTranscribing ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-stone-600">
                <Loader2 className="w-5 h-5 animate-spin text-amber-800" />
                <span className="text-xs font-medium">
                  Transcribing your audio recording with Gemini AI...
                </span>
              </div>
            ) : (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your recorded thoughts will appear here. You can also edit or type directly..."
                rows={4}
                className="w-full text-xs sm:text-sm text-stone-900 leading-relaxed bg-transparent border-0 focus:outline-none focus:ring-0 resize-y"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {recordedAudioBlob && !isTranscribing && (
                <button
                  type="button"
                  onClick={() => transcribeAudioBlob(recordedAudioBlob)}
                  className="inline-flex items-center gap-1 text-[11px] text-amber-900 hover:text-amber-950 font-medium cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>Re-transcribe Audio with Gemini</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="take-two-btn"
                onClick={handleTakeTwo}
                disabled={isTranscribing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Take Two</span>
              </button>
              <button
                type="button"
                id="review-commit-btn"
                onClick={handleReviewAndCommit}
                disabled={isTranscribing || !transcript.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <span>Review & Commit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 3: Finalization & Silent Storage */}
      {streamState === 'confirm' && (
        <div className="p-3.5 rounded-xl bg-white border border-amber-900/20 space-y-3 shadow-xs">
          <p className="text-xs sm:text-sm font-medium text-stone-800">
            Would you like to add this ThoughtStream to your journal?
          </p>
          <p className="text-[11px] text-stone-500">
            Gemini will synthesize an insightful summary of your raw thoughts and store it directly in your isolated Firestore database.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStreamState('review')}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-100 text-xs transition cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              id="commit-to-journal-btn"
              onClick={handleCommitToJournal}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-900 hover:bg-amber-950 text-stone-50 text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span>Summarizing & Committing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Commit to Journal</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
