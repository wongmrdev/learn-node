import { useMemo } from 'react';
import { highlight } from '../lib/highlight.tsx';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from '../lessons/types.ts';

type Props = {
  lesson: Lesson;
} & LessonInteractiveProps;

export function LessonView({ lesson, ...interactive }: Props) {
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
    </>
  );
}
