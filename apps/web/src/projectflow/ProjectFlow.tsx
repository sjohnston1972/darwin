import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileBarChart,
  FolderKanban,
  Gauge,
  Home,
  LayoutList,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  activity,
  currentUser,
  projectForTask,
  projects,
  seedTasks,
  type Project,
  type ProjectFlowRoute,
  type ProjectFlowVariant,
  type Task,
} from './data';
import { projectFlowGenomes, type GenomeNavigationIcon } from './genomes';

interface ProjectFlowProps {
  variant: ProjectFlowVariant;
}

const navigationIcons: Record<GenomeNavigationIcon, LucideIcon> = {
  home: Home,
  projects: FolderKanban,
  tasks: CheckCircle2,
  reports: FileBarChart,
  'my-work': LayoutList,
  insights: Sparkles,
  settings: Settings,
};

export function ProjectFlow({ variant }: ProjectFlowProps) {
  const genome = projectFlowGenomes[variant];
  const [route, setRoute] = useState<ProjectFlowRoute>(genome.initialRoute);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>(seedTasks);

  useEffect(() => {
    setRoute(genome.initialRoute);
    setSelectedProject(null);
    setSearchQuery('');
  }, [genome.initialRoute]);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return tasks;

    return tasks.filter((task) => {
      const project = projectForTask(task);
      return `${task.id} ${task.title} ${project.name}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [searchQuery, tasks]);

  const navigate = (nextRoute: ProjectFlowRoute) => {
    setRoute(nextRoute);
    setSelectedProject(null);
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = String(form.get('project'));
    const project =
      projects.find((item) => item.id === projectId) ?? projects[0]!;
    const task: Task = {
      id: `${project.code}-${240 + tasks.length}`,
      title: String(form.get('title')),
      projectId: project.id,
      status: 'To do',
      priority: form.get('priority') === 'High' ? 'High' : 'Medium',
      dueLabel: 'Jul 23',
      assignee: currentUser.name,
    };

    setTasks((current) => [task, ...current]);
    setTaskComposerOpen(false);
    setSearchQuery('');
    setRoute(genome.taskDestination);
  };

  return (
    <div
      className={`projectflow projectflow-${variant}`}
      data-testid="projectflow"
      data-variant={variant}
    >
      <div className="pf-shell">
        <aside className="pf-sidebar" aria-label="ProjectFlow navigation">
          <button
            className="pf-logo"
            type="button"
            onClick={() => navigate(genome.initialRoute)}
          >
            <span className="pf-logo-mark" aria-hidden="true">
              P
            </span>
            <span>ProjectFlow</span>
          </button>

          <nav className="pf-nav" aria-label="ProjectFlow primary">
            {genome.navigation.map(
              ({ route: itemRoute, label, icon, count }) => {
                const Icon = navigationIcons[icon];
                return (
                  <button
                    className={
                      route === itemRoute
                        ? 'pf-nav-item is-active'
                        : 'pf-nav-item'
                    }
                    key={itemRoute}
                    onClick={() => navigate(itemRoute)}
                    type="button"
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {count !== undefined && (
                      <span className="pf-nav-count">{count}</span>
                    )}
                  </button>
                );
              },
            )}
          </nav>

          <div className="pf-team-block">
            <p>Teams</p>
            <button type="button" onClick={() => navigate('projects')}>
              <span className="pf-team-dot dot-product" /> Product
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              <span className="pf-team-dot dot-engineering" /> Engineering
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              <span className="pf-team-dot dot-research" /> Research
            </button>
          </div>

          <div className="pf-user">
            <Avatar initials={currentUser.initials} />
            <div>
              <strong>{currentUser.name}</strong>
              <span>{currentUser.role}</span>
            </div>
            <MoreHorizontal size={16} />
          </div>
        </aside>

        <div className="pf-workspace">
          <header className="pf-topbar">
            {!genome.globalSearch ? (
              <>
                <div className="pf-mobile-brand">
                  <Menu size={17} /> ProjectFlow
                </div>
                <span className="pf-route-title">{routeLabel(route)}</span>
                <div className="pf-topbar-actions">
                  <button
                    className="pf-icon-button"
                    type="button"
                    aria-label="Open messages"
                    title="Messages"
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button
                    className="pf-icon-button"
                    type="button"
                    aria-label="Open notifications"
                    title="Notifications"
                  >
                    <Bell size={16} />
                    <span className="pf-notification-dot" />
                  </button>
                  <Avatar initials={currentUser.initials} small />
                </div>
              </>
            ) : (
              <>
                <label className="pf-global-search">
                  <Search size={16} />
                  <span className="sr-only">Search tasks and projects</span>
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setRoute('my-work');
                    }}
                    placeholder="Search tasks and projects"
                  />
                  <kbd>/</kbd>
                </label>
                <div className="pf-topbar-actions">
                  <button
                    className="pf-create-button"
                    type="button"
                    onClick={() => setTaskComposerOpen(true)}
                  >
                    <Plus size={16} /> <span>Quick task</span>
                  </button>
                  <button
                    className="pf-icon-button"
                    type="button"
                    aria-label="Open notifications"
                    title="Notifications"
                  >
                    <Bell size={16} />
                    <span className="pf-notification-dot" />
                  </button>
                  <Avatar initials={currentUser.initials} small />
                </div>
              </>
            )}
          </header>

          <div className="pf-content">
            {route === 'dashboard' && (
              <BaselineDashboard
                tasks={tasks}
                onOpenProjects={() => navigate('projects')}
              />
            )}
            {route === 'my-work' && (
              <MyWork
                tasks={visibleTasks.filter(
                  (task) => task.assignee === currentUser.name,
                )}
                query={searchQuery}
                onCreateTask={() => setTaskComposerOpen(true)}
              />
            )}
            {route === 'projects' && (
              <ProjectsView
                selectedProject={selectedProject}
                tasks={tasks}
                showIndirectTaskPath={genome.showIndirectTaskPath}
                onSelectProject={setSelectedProject}
                onBack={() => setSelectedProject(null)}
                onCreateTask={() => setTaskComposerOpen(true)}
              />
            )}
            {route === 'tasks' && (
              <TaskDirectory
                tasks={visibleTasks}
                query={searchQuery}
                onQueryChange={setSearchQuery}
              />
            )}
            {route === 'reports' && <ReportsView />}
            {route === 'insights' && <InsightsView />}
            {route === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>

      {taskComposerOpen && (
        <TaskComposer
          quickCreate={genome.globalQuickCreate}
          onClose={() => setTaskComposerOpen(false)}
          onSubmit={createTask}
          selectedProject={selectedProject}
        />
      )}
    </div>
  );
}

function BaselineDashboard({
  tasks,
  onOpenProjects,
}: {
  tasks: Task[];
  onOpenProjects: () => void;
}) {
  const assignedTasks = tasks.filter(
    (task) => task.assignee === currentUser.name && task.status !== 'Done',
  );

  return (
    <div>
      <PageIntro
        eyebrow="Thursday, July 16"
        title={`Good morning, ${currentUser.name.split(' ')[0]}`}
        description="Here's what's happening across your workspace."
        action={
          <button
            className="pf-secondary-button"
            type="button"
            onClick={onOpenProjects}
          >
            <FolderKanban size={15} /> Open projects
          </button>
        }
      />

      <div className="pf-stat-strip">
        <Stat
          label="Active projects"
          value="12"
          detail="2 need attention"
          icon={FolderKanban}
          tone="amber"
        />
        <Stat
          label="Tasks completed"
          value="84"
          detail="This month"
          icon={CheckCircle2}
          tone="green"
        />
        <Stat
          label="Team capacity"
          value="76%"
          detail="8 people active"
          icon={Users}
          tone="blue"
        />
        <Stat
          label="Overdue tasks"
          value="7"
          detail="Across 4 projects"
          icon={Clock3}
          tone="red"
        />
      </div>

      <div className="pf-dashboard-grid">
        <section className="pf-widget pf-widget-wide">
          <WidgetHeading
            title="My tasks"
            meta={`${assignedTasks.length} assigned`}
          />
          <TaskRows tasks={assignedTasks.slice(0, 4)} compact />
          <button
            className="pf-text-button"
            type="button"
            onClick={onOpenProjects}
          >
            Find tasks in projects <ChevronRight size={14} />
          </button>
        </section>

        <section className="pf-widget">
          <WidgetHeading title="Project health" meta="This week" />
          <div className="pf-health-list">
            {projects.slice(0, 3).map((project) => (
              <div key={project.id}>
                <span>{project.name}</span>
                <strong
                  className={project.status === 'At risk' ? 'is-risk' : ''}
                >
                  {project.status}
                </strong>
                <div>
                  <i style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-widget">
          <WidgetHeading title="Team workload" meta="8 members" />
          <div className="pf-workload">
            {[
              ['JR', 88],
              ['LN', 64],
              ['SP', 72],
              ['AK', 91],
            ].map(([initials, load]) => (
              <div key={initials}>
                <Avatar initials={String(initials)} small />
                <span>
                  <i style={{ width: `${load}%` }} />
                </span>
                <em>{load}%</em>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-widget">
          <WidgetHeading title="Upcoming" meta="Next 7 days" />
          <div className="pf-calendar-list">
            <div>
              <span>18</span>
              <p>
                <strong>Atlas review</strong>
                <small>10:30 · Product</small>
              </p>
            </div>
            <div>
              <span>21</span>
              <p>
                <strong>Research kickoff</strong>
                <small>14:00 · Research</small>
              </p>
            </div>
            <div>
              <span>23</span>
              <p>
                <strong>Billing sync</strong>
                <small>09:30 · Engineering</small>
              </p>
            </div>
          </div>
        </section>

        <section className="pf-widget pf-widget-wide">
          <WidgetHeading title="Recent activity" meta="All teams" />
          <div className="pf-activity-list">
            {activity.map((item) => (
              <div key={item.id}>
                <Avatar initials={initials(item.actor)} small />
                <p>
                  <strong>{item.actor}</strong> {item.action}{' '}
                  <span>{item.target}</span>
                </p>
                <time>{item.time}</time>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-widget pf-quick-links">
          <WidgetHeading title="Quick links" />
          <button type="button">
            <CalendarDays size={15} /> Team calendar
          </button>
          <button type="button">
            <BarChart3 size={15} /> Weekly report
          </button>
          <button type="button">
            <Users size={15} /> People directory
          </button>
        </section>
      </div>
    </div>
  );
}

function MyWork({
  tasks,
  query,
  onCreateTask,
}: {
  tasks: Task[];
  query: string;
  onCreateTask: () => void;
}) {
  const dueToday = tasks.filter((task) => task.dueLabel === 'Today');
  const upcoming = tasks.filter((task) => task.dueLabel !== 'Today');

  return (
    <div>
      <PageIntro
        eyebrow="My Work"
        title={
          query
            ? `Results for “${query}”`
            : `Good morning, ${currentUser.name.split(' ')[0]}`
        }
        description={
          query
            ? `${tasks.length} assigned tasks match your search.`
            : 'Four priorities need your attention. Everything else is on track.'
        }
        action={
          <button
            className="pf-primary-button"
            type="button"
            onClick={onCreateTask}
          >
            <Plus size={15} /> Create task
          </button>
        }
      />

      <div className="pf-focus-strip">
        <div>
          <Target size={17} />
          <span>Today</span>
          <strong>{dueToday.length}</strong>
          <small>tasks due</small>
        </div>
        <div>
          <Gauge size={17} />
          <span>In progress</span>
          <strong>
            {tasks.filter((task) => task.status === 'In progress').length}
          </strong>
          <small>active task</small>
        </div>
        <div>
          <Check size={17} />
          <span>Completed</span>
          <strong>11</strong>
          <small>this week</small>
        </div>
      </div>

      <section className="pf-work-section">
        <div className="pf-work-heading">
          <div>
            <span className="pf-section-marker marker-today" />
            <h3>Due today</h3>
            <small>{dueToday.length}</small>
          </div>
          <button type="button" aria-label="More due today options">
            <MoreHorizontal size={17} />
          </button>
        </div>
        {dueToday.length > 0 ? <TaskRows tasks={dueToday} /> : <EmptyTasks />}
      </section>

      <section className="pf-work-section">
        <div className="pf-work-heading">
          <div>
            <span className="pf-section-marker" />
            <h3>Upcoming</h3>
            <small>{upcoming.length}</small>
          </div>
          <button type="button" aria-label="More upcoming options">
            <MoreHorizontal size={17} />
          </button>
        </div>
        {upcoming.length > 0 ? <TaskRows tasks={upcoming} /> : <EmptyTasks />}
      </section>
    </div>
  );
}

function ProjectsView({
  selectedProject,
  tasks,
  showIndirectTaskPath,
  onSelectProject,
  onBack,
  onCreateTask,
}: {
  selectedProject: Project | null;
  tasks: Task[];
  showIndirectTaskPath: boolean;
  onSelectProject: (project: Project) => void;
  onBack: () => void;
  onCreateTask: () => void;
}) {
  if (selectedProject) {
    const projectTasks = tasks.filter(
      (task) => task.projectId === selectedProject.id,
    );
    return (
      <div>
        <button className="pf-back-button" type="button" onClick={onBack}>
          <ChevronLeft size={15} /> All projects
        </button>
        <PageIntro
          eyebrow={selectedProject.code}
          title={selectedProject.name}
          description={`${selectedProject.openTasks} open tasks · Due ${selectedProject.dueLabel}`}
          action={
            <button
              className="pf-primary-button"
              type="button"
              onClick={onCreateTask}
            >
              <Plus size={15} /> Add task
            </button>
          }
        />
        {showIndirectTaskPath && (
          <div
            className="pf-friction-path"
            aria-label="Task creation navigation path"
          >
            <span>Dashboard</span>
            <ChevronRight size={13} />
            <span>Projects</span>
            <ChevronRight size={13} />
            <span>{selectedProject.name}</span>
            <ChevronRight size={13} />
            <strong>Add task</strong>
          </div>
        )}
        <section className="pf-work-section">
          <div className="pf-work-heading">
            <div>
              <span className="pf-section-marker" />
              <h3>Project tasks</h3>
              <small>{projectTasks.length}</small>
            </div>
          </div>
          <TaskRows tasks={projectTasks} />
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Workspace"
        title="Projects"
        description="Plan, track, and deliver work across every team."
      />
      <div className="pf-project-grid">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project)}
          >
            <div className="pf-project-head">
              <span>{project.code}</span>
              <ProjectStatus status={project.status} />
            </div>
            <h3>{project.name}</h3>
            <p>
              {project.openTasks} open tasks · Due {project.dueLabel}
            </p>
            <div className="pf-project-progress">
              <span>
                <i style={{ width: `${project.progress}%` }} />
              </span>
              <strong>{project.progress}%</strong>
            </div>
            <div className="pf-project-foot">
              <AvatarStack members={project.members} />
              <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskDirectory({
  tasks,
  query,
  onQueryChange,
}: {
  tasks: Task[];
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div>
      <PageIntro
        eyebrow="Workspace"
        title="Task directory"
        description="Browse tasks across all projects and teams."
      />
      <section className="pf-directory">
        <div className="pf-directory-toolbar">
          <label>
            <Search size={15} />
            <span className="sr-only">Search tasks</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search tasks"
            />
          </label>
          <button type="button">
            <Users size={15} /> Assignee
          </button>
          <button type="button">
            <FolderKanban size={15} /> Project
          </button>
        </div>
        <TaskRows tasks={tasks} />
      </section>
    </div>
  );
}

function ReportsView() {
  return (
    <div>
      <PageIntro
        eyebrow="Workspace"
        title="Reports"
        description="Static summaries from across your projects."
      />
      <div className="pf-report-grid">
        <section>
          <WidgetHeading title="Tasks completed" meta="Last 6 weeks" />
          <MiniBars values={[35, 48, 42, 64, 58, 72]} />
          <strong>248</strong>
          <p>Completed tasks</p>
        </section>
        <section>
          <WidgetHeading title="Cycle time" meta="30-day average" />
          <div className="pf-donut">
            <span>
              4.8<small>days</small>
            </span>
          </div>
          <p>Down 3% from last month</p>
        </section>
        <section>
          <WidgetHeading title="Work by status" meta="All teams" />
          <div className="pf-status-breakdown">
            <span style={{ width: '28%' }} />
            <span style={{ width: '37%' }} />
            <span style={{ width: '16%' }} />
            <span style={{ width: '19%' }} />
          </div>
          <p>126 active tasks</p>
        </section>
      </div>
    </div>
  );
}

function InsightsView() {
  return (
    <div>
      <PageIntro
        eyebrow="Insights"
        title="Work is moving faster"
        description="A concise view of delivery health and emerging risks."
      />
      <div className="pf-insight-hero">
        <div>
          <Zap size={19} />
          <span>Delivery signal</span>
          <strong>8.4</strong>
          <small>Healthy · +0.6 this week</small>
        </div>
        <MiniBars values={[42, 51, 48, 66, 73, 84]} />
      </div>
      <section className="pf-work-section">
        <div className="pf-work-heading">
          <div>
            <span className="pf-section-marker marker-today" />
            <h3>Needs attention</h3>
            <small>2</small>
          </div>
        </div>
        <div className="pf-insight-row">
          <span className="pf-insight-icon insight-risk">
            <Clock3 size={16} />
          </span>
          <div>
            <strong>Atlas launch has 3 blocked tasks</strong>
            <p>Release confidence may fall below target by Friday.</p>
          </div>
          <button type="button">
            Review <ChevronRight size={14} />
          </button>
        </div>
        <div className="pf-insight-row">
          <span className="pf-insight-icon">
            <Users size={16} />
          </span>
          <div>
            <strong>Engineering capacity is concentrated</strong>
            <p>Two owners hold 61% of in-progress work.</p>
          </div>
          <button type="button">
            Review <ChevronRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsView() {
  return (
    <div>
      <PageIntro
        eyebrow="Workspace"
        title="Settings"
        description="Manage ProjectFlow preferences and workspace defaults."
      />
      <section className="pf-settings-list">
        <button type="button">
          <CircleUserRound size={18} />
          <div>
            <strong>Profile</strong>
            <span>Personal details and preferences</span>
          </div>
          <ChevronRight size={16} />
        </button>
        <button type="button">
          <Bell size={18} />
          <div>
            <strong>Notifications</strong>
            <span>Email and activity alerts</span>
          </div>
          <ChevronRight size={16} />
        </button>
        <button type="button">
          <Users size={18} />
          <div>
            <strong>Workspace members</strong>
            <span>Roles, teams, and access</span>
          </div>
          <ChevronRight size={16} />
        </button>
      </section>
    </div>
  );
}

function TaskComposer({
  quickCreate,
  selectedProject,
  onClose,
  onSubmit,
}: {
  quickCreate: boolean;
  selectedProject: Project | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="pf-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="pf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-composer-title"
      >
        <div className="pf-modal-heading">
          <div>
            <span>{quickCreate ? 'Quick create' : 'Project task'}</span>
            <h3 id="task-composer-title">Create a task</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task composer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            Task title
            <input
              name="title"
              required
              autoFocus
              placeholder="What needs to be done?"
            />
          </label>
          <div className="pf-form-grid">
            <label>
              Project
              <select
                name="project"
                defaultValue={selectedProject?.id ?? projects[0]!.id}
              >
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue="Medium">
                <option>Medium</option>
                <option>High</option>
                <option>Low</option>
              </select>
            </label>
          </div>
          <label>
            Assignee
            <input value={currentUser.name} readOnly />
          </label>
          <div className="pf-modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="pf-primary-button" type="submit">
              <Plus size={15} /> Create task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pf-page-intro">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div>
      <span className={`pf-stat-icon stat-${tone}`}>
        <Icon size={16} />
      </span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function WidgetHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="pf-widget-heading">
      <h3>{title}</h3>
      {meta && <span>{meta}</span>}
      <button type="button" aria-label={`More ${title} options`}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function TaskRows({
  tasks,
  compact = false,
}: {
  tasks: Task[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'pf-task-rows is-compact' : 'pf-task-rows'}>
      {tasks.map((task) => {
        const project = projectForTask(task);
        return (
          <div className="pf-task-row" key={task.id}>
            <button
              type="button"
              className={
                task.status === 'Done'
                  ? 'pf-task-check is-done'
                  : 'pf-task-check'
              }
              aria-label={`Mark ${task.title} complete`}
            >
              {task.status === 'Done' && <Check size={12} />}
            </button>
            <div className="pf-task-main">
              <strong>{task.title}</strong>
              <span>
                <em>{task.id}</em>
                {project.name}
              </span>
            </div>
            <Priority value={task.priority} />
            <span className="pf-task-status">{task.status}</span>
            <span
              className={
                task.dueLabel === 'Today'
                  ? 'pf-task-due is-today'
                  : 'pf-task-due'
              }
            >
              {task.dueLabel}
            </span>
            <Avatar initials={initials(task.assignee)} small />
          </div>
        );
      })}
    </div>
  );
}

function Priority({ value }: { value: Task['priority'] }) {
  return (
    <span className={`pf-priority priority-${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}

function ProjectStatus({ status }: { status: Project['status'] }) {
  return (
    <span
      className={`pf-project-status status-${status.toLowerCase().replace(' ', '-')}`}
    >
      <i />
      {status}
    </span>
  );
}

function Avatar({
  initials: value,
  small = false,
}: {
  initials: string;
  small?: boolean;
}) {
  return (
    <span
      className={small ? 'pf-avatar is-small' : 'pf-avatar'}
      aria-label={value}
    >
      {value}
    </span>
  );
}

function AvatarStack({ members }: { members: string[] }) {
  return (
    <div className="pf-avatar-stack">
      {members.slice(0, 3).map((member) => (
        <Avatar key={member} initials={member} small />
      ))}
      {members.length > 3 && <span>+{members.length - 3}</span>}
    </div>
  );
}

function MiniBars({ values }: { values: number[] }) {
  return (
    <div className="pf-mini-bars" aria-hidden="true">
      {values.map((value, index) => (
        <span key={index} style={{ height: `${value}%` }} />
      ))}
    </div>
  );
}

function EmptyTasks() {
  return (
    <div className="pf-empty">
      <CheckCircle2 size={18} />
      <span>No matching tasks</span>
    </div>
  );
}

function routeLabel(route: ProjectFlowRoute) {
  return route
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('');
}
