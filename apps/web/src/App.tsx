import { useCallback, useState } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { LessonView } from './components/LessonView.tsx';
import { RequestConsole } from './components/RequestConsole.tsx';
import { lessons } from './lessons/index.ts';
import type { LogEntry } from './lib/types.ts';

export function App() {
  const [activeSlug, setActiveSlug] = useState<string>(lessons[0].slug);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const pushLog = useCallback((entry: LogEntry) => {
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === entry.id);
      if (i === -1) return [...prev, entry];
      const next = prev.slice();
      next[i] = entry;
      return next;
    });
  }, []);

  const activeIndex = Math.max(
    0,
    lessons.findIndex((l) => l.slug === activeSlug),
  );
  const activeLesson = lessons[activeIndex];
  const prev = activeIndex > 0 ? lessons[activeIndex - 1] : null;
  const next = activeIndex < lessons.length - 1 ? lessons[activeIndex + 1] : null;

  const selectLesson = (slug: string) => {
    setActiveSlug(slug);
    window.scrollTo({ top: 0 });
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app">
      <Sidebar
        lessons={lessons}
        activeSlug={activeSlug}
        onSelect={selectLesson}
      />
      <main className="main">
        <LessonView
          lesson={activeLesson}
          prev={prev}
          next={next}
          onSelect={selectLesson}
          pushLog={pushLog}
          busy={busy}
          setBusy={setBusy}
        />
        <section className="section">
          <h2>Request console</h2>
          <RequestConsole
            entries={entries}
            onClear={() => setEntries([])}
            active={busy}
          />
        </section>
      </main>
    </div>
  );
}
