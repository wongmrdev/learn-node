import type { ComponentType, ReactNode } from 'react';
import type { LessonInteractiveProps } from '../lib/types.ts';

export type Lesson = {
  slug: string;
  number: string;
  title: string;
  summary: string;
  explanation: ReactNode;
  code: string;
  Interactive: ComponentType<LessonInteractiveProps>;
};
