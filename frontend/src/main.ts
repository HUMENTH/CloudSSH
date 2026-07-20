import { THEMES } from './terminal';
import type { SSHTerminal } from './terminal';
import { ConnectionForm } from './auth-form';
import { ServerList } from './server-list';
import { TabManager } from './tab-manager';
import { AIConfigPanel } from './ai-config';

// ==================== Global State ====================

let tabManager: TabManager | null = null;
let connectionForm: ConnectionForm | null = null;
let serverList: ServerList | null = null;
let isLoggedIn = false;

/** Get or initialize TabManager singleton */
function getTabManager(): TabManager {
  if (!tabManager) {
    tabManager = new TabManager('tab-bar', 'terminal-area');
    tabManager.setAllTabsClosedHandler(() => {
      showOfflineUI();
    });
    tabManager.setLoggedIn(isLoggedIn);

    // Bind new-tab-btn
    bindNewTabButton();
  }
  return tabManager;
}

function bindNewTabButton(): void {
  // Use event delegation since TabManager.renderTabBar() will rebuild the button
  document.getElementById('tab-bar')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('#new-tab-btn');
    if (!btn) return;
    // Click + button: go back to connection page to create new connection
    showConnectionPage();
  });
}

// ==================== Standalone Terminal Tab Mode ====================

function isTerminalTab(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('wsUrl');
}

function validateWsUrl(wsUrl: string): boolean {
  try {
    const url = new URL(wsUrl);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return false;
    return url.origin === window.location.origin ||
           url.origin === window.location.origin.replace(/^http/, 'ws');
  } catch {
    return false;
  }
}

