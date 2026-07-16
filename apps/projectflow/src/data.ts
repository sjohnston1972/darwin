import type { ProjectFlowProject, ProjectFlowTask } from '@darwin/shared';

export type Project = ProjectFlowProject;
export type Task = ProjectFlowTask;

export const participantName = 'Alex Morgan';

export const initialProjects: Project[] = [
  {
    id: 'apollo',
    name: 'Apollo Release',
    code: 'APL',
    owner: 'Priya Shah',
    status: 'At risk',
    dueDate: 'Jul 22',
  },
  {
    id: 'atlas',
    name: 'Atlas Migration',
    code: 'ATM',
    owner: 'Marcus Chen',
    status: 'On track',
    dueDate: 'Aug 14',
  },
  {
    id: 'retention',
    name: 'Retention Experiments',
    code: 'RET',
    owner: 'Elena Rossi',
    status: 'Overdue',
    dueDate: 'Jul 10',
  },
  {
    id: 'mobile',
    name: 'Mobile Foundations',
    code: 'MOB',
    owner: 'Sam Rivera',
    status: 'On track',
    dueDate: 'Sep 05',
  },
];

export const initialTasks: Task[] = [
  {
    id: 'APL-241',
    projectId: 'apollo',
    title: 'Confirm launch checklist',
    assignee: participantName,
    status: 'To do',
    dueDate: 'Jul 19',
  },
  {
    id: 'APL-238',
    projectId: 'apollo',
    title: 'Review release notes',
    assignee: 'Priya Shah',
    status: 'In progress',
    dueDate: 'Jul 18',
  },
  {
    id: 'ATM-104',
    projectId: 'atlas',
    title: 'Validate data export',
    assignee: participantName,
    status: 'In progress',
    dueDate: 'Jul 24',
  },
  {
    id: 'RET-089',
    projectId: 'retention',
    title: 'Summarise cohort results',
    assignee: 'Elena Rossi',
    status: 'Done',
    dueDate: 'Jul 09',
  },
];

export const studyTasks = [
  {
    id: 'find-assigned-task',
    number: '01',
    title: 'Find your assigned task',
    instruction: 'Find and open "Confirm launch checklist".',
  },
  {
    id: 'create-project',
    number: '02',
    title: 'Create a project',
    instruction: 'Create a project named Polaris Launch.',
  },
  {
    id: 'create-assigned-task',
    number: '03',
    title: 'Create and assign a task',
    instruction:
      'In Apollo Release, create "Draft rollback plan" and assign it to yourself.',
  },
] as const;

export type StudyTaskId = (typeof studyTasks)[number]['id'];
export type AppRoute =
  | 'dashboard'
  | 'my-work'
  | 'projects'
  | 'project'
  | 'project-tasks'
  | 'reports'
  | 'settings';
