import routes from './01-routes.tsx';
import params from './02-params.tsx';
import validation from './03-validation.tsx';
import streaming from './04-streaming.tsx';
import type { Lesson } from './types.ts';

export const lessons: Lesson[] = [routes, params, validation, streaming];