function initTerminalTab(): void {
  const params = new URLSearchParams(window.location.search);
  const wsUrl = params.get('wsUrl')!;
  const serverName = params.get('name') || 'Server';
  const host = params.get('host') || '';
  const port = parseInt(params.get('port') || '0') || 0;

  if (!validateWsUrl(wsUrl)) {
    document.body.innerHTML = '<div style="color:var(--error);padding:2em;font-family:monospace;">Error: Invalid or untrusted WebSocket URL.</div>';
    return;
  }

  // 隐藏所有非终端元素
  document.getElementById('auth-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.remove('flex');
  document.getElementById('terminal-section')!.classList.remove('hidden');
  document.getElementById('terminal-section')!.classList.add('flex');
  document.body.classList.add('terminal-active');

  // Hide tab bar (URL direct connect mode has only one tab, no need for tab bar)
  const tabBar = document.getElementById('tab-bar');
  if (tabBar) tabBar.style.display = 'none';

  const tm = getTabManager();
  const tab = tm.createTab(serverName, host && port ? { host, port } : undefined);

  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  const hostInfo = host && port ? { host, port } : undefined;
  tab.terminal.connectWithWebSocket(ws, hostInfo);
}

// ==================== Page Navigation ====================

function showAuthSection(): void {
  document.getElementById('auth-section')!.classList.remove('hidden');
  document.getElementById('user-space-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.remove('flex');
  document.getElementById('terminal-section')!.classList.add('hidden');
  document.getElementById('terminal-section')!.classList.remove('flex');
  document.body.classList.remove('terminal-active');
  document.getElementById('server-modal')!.classList.add('hidden');
  document.getElementById('server-modal')!.classList.remove('flex');

  if (!connectionForm) {
    connectionForm = new ConnectionForm({
      getTabManager,
    });
  }
}

function showUserSpace(user: { id: number; github_id: number; username: string; avatar_url: string }): void {
  isLoggedIn = true;
  document.getElementById('auth-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.remove('hidden');
  document.getElementById('user-space-section')!.classList.add('flex');
  document.getElementById('terminal-section')!.classList.add('hidden');
  document.getElementById('terminal-section')!.classList.remove('flex');
  document.body.classList.remove('terminal-active');

  // Show agent toggle button for logged-in users
  document.getElementById('agent-toggle-btn')?.classList.remove('hidden');

  serverList = new ServerList(
    user,
    // onLogout callback
    () => {
      isLoggedIn = false;
      serverList = null;
      if (tabManager) {
        tabManager.closeAllTabs();
      }
      showAuthSection();
    },
    // onConnect callback - create new tab in current page
    (wsUrl: string, serverName: string, hostInfo?: { host: string; port: number }) => {
      showTerminalFromServer(wsUrl, serverName, hostInfo);
    }
  );
}

/** Show connection page (anonymous → auth-form, logged-in → server list) */
function showConnectionPage(): void {
  // If there are still active tabs, no need to hide terminal area; just overlay the connection page
  // But for simplicity, we switch back to the corresponding entry page first
  if (isLoggedIn) {
    document.getElementById('terminal-section')!.classList.add('hidden');
    document.getElementById('terminal-section')!.classList.remove('flex');
    document.body.classList.remove('terminal-active');
    document.getElementById('user-space-section')!.classList.remove('hidden');
    document.getElementById('user-space-section')!.classList.add('flex');
  } else {
    document.getElementById('terminal-section')!.classList.add('hidden');
    document.getElementById('terminal-section')!.classList.remove('flex');
    document.body.classList.remove('terminal-active');
    showAuthSection();
  }
}

function showOfflineUI(): void {
  if (isTerminalTab()) {
    window.close();
    return;
  }

  // 如果还有其他标签，不回到连接页
  if (tabManager && tabManager.hasAnyTab()) {
    return;
  }

  const termSection = document.getElementById('terminal-section');
  if (termSection) {
    termSection.classList.add('hidden');
    termSection.classList.remove('flex');
    document.body.classList.remove('terminal-active');
  }

  if (isLoggedIn) {
    document.getElementById('user-space-section')?.classList.remove('hidden');
    document.getElementById('user-space-section')?.classList.add('flex');
  } else {
    showAuthSection();
  }

  document.getElementById('status-text')!.innerHTML = '<span class="w-2 h-2 bg-surface-dot inline-block"></span> STATUS: OFFLINE';
}

/** 在终端页面创建新标签并显示终端视图 */
function showTerminalWithNewTab(
  label: string,
  displayLabel: string,
  hostInfo?: { host: string; port: number; username?: string }
): { tab: ReturnType<TabManager['createTab']>; terminal: SSHTerminal } {
  document.getElementById('auth-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.add('hidden');
  document.getElementById('user-space-section')!.classList.remove('flex');
  document.getElementById('terminal-section')!.classList.remove('hidden');
  document.getElementById('terminal-section')!.classList.add('flex');
  document.body.classList.add('terminal-active');

  const tm = getTabManager();
  const tab = tm.createTab(displayLabel, hostInfo);

  return { tab, terminal: tab.terminal };
}

function showTerminalFromServer(wsUrl: string, serverName: string, hostInfo?: { host: string; port: number }): void {
  if (!validateWsUrl(wsUrl)) {
    alert('Invalid WebSocket URL');
    return;
  }

  const { terminal } = showTerminalWithNewTab(
    serverName,
    serverName,
    hostInfo
  );

  terminal.mount();

  // Establish connection via wsUrl (contains one-time-token)
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  terminal.connectWithWebSocket(ws, hostInfo);
}

// ==================== Disconnect Handling ====================

document.getElementById('disconnect-btn')?.addEventListener('click', () => {
  const tm = tabManager;
  if (!tm) return;

  const tab = tm.getActiveTab();
  if (!tab) return;

  tab.sftpPanel?.hide();
  tab.terminal.disconnect();
  tm.closeActiveTab();
});

// ==================== SFTP Panel ====================

document.getElementById('sftp-toggle-btn')?.addEventListener('click', () => {
  const tab = tabManager?.getActiveTab();
  if (!tab) return;

  if (!tab.sftpPanel) {
    // SFTP panel is initialized by TabManager's sessionReady callback
    // If not yet initialized, SSH is not ready
    return;
  }
  tab.sftpPanel.toggle();
});

// ==================== AI Agent Panel ====================

const aiConfigPanel = new AIConfigPanel();

document.getElementById('agent-toggle-btn')?.addEventListener('click', () => {
  const tab = tabManager?.getActiveTab();
  if (!tab?.agentPanel) return;
  tab.agentPanel.toggle();
});

/** Show AI config panel (called from server-list) */
export function showAIConfig(): void {
  aiConfigPanel.show();
}

// ==================== Terminal Search ====================

document.getElementById('search-btn')?.addEventListener('click', () => {
  tabManager?.getActiveTab()?.terminal.toggleSearch();
});

// ==================== Export Terminal Log ====================

document.getElementById('export-btn')?.addEventListener('click', () => {
  tabManager?.getActiveTab()?.terminal.exportToFile();
});

// ==================== Theme Switching ====================

const CUSTOM_THEME_VALUE = '__custom__';
const themeSelector = document.getElementById('theme-selector') as HTMLSelectElement | null;

/** 获取一个可用于主题操作的终端实例（当前活跃标签的终端） */
function getThemeTerminal(): SSHTerminal | null {
  return tabManager?.getActiveTab()?.terminal || null;
}

themeSelector?.addEventListener('change', (e) => {
  const value = (e.target as HTMLSelectElement).value;
  if (value === CUSTOM_THEME_VALUE) {
    const importedRaw = localStorage.getItem('cloudssh_imported_theme');
    if (importedRaw) {
      try {
        getThemeTerminal()?.applyImportedTheme(JSON.parse(importedRaw));
      } catch { /* ignore */ }
    }
  } else {
    getThemeTerminal()?.setTheme(value as keyof typeof THEMES);
    localStorage.removeItem('cloudssh_imported_theme');
  }
  localStorage.setItem('cloudssh_theme_selection', value);
});

function ensureCustomOption(): void {
  if (!themeSelector) return;
  if (!themeSelector.querySelector(`option[value="${CUSTOM_THEME_VALUE}"]`)) {
    const opt = document.createElement('option');
    opt.value = CUSTOM_THEME_VALUE;
    opt.textContent = 'Custom';
    themeSelector.insertBefore(opt, themeSelector.firstChild);
  }
}

// ==================== Theme Import ====================

const importThemeBtn = document.getElementById('import-theme-btn');
const importThemeInput = document.getElementById('import-theme-input') as HTMLInputElement | null;

importThemeBtn?.addEventListener('click', () => {
  importThemeInput?.click();
});

importThemeInput?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target!.result as string);
      if (!data.ui || typeof data.ui !== 'object') {
        alert('Invalid theme file: missing "ui" field');
        return;
      }

      // Save to localStorage
      localStorage.setItem('cloudssh_imported_theme', JSON.stringify(data));

      // Try to save to cloud
      try {
        await fetch('/api/user/theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme_data: data }),
        });
      } catch { /* Not logged in or network error, ignore */ }

      // Add Custom option and select it
      ensureCustomOption();
      if (themeSelector) themeSelector.value = CUSTOM_THEME_VALUE;
      localStorage.setItem('cloudssh_theme_selection', CUSTOM_THEME_VALUE);

      // Apply theme directly without refreshing page (to avoid disconnecting WebSocket)
      getThemeTerminal()?.applyImportedTheme(data);
    } catch {
      alert('Invalid JSON file');
    }
  };
  reader.readAsText(file);
  importThemeInput.value = '';
});

