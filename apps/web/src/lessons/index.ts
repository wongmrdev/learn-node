import routes from './01-routes.tsx';
import params from './02-params.tsx';
import validation from './03-validation.tsx';
import streaming from './04-streaming.tsx';
import query from './05-query.tsx';
import hooks from './06-hooks.tsx';
import plugins from './07-plugins.tsx';
import errors from './08-errors.tsx';
import queues from './09-queues.tsx';
import ceiling from './10-ceiling.tsx';
import type { Lesson } from './types.ts';

export const lessons: Lesson[] = [
  routes,
  params,
  validation,
  streaming,
  query,
  hooks,
  plugins,
  errors,
  queues,
  ceiling,
];
