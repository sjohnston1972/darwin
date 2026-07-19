import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const timestamp = '2026-07-18T10:00:00.000Z';
const repository = {
  owner: 'sjohnston1972',
  name: 'projectflow',
  fullName: 'sjohnston1972/projectflow',
  url: 'https://github.com/sjohnston1972/projectflow',
  branch: 'main',
  baseSha: 'd'.repeat(40),
  sourceHash: 'e'.repeat(64),
  capturedAt: timestamp,
  mutablePaths: ['apps/projectflow/src/App.tsx'],
  protectedPaths: ['.github/**'],
  contextPaths: ['apps/projectflow/src/App.tsx'],
  validationCommands: ['npm run verify'],
  maximumChangedFiles: 4,
  maximumChangedLines: 1200,
  productionUrl: 'https://darwin-projectflow.pages.dev/',
  studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
};
const targetConnection = {
  connectionId: 'target-visual-test',
  status: 'connected',
  connectedAt: timestamp,
  verifiedAt: timestamp,
  target: {
    targetId: 'projectflow',
    name: 'ProjectFlow',
    purpose: 'Task management for coordinated delivery.',
    defaultBranch: 'main',
  },
  repository,
  checks: [
    {
      id: 'repository',
      label: 'GitHub repository',
      status: 'passed',
      detail: 'sjohnston1972/projectflow at dddddddddddd',
    },
    {
      id: 'contract',
      label: 'Darwin target contract',
      status: 'passed',
      detail: '1 mutable path, 1 validation command',
    },
    {
      id: 'runtime',
      label: 'Cloudflare runtime',
      status: 'passed',
      detail: 'Measured runtime returned 200',
    },
    {
      id: 'telemetry',
      label: 'Measured study',
      status: 'passed',
      detail: 'Privacy-safe semantic telemetry configured',
    },
  ],
};

const workspaces = [
  { name: 'control-room', path: '/', heading: 'Darwin' },
  {
    name: 'target-application',
    path: '/?view=target',
    heading: 'Connect a target application',
  },
  {
    name: 'observations',
    path: '/?view=observations',
    heading: 'Observations',
  },
  { name: 'mutations', path: '/?view=mutations', heading: 'Mutations' },
  {
    name: 'system-status',
    path: '/?view=status',
    heading: 'System status',
  },
  { name: 'genome', path: '/?view=genome', heading: 'Genome' },
] as const;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: status === 204 ? '' : JSON.stringify(body),
  });

const installApi = async (page: Page) => {
  await page.route('http://localhost:8787/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/api/auth/session')) {
      return json(route, {
        actor: 'playwright-operator',
        capabilities: ['observe', 'mutate', 'admin'],
      });
    }
    if (path.endsWith('/api/health')) {
      return json(route, {
        status: 'ok',
        service: 'darwin-api',
        version: '0.23.0',
        analysis: {
          mode: 'live',
          model: 'gpt-5.6',
          liveModelAvailable: true,
        },
        timestamp,
      });
    }
    if (path.endsWith('/events')) {
      return json(route, {
        studyId: 'projectflow-baseline-study',
        events: [],
        count: 0,
        sessionCounts: {},
        participantCount: 0,
        behaviorSignalCount: 0,
      });
    }
    if (
      path.endsWith('/evidence/latest') ||
      path.endsWith('/evidence-analysis/latest')
    ) {
      return json(route, null, 204);
    }
    if (path.endsWith('/api/genome')) {
      return json(route, {
        evolutionCycle: {
          studyId: 'projectflow-baseline-study',
          startedAt: null,
          genomeEvolutionCount: 0,
        },
        executions: [],
      });
    }
    if (path.endsWith('/api/observations/archives')) {
      return json(route, { archives: [] });
    }
    if (path.endsWith('/api/target-connection')) {
      return json(route, targetConnection);
    }
    return json(route, { error: 'unexpected_visual_test_route', path }, 404);
  });
};

