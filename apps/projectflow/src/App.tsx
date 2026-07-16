import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileBarChart,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  createTelemetryClient,
  type DarwinTelemetryClient,
} from '@darwin/telemetry-client';
import {
  ParticipantWorkspaceResponseSchema,
  type StudyTelemetryEvent,
} from '@darwin/shared';

import {
  initialProjects,
  initialTasks,
  participantName,
  studyTasks,
  type AppRoute,
  type Project,
  type StudyTaskId,
  type Task,
} from './data';

const workspaceKey = 'projectflow:workspace:v1';
const participantKey = 'projectflow:participant';
const appVersion = '1.0.0';
const studyId = 'projectflow-baseline-study';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

interface Workspace {
  projects: Project[];
  tasks: Task[];
}

const loadWorkspace = (): Workspace => {
  try {
    const stored = localStorage.getItem(workspaceKey);
    if (stored) return JSON.parse(stored) as Workspace;
  } catch {
    // A clean participant workspace is a safe local fallback.
  }
  return { projects: initialProjects, tasks: initialTasks };
};

const getParticipantId = () => {
  const existing = localStorage.getItem(participantKey);
  if (existing) return existing;
  const generated = `participant-${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(participantKey, generated);
  return generated;
};

const routePath = (route: AppRoute, projectId?: string) => {
  if (route === 'project') return `/projects/${projectId ?? 'unknown'}`;
  if (route === 'project-tasks') {
    return `/projects/${projectId ?? 'unknown'}/tasks`;
  }
  return `/${route}`;
};

export function App() {
  const [{ projects, tasks }, setWorkspace] = useState(loadWorkspace);
  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [projectQuery, setProjectQuery] = useState('');
  const [taskQuery, setTaskQuery] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [studyMode, setStudyMode] = useState(() =>
    window.location.pathname.startsWith('/study'),
  );
  const [activeStudyTask, setActiveStudyTask] = useState<StudyTaskId | null>(
    null,
  );
  const [satisfiedTasks, setSatisfiedTasks] = useState<Set<StudyTaskId>>(
    () => new Set(),
  );
  const [completedTasks, setCompletedTasks] = useState<Set<StudyTaskId>>(
    () => new Set(),
  );
  const [events, setEvents] = useState<StudyTelemetryEvent[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const participantId = useMemo(getParticipantId, []);
  const telemetryRef = useRef<DarwinTelemetryClient | null>(null);

  useEffect(() => {
    localStorage.setItem(workspaceKey, JSON.stringify({ projects, tasks }));
    if (import.meta.env.MODE === 'test') return;
    const timeout = window.setTimeout(() => {
      void fetch(
        `${apiBaseUrl}/api/studies/${studyId}/participants/${participantId}/workspace`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projects,
            tasks,
            updatedAt: new Date().toISOString(),
          }),
        },
      ).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [participantId, projects, tasks]);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const controller = new AbortController();
    void fetch(
      `${apiBaseUrl}/api/studies/${studyId}/participants/${participantId}/workspace`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return;
        const result = ParticipantWorkspaceResponseSchema.parse(
          await response.json(),
        );
        if (result.workspace) {
          setWorkspace({
            projects: result.workspace.projects,
            tasks: result.workspace.tasks,
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [participantId]);

  useEffect(() => {
    const telemetry = createTelemetryClient({
      appVersion,
      studyId,
      participantId,
      initialRoute: studyMode ? '/study/dashboard' : '/dashboard',
      endpoint:
        import.meta.env.MODE === 'test'
          ? undefined
          : import.meta.env.VITE_TELEMETRY_ENDPOINT ||
            `${apiBaseUrl}/api/telemetry/events`,
      onEvent: (event) =>
        setEvents((current) => [...current.slice(-39), event]),
    });
    telemetryRef.current = telemetry;
    telemetry.init();
    return () => {
      telemetry.destroy();
      telemetryRef.current = null;
    };
  }, [participantId, studyMode]);

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const selectedTasks = tasks.filter(
    (task) => task.projectId === selectedProjectId,
  );
  const visibleProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(projectQuery.toLowerCase()),
  );
  const visibleTasks = selectedTasks.filter((task) =>
    `${task.id} ${task.title} ${task.assignee}`
      .toLowerCase()
      .includes(taskQuery.toLowerCase()),
  );

  const navigate = (nextRoute: AppRoute, projectId?: string) => {
    setRoute(nextRoute);
    setSelectedProjectId(projectId ?? null);
    setMobileNavOpen(false);
    telemetryRef.current?.trackRouteChanged(
      `${studyMode ? '/study' : ''}${routePath(nextRoute, projectId)}`,
    );
  };

  const openProject = (projectId: string) => navigate('project', projectId);

  const startStudyTask = (taskId: StudyTaskId) => {
    setActiveStudyTask(taskId);
    telemetryRef.current?.taskStarted(taskId);
  };

  const finishStudyTask = (outcome: 'success' | 'failed') => {
    if (!activeStudyTask) return;
    telemetryRef.current?.taskCompleted(outcome);
    if (outcome === 'success') {
      setCompletedTasks((current) => new Set(current).add(activeStudyTask));
    }
    setActiveStudyTask(null);
  };

  const markSatisfied = (taskId: StudyTaskId) => {
    if (activeStudyTask !== taskId) return;
    setSatisfiedTasks((current) => new Set(current).add(taskId));
  };

  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    if (!name) {
      telemetryRef.current?.trackValidationError(
        'project-create-submit',
        'project-name',
        'required',
      );
      return;
    }
    const project: Project = {
      id: `project-${crypto.randomUUID().slice(0, 8)}`,
      name,
      code: name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 3)
        .toUpperCase(),
      owner: participantName,
      status: 'On track',
      dueDate: 'Aug 30',
    };
    setWorkspace((current) => ({
      ...current,
      projects: [project, ...current.projects],
    }));
    if (name.toLowerCase() === 'polaris launch')
      markSatisfied('create-project');
    setShowProjectForm(false);
    openProject(project.id);
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProject) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title')).trim();
    const assignee = String(form.get('assignee'));
    if (!title) {
      telemetryRef.current?.trackValidationError(
        'task-create-submit',
        'task-title',
        'required',
      );
      return;
    }
    const task: Task = {
      id: `${selectedProject.code}-${250 + tasks.length}`,
      projectId: selectedProject.id,
      title,
      assignee,
      status: 'To do',
      dueDate: 'Jul 28',
    };
    setWorkspace((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
    }));
    if (
      selectedProject.id === 'apollo' &&
      title.toLowerCase() === 'draft rollback plan' &&
      assignee === participantName
    ) {
      markSatisfied('create-assigned-task');
    }
    setShowTaskForm(false);
  };

  const submitProjectSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    telemetryRef.current?.trackSearch(
      'project-search',
      projectQuery.length,
      visibleProjects.length,
    );
  };

  const submitTaskSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    telemetryRef.current?.trackSearch(
      'project-task-search',
      taskQuery.length,
      visibleTasks.length,
    );
  };

  const enterStudy = () => {
    window.history.pushState({}, '', '/study');
    setStudyMode(true);
  };

  return (
    <div className={`app-shell ${studyMode ? 'has-study' : ''}`}>
      <aside className={`sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <button
          className="brand"
          type="button"
          data-darwin-id="brand-home"
          onClick={() => navigate('dashboard')}
        >
          <span className="brand-mark">P</span>
          <span>ProjectFlow</span>
        </button>

        <nav aria-label="Primary navigation">
          <NavItem
            active={route === 'dashboard'}
            icon={LayoutDashboard}
            id="nav-dashboard"
            label="Dashboard"
            onClick={() => navigate('dashboard')}
          />
          <NavItem
            active={route === 'projects' || route.startsWith('project')}
            count={projects.length}
            icon={FolderKanban}
            id="nav-projects"
            label="Projects"
            onClick={() => navigate('projects')}
          />
          <NavItem
            active={route === 'reports'}
            icon={FileBarChart}
            id="nav-reports"
            label="Reports"
            onClick={() => navigate('reports')}
          />
          <NavItem
            active={route === 'settings'}
            icon={Settings}
            id="nav-settings"
            label="Settings"
            onClick={() => navigate('settings')}
          />
        </nav>

        <div className="sidebar-spacer" />
        <div className="account">
          <span className="avatar">AM</span>
          <span>
            <strong>{participantName}</strong>
            <small>Product designer</small>
          </span>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="nav-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>Northstar Labs</span>
            <ChevronRight size={14} />
            <strong>{routeTitle(route, selectedProject)}</strong>
          </div>
          <div className="topbar-actions">
            {!studyMode && (
              <button
                className="study-entry"
                type="button"
                data-darwin-id="study-enter"
                onClick={enterStudy}
              >
                Study mode
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <CircleUserRound size={24} />
          </div>
        </header>

        <main className="content">
          {route === 'dashboard' && (
            <Dashboard
              projects={projects}
              tasks={tasks}
              onOpenProject={openProject}
            />
          )}
          {route === 'projects' && (
            <Projects
              projects={visibleProjects}
              query={projectQuery}
              onChangeQuery={setProjectQuery}
              onCreate={() => setShowProjectForm(true)}
              onOpen={openProject}
              onSearch={submitProjectSearch}
            />
          )}
          {route === 'project' && selectedProject && (
            <ProjectOverview
              project={selectedProject}
              tasks={selectedTasks}
              onOpenTasks={() => navigate('project-tasks', selectedProject.id)}
            />
          )}
          {route === 'project-tasks' && selectedProject && (
            <ProjectTasks
              project={selectedProject}
              query={taskQuery}
              tasks={visibleTasks}
              onChangeQuery={setTaskQuery}
              onCreate={() => setShowTaskForm(true)}
              onOpenTask={(task) => {
                if (task.title === 'Confirm launch checklist') {
                  markSatisfied('find-assigned-task');
                }
              }}
              onSearch={submitTaskSearch}
            />
          )}
          {route === 'reports' && <Reports projects={projects} />}
          {route === 'settings' && <SettingsView />}
        </main>
      </div>

      {studyMode && (
        <StudyPanel
          activeTask={activeStudyTask}
          completedTasks={completedTasks}
          eventCount={events.length}
          lastEvent={events.at(-1)}
          participantId={participantId}
          satisfiedTasks={satisfiedTasks}
          onCouldNotComplete={() => finishStudyTask('failed')}
          onDone={() => finishStudyTask('success')}
          onFeedback={(length) =>
            telemetryRef.current?.feedbackSubmitted(length)
          }
          onStart={startStudyTask}
        />
      )}

      {showProjectForm && (
        <Modal title="Create project" onClose={() => setShowProjectForm(false)}>
          <form className="form-stack" onSubmit={createProject}>
            <label>
              Project name
              <input name="name" placeholder="e.g. Polaris Launch" autoFocus />
            </label>
            <label>
              Target date
              <input name="date" type="date" defaultValue="2026-08-30" />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowProjectForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button-primary"
                data-darwin-id="project-create-submit"
              >
                Create project
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showTaskForm && selectedProject && (
        <Modal
          title={`New task - ${selectedProject.name}`}
          onClose={() => setShowTaskForm(false)}
        >
          <form className="form-stack" onSubmit={createTask}>
            <label>
              Task title
              <input
                name="title"
                placeholder="What needs to be done?"
                autoFocus
              />
            </label>
            <label>
              Assignee
              <select name="assignee" defaultValue={participantName}>
                <option>{participantName}</option>
                <option>Priya Shah</option>
                <option>Marcus Chen</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowTaskForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button-primary"
                data-darwin-id="task-create-submit"
              >
                Create task
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function NavItem({
  active,
  count,
  icon: Icon,
  id,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: typeof Gauge;
  id: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? 'is-active' : ''}`}
      type="button"
      data-darwin-id={id}
      onClick={onClick}
    >
      <Icon size={17} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </button>
  );
}

function Dashboard({
  projects,
  tasks,
  onOpenProject,
}: {
  projects: Project[];
  tasks: Task[];
  onOpenProject: (id: string) => void;
}) {
  const assigned = tasks.filter((task) => task.assignee === participantName);
  return (
    <>
      <PageHeading
        eyebrow="Monday, July 16"
        title="Good morning, Alex"
        description="Here is what is happening across your workspace."
      />
      <div className="metric-grid">
        <Metric
          label="Active projects"
          value={projects.length}
          meta="2 need attention"
          tone="blue"
        />
        <Metric
          label="Open tasks"
          value={tasks.filter((task) => task.status !== 'Done').length}
          meta="4 due this week"
          tone="green"
        />
        <Metric
          label="My workload"
          value={assigned.length}
          meta="Across 2 projects"
          tone="amber"
        />
        <Metric
          label="Team velocity"
          value="86%"
          meta="Up 4% this month"
          tone="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel wide-panel">
          <PanelHeading title="Project health" meta="All projects" />
          <div className="project-health-list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                data-darwin-id={`dashboard-project-${project.id}`}
                onClick={() => onOpenProject(project.id)}
              >
                <span className="project-code">{project.code}</span>
                <span className="list-main">
                  <strong>{project.name}</strong>
                  <small>{project.owner}</small>
                </span>
                <Status value={project.status} />
                <span className="due-date">{project.dueDate}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelHeading title="Activity" meta="Last 7 days" />
          <div className="activity-list">
            <Activity
              color="green"
              title="Release notes approved"
              meta="Priya - 18 min ago"
            />
            <Activity
              color="blue"
              title="Atlas milestone moved"
              meta="Marcus - 2 hours ago"
            />
            <Activity
              color="amber"
              title="3 tasks became overdue"
              meta="Retention - Yesterday"
            />
            <Activity
              color="violet"
              title="Research summary shared"
              meta="Elena - Yesterday"
            />
          </div>
        </section>
        <section className="panel">
          <PanelHeading title="Capacity" meta="This sprint" />
          <div className="capacity-chart">
            <span style={{ height: '44%' }} />
            <span style={{ height: '68%' }} />
            <span style={{ height: '53%' }} />
            <span style={{ height: '82%' }} />
            <span style={{ height: '64%' }} />
          </div>
        </section>
        <section className="panel">
          <PanelHeading title="Upcoming" meta="Next 7 days" />
          <div className="upcoming">
            <Clock3 size={17} />
            <span>
              <strong>Apollo code freeze</strong>
              <small>Friday - 16:00</small>
            </span>
          </div>
          <div className="upcoming">
            <Users size={17} />
            <span>
              <strong>Sprint review</strong>
              <small>Monday - 10:00</small>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function Projects({
  projects,
  query,
  onChangeQuery,
  onCreate,
  onOpen,
  onSearch,
}: {
  projects: Project[];
  query: string;
  onChangeQuery: (query: string) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Projects"
        description="Plan and track work across every team."
        action={
          <button
            className="button-primary"
            type="button"
            data-darwin-id="project-create-open"
            onClick={onCreate}
          >
            <Plus size={16} /> New project
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="table-toolbar">
          <form className="search-field" onSubmit={onSearch}>
            <Search size={16} />
            <input
              aria-label="Search projects"
              value={query}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder="Search projects"
            />
            <button type="submit" data-darwin-id="project-search">
              Search
            </button>
          </form>
          <span>{projects.length} projects</span>
        </div>
        <div className="data-table">
          <div className="table-header">
            <span>Project</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Due</span>
            <span />
          </div>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              data-darwin-id={`project-open-${project.id}`}
              onClick={() => onOpen(project.id)}
            >
              <span className="project-cell">
                <span className="project-code">{project.code}</span>
                <strong>{project.name}</strong>
              </span>
              <span>{project.owner}</span>
              <Status value={project.status} />
              <span>{project.dueDate}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function ProjectOverview({
  project,
  tasks,
  onOpenTasks,
}: {
  project: Project;
  tasks: Task[];
  onOpenTasks: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow={project.code}
        title={project.name}
        description={`Owned by ${project.owner} - Due ${project.dueDate}`}
      />
      <div className="project-tabs">
        <button className="is-active" type="button">
          Overview
        </button>
        <button
          type="button"
          data-darwin-id="project-tasks-open"
          onClick={onOpenTasks}
        >
          Tasks <span>{tasks.length}</span>
        </button>
        <button type="button">Files</button>
        <button type="button">Activity</button>
      </div>
      <div className="project-overview-grid">
        <section className="panel progress-panel">
          <PanelHeading title="Delivery progress" meta="Current sprint" />
          <strong>
            {Math.round(
              (tasks.filter((task) => task.status === 'Done').length /
                Math.max(1, tasks.length)) *
                100,
            )}
            %
          </strong>
          <div className="progress-track">
            <span style={{ width: '42%' }} />
          </div>
          <p>
            {tasks.filter((task) => task.status === 'Done').length} of{' '}
            {tasks.length} tasks completed
          </p>
        </section>
        <section className="panel">
          <PanelHeading title="Project status" />
          <Status value={project.status} />
          <p className="panel-copy">
            Milestone confidence is based on delivery pace and open
            dependencies.
          </p>
        </section>
        <section className="panel wide-panel">
          <PanelHeading
            title="Recent tasks"
            meta="Open task directory from the Tasks tab"
          />
          <div className="compact-task-list">
            {tasks.slice(0, 3).map((task) => (
              <div key={task.id}>
                <span className="task-check" />
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.assignee}</small>
                </span>
                <span>{task.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function ProjectTasks({
  project,
  tasks,
  query,
  onChangeQuery,
  onCreate,
  onOpenTask,
  onSearch,
}: {
  project: Project;
  tasks: Task[];
  query: string;
  onChangeQuery: (query: string) => void;
  onCreate: () => void;
  onOpenTask: (task: Task) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow={`${project.code} - Project tasks`}
        title={project.name}
        description="Search and manage work inside this project."
        action={
          <button
            className="button-primary"
            type="button"
            data-darwin-id="task-create-open"
            onClick={onCreate}
          >
            <Plus size={16} /> Add task
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="table-toolbar">
          <form className="search-field" onSubmit={onSearch}>
            <Search size={16} />
            <input
              aria-label="Search project tasks"
              value={query}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder="Search this project's tasks"
            />
            <button type="submit" data-darwin-id="project-task-search">
              Search
            </button>
          </form>
          <span>{tasks.length} tasks</span>
        </div>
        <div className="task-directory">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              data-darwin-id={`task-open-${task.id.toLowerCase()}`}
              onClick={() => onOpenTask(task)}
            >
              <span className="task-check" />
              <span className="list-main">
                <strong>{task.title}</strong>
                <small>
                  {task.id} - {task.assignee}
                </small>
              </span>
              <span className="task-status">{task.status}</span>
              <span>{task.dueDate}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function Reports({ projects }: { projects: Project[] }) {
  const overdue = projects.filter((project) => project.status === 'Overdue');
  return (
    <>
      <PageHeading
        eyebrow="Analytics"
        title="Reports"
        description="Portfolio trends and delivery exceptions."
      />
      <div className="report-grid">
        <section className="panel report-feature">
          <div className="report-icon coral">
            <AlertTriangle size={20} />
          </div>
          <span>Delivery exception</span>
          <strong>{overdue.length} overdue project</strong>
          <p>{overdue.map((project) => project.name).join(', ')}</p>
          <button type="button" data-darwin-id="report-overdue-open">
            Open overdue report <ChevronRight size={15} />
          </button>
        </section>
        <section className="panel">
          <div className="report-icon blue">
            <BarChart3 size={20} />
          </div>
          <span>Throughput</span>
          <strong>42 tasks completed</strong>
          <p>Up 8% from the previous sprint.</p>
        </section>
        <section className="panel">
          <div className="report-icon green">
            <ListChecks size={20} />
          </div>
          <span>Quality</span>
          <strong>94% on-time rate</strong>
          <p>Across all active project milestones.</p>
        </section>
      </div>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace preferences and integrations."
      />
      <section className="panel settings-panel">
        <h2>Workspace profile</h2>
        <div>
          <span>Workspace</span>
          <strong>Northstar Labs</strong>
        </div>
        <div>
          <span>Default timezone</span>
          <strong>Europe/London</strong>
        </div>
        <div>
          <span>Members</span>
          <strong>24 active</strong>
        </div>
      </section>
    </>
  );
}

function StudyPanel({
  activeTask,
  completedTasks,
  eventCount,
  lastEvent,
  participantId,
  satisfiedTasks,
  onCouldNotComplete,
  onDone,
  onFeedback,
  onStart,
}: {
  activeTask: StudyTaskId | null;
  completedTasks: Set<StudyTaskId>;
  eventCount: number;
  lastEvent?: StudyTelemetryEvent;
  participantId: string;
  satisfiedTasks: Set<StudyTaskId>;
  onCouldNotComplete: () => void;
  onDone: () => void;
  onFeedback: (length: number) => void;
  onStart: (id: StudyTaskId) => void;
}) {
  const [feedback, setFeedback] = useState('');
  return (
    <aside className="study-panel" aria-label="ProjectFlow usability study">
      <header>
        <div>
          <span className="live-dot" /> Live study
        </div>
        <strong>
          {participantId.replace('participant-', 'P-').toUpperCase()}
        </strong>
      </header>
      <div className="study-intro">
        <span>ProjectFlow baseline - v{appVersion}</span>
        <h2>Complete three tasks</h2>
        <p>
          Use the application normally. Interaction content and form values are
          not recorded.
        </p>
      </div>
      <div className="study-tasks">
        {studyTasks.map((task) => {
          const active = activeTask === task.id;
          const complete = completedTasks.has(task.id);
          return (
            <article
              className={`${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}
              key={task.id}
            >
              <span className="task-number">
                {complete ? <Check size={15} /> : task.number}
              </span>
              <div>
                <strong>{task.title}</strong>
                <p>{task.instruction}</p>
                {active ? (
                  <div className="study-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      data-darwin-id="study-task-failed"
                      onClick={onCouldNotComplete}
                    >
                      Could not complete
                    </button>
                    <button
                      type="button"
                      className="button-primary"
                      data-darwin-id="study-task-done"
                      disabled={!satisfiedTasks.has(task.id)}
                      onClick={onDone}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  !complete && (
                    <button
                      type="button"
                      className="start-task"
                      data-darwin-id={`study-start-${task.id}`}
                      disabled={activeTask !== null}
                      onClick={() => onStart(task.id)}
                    >
                      Start task <ChevronRight size={14} />
                    </button>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="event-monitor">
        <div>
          <span>Session evidence captured</span>
          <strong>{eventCount} events</strong>
        </div>
        <code>
          {lastEvent
            ? `${lastEvent.sequence.toString().padStart(2, '0')} - ${lastEvent.eventType}`
            : 'Waiting for activity'}
        </code>
      </div>
      <form
        className="feedback"
        onSubmit={(event) => {
          event.preventDefault();
          onFeedback(feedback.length);
          setFeedback('');
        }}
      >
        <label htmlFor="study-feedback">Optional feedback</label>
        <textarea
          id="study-feedback"
          maxLength={500}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="One sentence about anything confusing"
        />
        <button
          type="submit"
          className="button-secondary"
          data-darwin-id="study-feedback-submit"
          disabled={!feedback.trim()}
        >
          Submit feedback
        </button>
      </form>
    </aside>
  );
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header>
          <h2 id="modal-title">{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PageHeading({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="page-heading">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function Metric({
  label,
  meta,
  tone,
  value,
}: {
  label: string;
  meta: string;
  tone: string;
  value: number | string;
}) {
  return (
    <section className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </section>
  );
}

function PanelHeading({ meta, title }: { meta?: string; title: string }) {
  return (
    <header className="panel-heading">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </header>
  );
}

function Status({ value }: { value: Project['status'] }) {
  return (
    <span className={`status status-${value.toLowerCase().replace(' ', '-')}`}>
      {value}
    </span>
  );
}

function Activity({
  color,
  meta,
  title,
}: {
  color: string;
  meta: string;
  title: string;
}) {
  return (
    <div className="activity">
      <span className={`activity-dot ${color}`} />
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
    </div>
  );
}

function routeTitle(route: AppRoute, project?: Project) {
  if (route === 'project') return project?.name ?? 'Project';
  if (route === 'project-tasks') return `${project?.name ?? 'Project'} tasks`;
  return route[0]?.toUpperCase() + route.slice(1);
}
