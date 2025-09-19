import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { projectStore, setProjectId } from './lib/stores/project';
import { chatStore } from './lib/stores/chat';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';
import { useSyncService } from '~/lib/services/useSyncService';

function setTheme(newTheme: 'light' | 'dark') {
  // Update the theme store
  themeStore.set(newTheme);

  // Update localStorage
  localStorage.setItem('uncubed_theme', newTheme);

  // Update the HTML attribute
  document.querySelector('html')?.setAttribute('data-theme', newTheme);

  // Update user profile if it exists
  try {
    const userProfile = localStorage.getItem('uncubed_user_profile');

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = newTheme;
      localStorage.setItem('uncubed_user_profile', JSON.stringify(profile));
    }
  } catch (error) {
    console.error('Error updating user profile theme:', error);
  }

  logStore.logSystem(`Theme set to ${newTheme} mode from parent`);
}

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/diy/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('uncubed_theme');

    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

const inlineFetchOverrideCode = stripIndents`
  // Global fetch override for /diy base path
  (function() {
    if (typeof window !== 'undefined' && window.fetch) {
      console.log('🔧 Initializing early global fetch override for /diy base path');
      
      const originalFetch = window.fetch;
      
      window.fetch = function(input, init) {
        if (typeof input === 'string' && input.startsWith('/api')) {
          console.log('🔄 Early redirecting API call:', input, '→', '/diy' + input);
          const url = new URL(input, window.location.origin);
          url.pathname = '/diy' + url.pathname;
          return originalFetch(url.toString(), init);
        } else if (input instanceof URL && input.pathname.startsWith('/api')) {
          console.log('🔄 Early redirecting API call:', input.pathname, '→', '/diy' + input.pathname);
          const url = new URL(input);
          url.pathname = '/diy' + url.pathname;
          return originalFetch(url.toString(), init);
        }
        return originalFetch(input, init);
      };
      
      console.log('✅ Early global fetch override initialized successfully');
    }
  })();
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
    <script dangerouslySetInnerHTML={{ __html: inlineFetchOverrideCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';

export default function App() {
  const { lastSyncedAt } = useSyncService();
  const theme = useStore(themeStore);
  const projectId = useStore(projectStore);

  useEffect(() => {
    import('./utils/globalFetch');
    logStore.logSystem('Application initialized', {
      theme,
      lastSyncedAt,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from the parent window
      if (event.source !== window.parent) {
        return;
      }

      // Validate the message structure
      if (event.data && typeof event.data === 'object' && 'projectId' in event.data) {
        const receivedProjectId = event.data.projectId;

        if (typeof receivedProjectId === 'string' && receivedProjectId.trim()) {
          console.log('Received projectId from parent:', receivedProjectId);
          setProjectId(receivedProjectId);
        }
      }

      // Handle prompt property
      if (event.data && typeof event.data === 'object' && 'prompt' in event.data) {
        const receivedPrompt = event.data.prompt;

        if (typeof receivedPrompt === 'string' && receivedPrompt.trim()) {
          console.log('Received prompt from parent:', receivedPrompt);
          chatStore.setKey('prompt', receivedPrompt);
        }
      }

      // Handle theme property
      if (event.data && typeof event.data === 'object' && 'theme' in event.data) {
        const receivedTheme = event.data.theme;

        if (typeof receivedTheme === 'string' && (receivedTheme === 'light' || receivedTheme === 'dark')) {
          console.log('Received theme from parent:', receivedTheme);
          setTheme(receivedTheme);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Log current projectId for debugging
  useEffect(() => {
    if (projectId) {
      console.log('Current projectId:', projectId);
    }
  }, [projectId]);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
