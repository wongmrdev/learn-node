import type { Lesson } from '../lessons/types.ts';

type Props = {
  lessons: Lesson[];
  activeSlug: string;
  onSelect: (slug: string) => void;
};

export function Sidebar({ lessons, activeSlug, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-text">
          learn<span className="accent">/</span>node
        </span>
      </div>

      <div className="nav-section-title">Lessons</div>
      {lessons.map((l) => (
        <div
          key={l.slug}
          className={`nav-item ${activeSlug === l.slug ? 'active' : ''}`}
          onClick={() => onSelect(l.slug)}
        >
          <span className="nav-bar" />
          <span className="nav-num">{l.number}</span>
          <span>{l.title}</span>
        </div>
      ))}

      <div className="sidebar-footer">v0.0.0 · local</div>
    </aside>
  );
}
