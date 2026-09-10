import { useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Mic button. Tap to start, tap again to stop. Calls onText(text) with each
 * final chunk of speech so it can be appended to a field.
 */
export default function Dictate({ onText, className = '' }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => () => recRef.current?.stop?.(), []);

  if (!SR) return null; // browser without speech support: just type

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let chunk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript + ' ';
      }
      if (chunk.trim()) onText(chunk.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      className={`mic ${listening ? 'mic-on' : ''} ${className}`}
      onClick={toggle}
      title={listening ? 'Stop dictation' : 'Dictate'}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
    >
      {listening ? '■ Stop' : '🎤 Speak'}
    </button>
  );
}
