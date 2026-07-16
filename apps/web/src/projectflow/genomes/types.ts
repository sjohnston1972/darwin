import type { ProjectFlowRoute } from '../data';

export type GenomeNavigationIcon =
  | 'home'
  | 'projects'
  | 'tasks'
  | 'reports'
  | 'my-work'
  | 'insights'
  | 'settings';

export interface ProjectFlowGenome {
  version: 'v1.0' | 'v1.1';
  initialRoute: ProjectFlowRoute;
  taskDestination: ProjectFlowRoute;
  globalSearch: boolean;
  globalQuickCreate: boolean;
  showIndirectTaskPath: boolean;
  navigation: Array<{
    route: ProjectFlowRoute;
    label: string;
    icon: GenomeNavigationIcon;
    count?: number;
  }>;
}
