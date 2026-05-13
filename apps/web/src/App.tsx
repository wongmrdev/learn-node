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

  const activeLesson = lessons.find((l) => l.slug === activeSlug) ?? lessons[0];

  return (
    <div className="app">
      <Sidebar
        lessons={lessons}
        activeSlug={activeSlug}
        onSelect={setActiveSlug}
      />
      <main className="main">
        <LessonView
          lesson={activeLesson}
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
