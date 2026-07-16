import type { ProjectFlowGenome } from './types';

export const evolvedGenome: ProjectFlowGenome = {
  version: 'v1.1',
  initialRoute: 'my-work',
  taskDestination: 'my-work',
  globalSearch: true,
  globalQuickCreate: true,
  showIndirectTaskPath: false,
  navigation: [
    { route: 'my-work', label: 'My Work', icon: 'my-work', count: 4 },
    { route: 'projects', label: 'Projects', icon: 'projects', count: 4 },
    { route: 'insights', label: 'Insights', icon: 'insights' },
    { route: 'settings', label: 'Settings', icon: 'settings' },
  ],
};
