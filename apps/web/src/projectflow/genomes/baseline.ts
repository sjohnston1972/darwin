import type { ProjectFlowGenome } from './types';

export const baselineGenome: ProjectFlowGenome = {
  version: 'v1.0',
  initialRoute: 'dashboard',
  taskDestination: 'tasks',
  globalSearch: false,
  globalQuickCreate: false,
  showIndirectTaskPath: true,
  navigation: [
    { route: 'dashboard', label: 'Dashboard', icon: 'home' },
    { route: 'projects', label: 'Projects', icon: 'projects', count: 4 },
    { route: 'tasks', label: 'Tasks', icon: 'tasks', count: 26 },
    { route: 'reports', label: 'Reports', icon: 'reports' },
    { route: 'settings', label: 'Settings', icon: 'settings' },
  ],
};
