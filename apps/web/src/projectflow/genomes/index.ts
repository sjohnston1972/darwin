import type { ProjectFlowVariant } from '../data';
import { baselineGenome } from './baseline';
import { evolvedGenome } from './evolved';

export const projectFlowGenomes = {
  baseline: baselineGenome,
  evolved: evolvedGenome,
} satisfies Record<
  ProjectFlowVariant,
  typeof baselineGenome | typeof evolvedGenome
>;

export type { GenomeNavigationIcon, ProjectFlowGenome } from './types';
