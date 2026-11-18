import { useCallback, useEffect, useRef, useState } from 'react';
import { chapters, duration, lectureAt, lectureStage, lessons, localReply } from '../world/jamesLecture.js';
import { getSoundState, subscribeSound } from '../audio/sound.js';
import { isGameplayInputBlocked } from '../input/uiMode.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './james-lecture.css';

const bookmark = 'ghosts.dane-lecture.1';
const stamp = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
function savedTime() {
  try { return lectureAt(localStorage.getItem(bookmark)).time; } catch { return 0; }
}
function save(seconds) {
  try { localStorage.setItem(bookmark, String(seconds)); } catch { /* Private browsing. */ }
}

export default function JamesLecture({ ready, settings }) {
  const [time, setTime] = useState(savedTime);
  const [mode, setMode] = useState('idle');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const media = useRef(null), bridge = useRef(null), pending = useRef(null);
  const voice = useRef(null), field = useRef(null), resumeAt = useRef(time), lastSave = useRef(-1);
  const run = useRef(0);
  const position = lectureAt(time);
  const { chapter, line, text } = position;
  const part = chapters[chapter], lesson = lessons[chapter];

  function stopAside() {
    pending.current?.abort();
    pending.current = null;
    if (bridge.current) { bridge.current.onended = bridge.current.onerror = null; bridge.current.pause(); }
    if (voice.current) window.speechSynthesis?.cancel();
    voice.current = null;
    lectureStage.answering = false;
    lectureStage.returning = false;
    setWaiting(false);
  }
  function pause() {
    run.current++;
    media.current.pause();
    stopAside();
    setMode('paused');
    save(media.current.currentTime);
  }
  async function play(seconds) {
    const ticket = ++run.current;
    stopAside();
    setError('');
    const audio = media.current;
    if (!audio) return;
    if (audio.error) audio.load();
    resumeAt.current = seconds >= duration ? 0 : seconds;
    audio.currentTime = resumeAt.current;
    setTime(audio.currentTime);
    try {
      await audio.play();
      if (run.current === ticket) setMode('playing');
    } catch {
      if (run.current !== ticket) return;
      setError('The recording could not start. Try playing it again.');
      setMode('paused');
    }
  }
  function interrupt() {
    if (mode !== 'playing') return;
    run.current++;
    media.current.pause();
    resumeAt.current = media.current.currentTime;
    setTime(resumeAt.current);
    save(resumeAt.current);
    lectureStage.answering = true;
    setTurns([]); setQuestion(''); setMode('asking');
    return true;
  }
  function returnToLecture() {
    if (mode !== 'asking') return;
    const hadAnswer = turns.length > 0;
    stopAside();
    // Replay the interrupted phrase so the first word back is intelligible.
    const at = lectureAt(resumeAt.current);
    const resume = hadAnswer ? chapters[at.chapter].starts[at.line] : at.time;
    if (!hadAnswer) { void play(resume); return; }
    const ticket = ++run.current;
    lectureStage.returning = true;
    setMode('returning');
    const clip = bridge.current;
    clip.src = '/audio/dane-hall/return-' + at.chapter + '.m4a';
    const done = () => { if (ticket === run.current) void play(resume); };
    clip.onended = done; clip.onerror = done;
    clip.play().catch(done);
  }
  const questionPanel = useDismissableOverlay(mode === 'asking', returnToLecture);
  const interruptRef = useRef(interrupt);
  interruptRef.current = interrupt;
  useEffect(() => {
    const audio = media.current, aside = bridge.current;
    lectureStage.media = audio;
    lectureStage.aside = aside;
    const release = subscribeSound(({ muted, masterVolume }) => {
      audio.muted = aside.muted = muted;
      audio.volume = aside.volume = masterVolume;
      if (voice.current && (muted || !masterVolume)) window.speechSynthesis?.cancel();
    });
    function onKey(event) {
      if (event.code !== 'KeyQ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey
        || isGameplayInputBlocked() || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) return;
      if (interruptRef.current()) event.preventDefault();
    }
    // The media can be midway through loading when the player leaves the room.
    function store() { if (audio.readyState >= 1) save(audio.currentTime); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', store);
    return () => {
      ++run.current; store(); audio.pause(); aside.pause(); release();
      aside.onended = aside.onerror = null;
      pending.current?.abort(); pending.current = null;
      if (voice.current) window.speechSynthesis?.cancel();
      lectureStage.media = lectureStage.aside = null; lectureStage.answering = lectureStage.returning = false;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', store);
    };
  }, []);
  useEffect(() => {
    if (settings && ['playing','asking','returning'].includes(mode)) pause();
  }, [settings, mode]);
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && ['playing', 'returning'].includes(mode)) pause();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [mode]);
  const sync = useCallback(() => {
    const t = Math.min(duration, media.current.currentTime);
    setTime(t);
    const bucket = Math.floor(t / 5);
    if (bucket !== lastSave.current) { lastSave.current = bucket; save(t); }
  }, []);

  async function ask(raw) {
    const q = raw.trim();
    if (!q || pending.current || mode !== 'asking') return;
    const controller = new AbortController();
    pending.current = controller;
    if (voice.current) window.speechSynthesis?.cancel();
    bridge.current.pause();
    setQuestion(''); setWaiting(true);
    let answer = localReply(q, chapter, turns);
    const timer = setTimeout(() => controller.abort(), 14500);
    try {
      if (q === lesson.question) {
        answer = lesson.answer;
      } else {
        const resp = await fetch('/api/lecture-question', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ chapter, line, question: q, recent: turns.slice(-3) }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (typeof data.answer === 'string' && data.answer.trim()) answer = data.answer;
        }
      }
    } catch { /* The authored exchange also works without a connection. */ }
    finally { clearTimeout(timer); }
    if (pending.current !== controller) return;
    pending.current = null; setWaiting(false);
    setTurns(previous => [...previous, { question: q, answer }]);
    const sound = getSoundState();
    const recording = lessons.findIndex(entry => entry.answer === answer);
    if (recording >= 0) {
      bridge.current.src = '/audio/dane-hall/answer-' + recording + '.m4a';
      bridge.current.play().catch(() => {});
    } else if (!sound.muted && sound.masterVolume && window.speechSynthesis && window.SpeechSynthesisUtterance) {
      const spoken = new SpeechSynthesisUtterance(answer);
      spoken.lang = 'en-US'; spoken.rate = .94; spoken.volume = sound.masterVolume;
      const available = window.speechSynthesis.getVoices();
      spoken.voice = available.find(v => v.lang.startsWith('en') && /Alex|David|Daniel|Guy|Aaron/i.test(v.name)) ?? null;
      voice.current = spoken;
      window.speechSynthesis.speak(spoken);
    }
    field.current?.focus();
  }
  const fresh = mode === 'idle' || mode === 'ended';
  return <>
    <audio ref={media} preload="metadata" src="/audio/dane-hall/lecture.m4a"
      onLoadedMetadata={() => { media.current.currentTime = resumeAt.current; }}
      onTimeUpdate={sync} onSeeked={sync}
      onEnded={() => { setTime(duration); save(duration); setMode('ended'); }}
      onError={() => { if (mode !== 'idle') { setError('The recording could not be loaded. Try playing it again.'); setMode('paused'); } }} />
    <audio ref={bridge} preload="none" />
    {!settings && ready && <section className={'jlecture' + (mode === 'asking' ? ' jlecture--question' : '')} aria-label="William James lecture">
      {mode === 'asking' ? <div ref={questionPanel} role="dialog" aria-modal="true" aria-label="Ask William James">
        <div className="jlecture-meta"><span>William James</span><span>{stamp(time)} · Question from the floor</span></div>
        {turns.length > 0 && <div className="jlecture-turn" aria-live="polite">
          <small>You asked</small><p>{turns.at(-1).question}</p><small>James</small><p>{turns.at(-1).answer}</p>
        </div>}
        <form onSubmit={e => { e.preventDefault(); void ask(question); }}>
          <label htmlFor="james-question">{turns.length ? 'Ask a follow-up' : 'Your question for Professor James'}</label>
          <div className="jlecture-input"><input id="james-question" ref={field} value={question} maxLength={400}
            onChange={e => setQuestion(e.target.value)} autoComplete="off" /><button disabled={!question.trim() || waiting}>Ask</button></div>
        </form>
        {!turns.length && !waiting && <button className="jlecture-prompt" onClick={() => ask(lesson.question)}>{lesson.question}</button>}
        {waiting && <span role="status">James considers your question…</span>}
        <button className="jlecture-return" onClick={returnToLecture}>Return to the lecture</button>
      </div> : <>
        <div className="jlecture-meta"><span>William James</span><span>{stamp(time)} / 60:00</span></div>
        {fresh ? <h2>{time >= duration ? 'Class dismissed' : 'The Will and Its Alternatives'}</h2> :
          <select aria-label="Lecture section" value={chapter} onChange={e => void play(chapters[Number(e.target.value)].starts[0])}>
            {chapters.map((c,i) => <option value={i} key={c.title}>{c.title}</option>)}
          </select>}
        {!fresh && <p className="jlecture-caption">{mode === 'returning' ? lesson.bridge : text}</p>}
        {error && <p role="status">{error}</p>}
        <div className="jlecture-actions">
          {mode === 'playing' ? <><button onClick={interrupt}>Raise a hand <kbd>Q</kbd></button><button onClick={pause}>Pause</button></>
            : mode === 'returning' ? <button onClick={pause}>Pause</button>
            : <button onClick={() => void play(time)}>{time >= duration ? 'Hear the lecture again' : time > 0 ? 'Resume lecture' : 'Attend lecture'}</button>}
          {fresh && time < duration && <span>Philosophy IV · One hour</span>}
        </div>
      </>}
    </section>}
  </>;
}
