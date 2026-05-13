export type LogStatus = 'pending' | 'ok' | 'err';

export type LogEntry = {
  id: string;
  ts: string;
  method: 'GET' | 'POST' | 'STREAM';
  path: string;
  statusCode: number | null;
  status: LogStatus;
  body: string;
  error?: string;
  live: boolean;
};

export type LogPusher = (entry: LogEntry) => void;

export type LessonInteractiveProps = {
  pushLog: LogPusher;
  busy: boolean;
  setBusy: (b: boolean) => void;
};