// ==================== Theme Restore ====================

/** Restore theme (called during init, no terminal instance yet, only set UI variables) */
async function restoreTheme(): Promise<void> {
  const selection = localStorage.getItem('cloudssh_theme_selection');

  // Try to load custom theme from cloud
  let cloudTheme: Record<string, unknown> | null = null;
  try {
    const res = await fetch('/api/user/theme');
    if (res.ok) {
      const { theme } = await res.json() as { theme: Record<string, unknown> | null };
      if (theme) {
        cloudTheme = theme;
        // Sync to localStorage
        localStorage.setItem('cloudssh_imported_theme', JSON.stringify(theme));
        ensureCustomOption();
      }
    }
  } catch { /* Not logged in, ignore */ }

  // If no cloud theme but localStorage has one, also add Custom option
  if (!cloudTheme) {
    const localRaw = localStorage.getItem('cloudssh_imported_theme');
    if (localRaw) {
      try {
        JSON.parse(localRaw);
        ensureCustomOption();
      } catch {
        localStorage.removeItem('cloudssh_imported_theme');
      }
    }
  }

  // Restore selection: apply UI variables (terminal theme is applied when creating tab)
  if (selection === CUSTOM_THEME_VALUE) {
    const raw = localStorage.getItem('cloudssh_imported_theme');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        // Apply UI variables
        if (data.ui) {
          const root = document.documentElement;
          Object.entries(data.ui).forEach(([prop, val]) => {
            root.style.setProperty(prop, val as string);
          });
        }
        if (themeSelector) themeSelector.value = CUSTOM_THEME_VALUE;
        return;
      } catch { /* ignore */ }
    }
  }

  if (selection && THEMES[selection as keyof typeof THEMES]) {
    // Apply UI variables (no terminal instance needed)
    const { UI_THEMES } = await import('./terminal');
    const uiVars = UI_THEMES[selection as keyof typeof THEMES];
    if (uiVars) {
      const root = document.documentElement;
      Object.entries(uiVars).forEach(([prop, val]) => {
        root.style.setProperty(prop, val);
      });
    }
    if (themeSelector) themeSelector.value = selection;
    return;
  }

  // Default theme: only set UI variables
  const { UI_THEMES } = await import('./terminal');
  const uiVars = UI_THEMES.cyberpunk;
  if (uiVars) {
    const root = document.documentElement;
    Object.entries(uiVars).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });
  }
  if (themeSelector) themeSelector.value = 'cyberpunk';
}

// ==================== Initialization ====================

async function init(): Promise<void> {
  await restoreTheme();
  // Set copyright year
  const copyrightYearSpan = document.getElementById('copyright-year');
  if (copyrightYearSpan) {
    copyrightYearSpan.textContent = new Date().getFullYear().toString();
  }

  // Standalone terminal tab mode: URL contains wsUrl parameter
  if (isTerminalTab()) {
    initTerminalTab();
    return;
  }

  try {
    // Check if logged in
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const user = await meRes.json();
      showUserSpace(user);
      return;
    }
  } catch {
    // /api/auth/me failed, continue to show anonymous connection form
  }

  // Not logged in → show anonymous connection form
  showAuthSection();
}

// Export for use by auth-form and server-list
export { getTabManager, showTerminalWithNewTab, validateWsUrl };

init();
