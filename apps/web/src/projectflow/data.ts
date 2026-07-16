export type ProjectFlowVariant = 'baseline' | 'evolved';

export type ProjectFlowRoute =
  | 'dashboard'
  | 'my-work'
  | 'projects'
  | 'tasks'
  | 'reports'
  | 'insights'
  | 'settings';

export interface Project {
  id: string;
  name: string;
  code: string;
  status: 'On track' | 'At risk' | 'Planning';
  progress: number;
  dueLabel: string;
  members: string[];
  openTasks: number;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  status: 'To do' | 'In progress' | 'In review' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  dueLabel: string;
  assignee: string;
}

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
}

export const currentUser = {
  name: 'Maya Chen',
  role: 'Product lead',
  initials: 'MC',
};

export const projects: Project[] = [
  {
    id: 'project-atlas',
    name: 'Atlas mobile launch',
    code: 'ATL',
    status: 'At risk',
    progress: 68,
    dueLabel: 'Aug 02',
    members: ['MC', 'JR', 'AK', 'SP'],
    openTasks: 14,
  },
  {
    id: 'project-onboarding',
    name: 'Onboarding refresh',
    code: 'ONB',
    status: 'On track',
    progress: 82,
    dueLabel: 'Jul 24',
    members: ['MC', 'LN', 'TG'],
    openTasks: 6,
  },
  {
    id: 'project-billing',
    name: 'Billing migration',
    code: 'BIL',
    status: 'On track',
    progress: 44,
    dueLabel: 'Sep 12',
    members: ['JR', 'AK', 'DS'],
    openTasks: 18,
  },
  {
    id: 'project-research',
    name: 'Q3 customer research',
    code: 'RES',
    status: 'Planning',
    progress: 21,
    dueLabel: 'Sep 28',
    members: ['MC', 'TG'],
    openTasks: 9,
  },
];

export const seedTasks: Task[] = [
  {
    id: 'ATL-142',
    title: 'Resolve offline sync conflict state',
    projectId: 'project-atlas',
    status: 'In progress',
    priority: 'High',
    dueLabel: 'Today',
    assignee: 'Maya Chen',
  },
  {
    id: 'ONB-88',
    title: 'Review activation checklist copy',
    projectId: 'project-onboarding',
    status: 'In review',
    priority: 'Medium',
    dueLabel: 'Today',
    assignee: 'Maya Chen',
  },
  {
    id: 'ATL-151',
    title: 'Approve App Store release notes',
    projectId: 'project-atlas',
    status: 'To do',
    priority: 'High',
    dueLabel: 'Tomorrow',
    assignee: 'Maya Chen',
  },
  {
    id: 'RES-19',
    title: 'Select interview cohort',
    projectId: 'project-research',
    status: 'To do',
    priority: 'Medium',
    dueLabel: 'Jul 21',
    assignee: 'Maya Chen',
  },
  {
    id: 'BIL-204',
    title: 'Map invoice status webhooks',
    projectId: 'project-billing',
    status: 'In progress',
    priority: 'High',
    dueLabel: 'Jul 22',
    assignee: 'Jon Reyes',
  },
  {
    id: 'ONB-91',
    title: 'Instrument welcome tour completion',
    projectId: 'project-onboarding',
    status: 'To do',
    priority: 'Low',
    dueLabel: 'Jul 25',
    assignee: 'Lina Nguyen',
  },
  {
    id: 'ATL-137',
    title: 'Validate tablet navigation states',
    projectId: 'project-atlas',
    status: 'Done',
    priority: 'Medium',
    dueLabel: 'Jul 15',
    assignee: 'Sam Patel',
  },
];

export const activity: ActivityItem[] = [
  {
    id: 'activity-1',
    actor: 'Jon Reyes',
    action: 'moved',
    target: 'Map invoice status webhooks to In progress',
    time: '12 min',
  },
  {
    id: 'activity-2',
    actor: 'Lina Nguyen',
    action: 'commented on',
    target: 'Review activation checklist copy',
    time: '34 min',
  },
  {
    id: 'activity-3',
    actor: 'Sam Patel',
    action: 'completed',
    target: 'Validate tablet navigation states',
    time: '1 hr',
  },
];

export const projectForTask = (task: Task) =>
  projects.find((project) => project.id === task.projectId)!;