const waitForWorkspace = async (
  page: Page,
  workspace: (typeof workspaces)[number],
) => {
  await page.goto(workspace.path);
  const heading = page
    .getByRole('heading', { name: workspace.heading, exact: true })
    .first();
  try {
    await expect(heading).toBeVisible({ timeout: 4_000 });
  } catch {
    await page.reload();
    await expect(heading).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
};

const visibleSubfloorText = async (page: Page) =>
  page.locator('body *').evaluateAll((elements) =>
    elements.flatMap((element) => {
      if (!(element instanceof HTMLElement)) return [];
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const hasText = [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (
        !hasText ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        bounds.width === 0 ||
        bounds.height === 0
      ) {
        return [];
      }
      const size = Number.parseFloat(style.fontSize);
      return size < 12
        ? [
            {
              element: element.tagName.toLowerCase(),
              className: element.className,
              size,
              text: element.textContent?.trim().slice(0, 80),
            },
          ]
        : [];
    }),
  );

const visibleContrastViolations = async (page: Page) =>
  page.locator('body *').evaluateAll((elements) => {
    type Rgba = [number, number, number, number];
    const parseColor = (value: string): Rgba | null => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) return null;
      return [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1];
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] +
          background[0] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] +
          background[1] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] +
          background[2] * background[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    };
    const luminance = (color: Rgba) => {
      const [red, green, blue] = color
        .slice(0, 3)
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        );
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
    };
    const ratio = (foreground: Rgba, background: Rgba) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    };
    const rootBackground =
      parseColor(getComputedStyle(document.documentElement).backgroundColor) ??
      ([255, 255, 255, 1] as Rgba);

    return elements.flatMap((element) => {
      if (!(element instanceof HTMLElement)) return [];
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const hasText = [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      );
      if (
        !hasText ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        bounds.width === 0 ||
        bounds.height === 0 ||
        element.closest('button:disabled, [aria-disabled="true"], .hero-band')
      ) {
        return [];
      }

      const ancestors: HTMLElement[] = [];
      let current: HTMLElement | null = element;
      while (current) {
        ancestors.unshift(current);
        current = current.parentElement;
      }
      if (
        ancestors.some(
          (ancestor) => getComputedStyle(ancestor).backgroundImage !== 'none',
        )
      ) {
        return [];
      }
      const background = ancestors.reduce((color, ancestor) => {
        const next = parseColor(getComputedStyle(ancestor).backgroundColor);
        return next ? composite(next, color) : color;
      }, rootBackground);
      const foreground = parseColor(style.color);
      if (!foreground) return [];
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const required =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      const actual = ratio(composite(foreground, background), background);
      return actual + 0.01 < required
        ? [
            {
              element: element.tagName.toLowerCase(),
              className: element.className,
              text: element.textContent?.trim().slice(0, 80),
              actual: Math.round(actual * 100) / 100,
              required,
              foreground: style.color,
              background: style.backgroundColor,
            },
          ]
        : [];
    });
  });

const relativeLuminance = (hex: string) => {
  const channels = hex
    .match(/[a-f\d]{2}/gi)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};

const contrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

test('semantic type tokens enforce the 12px floor', async () => {
  const [styles, application] = await Promise.all([
    readFile('apps/web/src/styles.css', 'utf8'),
    readFile('apps/web/src/App.tsx', 'utf8'),
  ]);
  expect(styles).toContain('--type-caption: 0.75rem');
  expect(styles).toContain('--type-supporting: 0.875rem');
  const explicitViolations = [...styles.matchAll(/font-size:\s*([\d.]+)px/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 12);
  const utilityViolations = [...application.matchAll(/text-\[([\d.]+)px\]/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 12);
  expect(explicitViolations).toEqual([]);
  expect(utilityViolations).toEqual([]);
});

test('dark and light semantic text pairs meet WCAG AA', () => {
  const pairs = [
    ['dark supporting text', '#a9b2ac', '#101211'],
    ['dark green status', '#b9f36b', '#141715'],
    ['dark green evidence chip', '#68d4a4', '#181b19'],
    ['light supporting text', '#5f6f7c', '#ffffff'],
    ['light green status', '#3f632c', '#f3faed'],
    ['light green evidence chip', '#087f5b', '#ecfdf5'],
    ['light primary action', '#ffffff', '#0369a1'],
    ['light muted evidence text', '#647888', '#ffffff'],
    ['light amber evidence text', '#a16207', '#fffbeb'],
  ] as const;
  for (const [name, foreground, background] of pairs) {
    expect(contrastRatio(foreground, background), name).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});

test('all workspaces reflow at 100%, 125%, and 200% zoom', async ({ page }) => {
  await installApi(page);
  for (const zoom of [1, 1.25, 2]) {
    await page.setViewportSize({
      width: Math.floor(1440 / zoom),
      height: Math.floor(1000 / zoom),
    });
    for (const workspace of workspaces) {
      await waitForWorkspace(page, workspace);
      expect(
        await visibleSubfloorText(page),
        `${workspace.name} at ${zoom * 100}%`,
      ).toEqual([]);
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(
        horizontalOverflow,
        `${workspace.name} at ${zoom * 100}%`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('rendered workspace text meets WCAG AA in both themes', async ({
  page,
}) => {
  await installApi(page);
  await waitForWorkspace(page, workspaces[0]);
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((nextTheme) => {
      localStorage.setItem('darwin-theme', nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    for (const workspace of workspaces) {
      await waitForWorkspace(page, workspace);
      expect(
        await visibleContrastViolations(page),
        `${workspace.name} in ${theme} theme`,
      ).toEqual([]);
    }
  }
});

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const) {
  for (const workspace of workspaces) {
    test(`${workspace.name} type layout · ${scenario.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(scenario.viewport);
      await installApi(page);
      await waitForWorkspace(page, workspace);
      expect(await visibleSubfloorText(page)).toEqual([]);
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await expect(page).toHaveScreenshot(
        `${workspace.name}-${scenario.name}.png`,
        {
          animations: 'disabled',
          caret: 'hide',
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        },
      );
    });
  }
}
