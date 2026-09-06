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
  Volume2,
} from 'lucide-react';

interface ThoughtStreamProps {
  userId: string;
  onCommitSuccess: () => void;
  onClose?: () => void;
}

type StreamState = 'idle' | 'recording' | 'review' | 'confirm';

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
        'Microphone access denied. Please click the lock or camera/mic icon in your browser address bar to enable microphone access.'
      );
      setShowPermissionGuide(true);
      return;
    }

    // 2. Setup Audio Visualizer (real-time voice feedback)
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

    // 3. Setup MediaRecorder for high-fidelity audio buffer
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

    // 4. Setup SpeechRecognition
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
        console.warn('SpeechRecognition start fallback:', speechErr);
      }
    }
  };

  const handlePauseStream = async () => {
    shouldListenRef.current = false;
    setStreamState('review');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicVolume(0);

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

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    const currentText = (transcript + (interimText ? ` ${interimText}` : '')).trim();
    setInterimText('');

    if (currentText.length > 0) {
      setTranscript(formatGrammarBasic(currentText));
      return;
    }

    // Automated Gemini AI Audio Transcription Fallback
    if (audioBlob && (audioBlob as Blob).size > 1000) {
      await transcribeAudioBlob(audioBlob);
    } else {
      setErrorMessage(
        'No audio detected. Please check your microphone volume or type your thoughts directly below.'
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
                'No words were heard in the audio recording. Check your microphone or type your thoughts below.'
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
        err?.message || 'Could not transcribe speech. You can type or edit your thoughts directly below.'
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
      setErrorMessage('Please speak or type your thoughts before committing.');
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
        title: `ThoughtStream (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        prompt: rawText,
        response: summarizedText,
        mode: 'thoughtstream',
        messages: [
          {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: `[ThoughtStream Voice Transcript]:\n${rawText}`,
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

      const sanitized = sanitizePayload(newEntry);
      const docPath = `users/${userId}/interactions/${newId}`;

      try {
        await setDoc(doc(db, 'users', userId, 'interactions', newId), sanitized);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, docPath);
      }

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
    <div className="p-5 rounded-3xl bg-stone-950/80 border border-amber-500/30 shadow-xl transition-all">
      {/* Title & Explanatory Subtext */}
      <div className="flex items-start justify-between mb-3 pb-3 border-b border-stone-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Mic className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-amber-300 tracking-wide uppercase">
              ThoughtStream
            </span>
            <span className="text-[10px] text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/30 font-semibold">
              Continuous Voice Journaling
            </span>
          </div>
          <p className="text-xs text-stone-300 mt-1 max-w-xl leading-relaxed">
            <strong>How to speak:</strong> Click "Start Capturing" and talk freely. The microphone stays open through silent pauses. When finished, click "Pause Stream" and Gemini will summarize your thoughts silently into your journal.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPermissionGuide(!showPermissionGuide)}
            className="text-stone-400 hover:text-amber-300 text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-stone-800 hover:border-amber-500/30 transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Mic Help</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-200 text-xs px-2.5 py-1 rounded-lg hover:bg-stone-800 transition cursor-pointer border border-stone-800"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Permissions Guide Banner */}
      {showPermissionGuide && (
        <div className="mb-4 p-4 rounded-2xl bg-stone-900/95 border border-amber-500/40 text-xs text-stone-300 space-y-2.5">
          <div className="flex items-center justify-between font-bold text-amber-300">
            <span className="flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-amber-400" /> Microphone Access Checklist:
            </span>
            <button
              onClick={() => setShowPermissionGuide(false)}
              className="text-stone-400 hover:text-stone-200 font-normal cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-stone-300 leading-relaxed">
            <li>
              <strong>Browser Permission:</strong> Click <strong>"Allow"</strong> when prompted. If previously blocked, click the <strong>lock / tune icon</strong> next to the URL address bar and set <strong>Microphone</strong> to <strong>"Allow"</strong>.
            </li>
            <li>
              <strong>AI Studio Iframe Tip:</strong> Chromium browsers sometimes restrict native speech recognition inside iframe previews. If speech-to-text is silent, clicking <strong>Pause Stream</strong> automatically transcribes your recording via Gemini AI, or you can click <strong>"Open in new window"</strong> in the top header.
            </li>
            <li>
              <strong>Input Device:</strong> Ensure your computer microphone is unmuted and set as default in system settings.
            </li>
          </ol>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-[11px] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* State 1: Idle State */}
      {streamState === 'idle' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-2xl bg-stone-900/60 border border-stone-800/80">
          <div>
            <p className="text-xs font-semibold text-stone-200">Ready to record</p>
            <p className="text-[11px] text-stone-400 mt-0.5">
              No timeouts — take as much time as you need to vent, ponder, or brainstorm.
            </p>
          </div>
          <button
            type="button"
            id="start-capturing-btn"
            onClick={handleStartCapturing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer shrink-0"
          >
            <Mic className="w-4 h-4 text-stone-950" />
            <span>Start Capturing</span>
          </button>
        </div>
      )}

      {/* State 2: Actively Recording */}
      {streamState === 'recording' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-stone-900/90 border border-amber-500/30 shadow-inner min-h-[110px] max-h-[200px] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                  Listening continuously...
                </span>
              </div>

              {/* Real-time Voice Level Meter */}
              <div className="flex items-center gap-2" title={`Mic input level: ${micVolume}%`}>
                <Volume2 className={`w-4 h-4 ${micVolume > 5 ? 'text-emerald-400' : 'text-stone-500'}`} />
                <div className="flex items-end gap-0.5 h-4 w-16 bg-stone-950 p-0.5 rounded border border-stone-800">
                  {[20, 40, 60, 80, 100].map((threshold, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 rounded-xs transition-all duration-75 ${
                        micVolume >= threshold
                          ? 'bg-emerald-400 h-full'
                          : micVolume >= threshold - 15
                          ? 'bg-emerald-600 h-2/3'
                          : 'bg-stone-800 h-1/3'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-200 leading-relaxed font-normal">
              {transcript || (
                <span className="text-stone-500 italic">
                  {micVolume > 10
                    ? 'Hearing your voice! Transcribing speech...'
                    : 'Speak naturally, your words will appear here...'}
                </span>
              )}
              {interimText && <span className="text-amber-400 italic"> {interimText}</span>}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-stone-400">
              Click Pause Stream when you have finished speaking.
            </span>
            <button
              type="button"
              id="pause-stream-btn"
              onClick={handlePauseStream}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-900/80 hover:bg-rose-800 text-rose-100 text-xs font-bold border border-rose-700/80 shadow-sm transition cursor-pointer shrink-0"
            >
              <MicOff className="w-4 h-4 text-rose-300" />
              <span>Pause Stream</span>
            </button>
          </div>
        </div>
      )}

      {/* State 3: Live Grammar Correction & Review */}
      {streamState === 'review' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 shadow-inner min-h-[120px] space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800 text-[11px] text-stone-400">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Grammar & Formatting Applied
              </span>
              <span>{transcript.length} characters</span>
            </div>

            {isTranscribing ? (
              <div className="py-7 flex flex-col items-center justify-center gap-2 text-stone-300">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">
                  Transcribing your audio with Gemini AI...
                </span>
              </div>
            ) : (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your recorded thoughts appear here. You can edit, add, or polish your thoughts..."
                rows={4}
                className="w-full text-xs sm:text-sm text-stone-100 leading-relaxed bg-transparent border-0 focus:outline-none focus:ring-0 resize-y"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              {recordedAudioBlob && !isTranscribing && (
                <button
                  type="button"
                  onClick={() => transcribeAudioBlob(recordedAudioBlob)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-750 text-xs font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
                <span>Take Two</span>
              </button>
              <button
                type="button"
                id="review-commit-btn"
                onClick={handleReviewAndCommit}
                disabled={isTranscribing || !transcript.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer disabled:opacity-50"
              >
                <span>Review & Commit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 4: Final Confirmation */}
      {streamState === 'confirm' && (
        <div className="p-4 rounded-2xl bg-stone-900/95 border border-amber-500/30 space-y-3 shadow-lg">
          <p className="text-sm font-bold text-stone-100">
            Commit this ThoughtStream to your journal?
          </p>
          <p className="text-xs text-stone-300 leading-relaxed">
            Gemini will synthesize an executive summary of your speech and silently save both the transcript and summary to your isolated Firestore database.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setStreamState('review')}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-stone-700 text-stone-300 hover:bg-stone-800 text-xs font-semibold transition cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              id="commit-to-journal-btn"
              onClick={handleCommitToJournal}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-lg shadow-amber-950/50 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                  <span>Summarizing & Committing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-stone-950" />
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
