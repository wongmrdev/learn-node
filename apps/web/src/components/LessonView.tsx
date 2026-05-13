import { useMemo } from 'react';
import { highlight } from '../lib/highlight.tsx';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from '../lessons/types.ts';

type Props = {
  lesson: Lesson;
  prev: Lesson | null;
  next: Lesson | null;
  onSelect: (slug: string) => void;
} & LessonInteractiveProps;

export function LessonView({ lesson, prev, next, onSelect, ...interactive }: Props) {
  const highlighted = useMemo(() => highlight(lesson.code), [lesson.code]);
  const Interactive = lesson.Interactive;

  return (
    <>
      <header className="lesson-header">
        <div className="lesson-eyebrow">Lesson {lesson.number}</div>
        <h1 className="lesson-title">{lesson.title}</h1>
        <p className="lesson-summary">{lesson.summary}</p>
      </header>

      <section className="section">
        <h2>Concept</h2>
        <div className="prose">{lesson.explanation}</div>
      </section>

      <section className="section">
        <h2>Server code</h2>
        <pre className="code-block">{highlighted}</pre>
      </section>

      <section className="section">
        <h2>Try it</h2>
        <Interactive {...interactive} />
      </section>

      <nav className="lesson-nav">
        {prev ? (
          <button className="lesson-nav-btn prev" onClick={() => onSelect(prev.slug)}>
            <span className="lesson-nav-label">← Previous</span>
            <span className="lesson-nav-title">{prev.title}</span>
          </button>
        ) : (
          <span className="lesson-nav-spacer" />
        )}
        {next ? (
          <button className="lesson-nav-btn next" onClick={() => onSelect(next.slug)}>
            <span className="lesson-nav-label">Next →</span>
            <span className="lesson-nav-title">{next.title}</span>
          </button>
        ) : (
          <span className="lesson-nav-spacer" />
        )}
      </nav>
    </>
  );
}
