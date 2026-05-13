import { useEffect, useRef } from 'react';
import type { LogEntry } from '../lib/types.ts';

type Props = {
  entries: LogEntry[];
  onClear: () => void;
  active: boolean;
};

export function RequestConsole({ entries, onClear, active }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <>
      <div className="console-toolbar">
        <span className="console-title">
          <span className={`live-dot ${active ? '' : 'idle'}`} />
          {active ? 'Live' : 'Idle'} · Request console
        </span>
        <button className="clear-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="console" ref={scrollRef}>
        {entries.length === 0 ? (
          <div className="console-empty">
            No requests yet — fire one above to see it land here.
          </div>
        ) : (
          entries.map((e) => <LogRow key={e.id} entry={e} />)
        )}
      </div>
    </>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const statusLabel =
    entry.status === 'pending'
      ? '...'
      : entry.statusCode != null
        ? `${entry.statusCode}`
        : entry.error
          ? 'ERR'
          : '';

  return (
    <div className="log-entry">
      <div className="log-line">
        <span className="log-time">{entry.ts}</span>
        <span className={`log-method ${entry.method}`}>{entry.method}</span>
        <span className="log-path">{entry.path}</span>
        <span className={`log-status ${entry.status}`}>{statusLabel}</span>
      </div>
      {entry.error ? (
        <div className="log-body error">{entry.error}</div>
      ) : entry.body ? (
        <div className="log-body">
          {entry.body}
          {entry.live && <span className="cursor" />}
        </div>
      ) : null}
    </div>
  );
}
