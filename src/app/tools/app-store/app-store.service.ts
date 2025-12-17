import { Injectable } from '@angular/core';
import { IMenuItem } from '../../configs/menu.config';

export interface AppItem extends IMenuItem {
  id: string;
  description?: string;
  enabled?: boolean;
}

// 默认的 App 列表，前6个会显示在 header 上
export const DEFAULT_APPS: AppItem[] = [
  {
    id: 'code-viewer',
    name: 'MENU.CODE',
    description: 'APP_STORE.CODE_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'code-viewer' },
    icon: 'fa-light fa-rectangle-code',
    router: ['/main/blockly-editor'],
    enabled: true
  },
  {
    id: 'lib-manager',
    name: 'MENU.LIB_MANAGER',
    description: 'APP_STORE.LIB_MANAGER_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'lib-manager' },
    icon: 'fa-light fa-books',
    router: ['/main/code-editor'],
    enabled: true
  },
  {
    id: 'serial-monitor',
    name: 'MENU.TOOL_SERIAL',
    description: 'APP_STORE.SERIAL_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'serial-monitor' },
    icon: 'fa-light fa-monitor-waveform',
    enabled: true
  },
  {
    id: 'aily-chat',
    name: 'MENU.AI',
    description: 'APP_STORE.AI_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'aily-chat' },
    icon: 'fa-light fa-star-christmas',
    more: 'AI',
    enabled: true
  },
  {
    id: 'model-store',
    name: 'MENU.MODEL_STORE',
    description: 'APP_STORE.MODEL_STORE_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'model-store' },
    icon: 'fa-light fa-microchip-ai',
    enabled: true
  },
  {
    id: 'cloud-space',
    name: 'MENU.USER_SPACE',
    description: 'APP_STORE.CLOUD_SPACE_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'cloud-space' },
    icon: 'fa-light fa-cloud',
    enabled: true
  },
  {
    id: 'user-center',
    name: 'MENU.USER_AUTH',
    description: 'APP_STORE.USER_CENTER_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'user-center' },
    icon: 'fa-light fa-user',
    enabled: true
  },
  {
    id: 'simulator',
    name: 'MENU.SIMULATOR',
    description: 'APP_STORE.SIMULATOR_DESC',
    action: 'tool-open',
    data: { type: 'tool', data: 'simulator' },
    icon: 'fa-light fa-atom',
    router: ['/main/blockly-editor'],
    dev: true,
    enabled: false
  }
];

@Injectable({
  providedIn: 'root'
})
export class AppStoreService {
  private apps: AppItem[] = [...DEFAULT_APPS];

  // Header 上显示的 app 数量上限
  readonly HEADER_APP_LIMIT = 6;

  constructor() {
    this.loadAppsFromStorage();
  }

  // 从本地存储加载 app 配置
  private loadAppsFromStorage(): void {
    try {
      const stored = localStorage.getItem('app-store-config');
      if (stored) {
        const storedApps: AppItem[] = JSON.parse(stored);
        // 合并存储的配置和默认配置
        this.apps = DEFAULT_APPS.map(defaultApp => {
          const storedApp = storedApps.find(a => a.id === defaultApp.id);
          return storedApp ? { ...defaultApp, enabled: storedApp.enabled } : defaultApp;
        });
      }
    } catch (e) {
      console.error('Failed to load app store config:', e);
    }
  }

  // 保存 app 配置到本地存储
  private saveAppsToStorage(): void {
    try {
      localStorage.setItem('app-store-config', JSON.stringify(this.apps));
    } catch (e) {
      console.error('Failed to save app store config:', e);
    }
  }

  // 获取所有 app
  getAllApps(): AppItem[] {
    return this.apps;
  }

  // 获取启用的 app
  getEnabledApps(): AppItem[] {
    return this.apps.filter(app => app.enabled);
  }

  // 获取显示在 header 上的 app（前6个）
  getHeaderApps(): AppItem[] {
    return this.apps.slice(0, this.HEADER_APP_LIMIT);
  }

  // 启用/禁用 app
  toggleApp(appId: string, enabled: boolean): void {
    const app = this.apps.find(a => a.id === appId);
    if (app) {
      app.enabled = enabled;
      this.saveAppsToStorage();
    }
  }

  // 移动 app 顺序
  moveApp(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const [removed] = this.apps.splice(fromIndex, 1);
    this.apps.splice(toIndex, 0, removed);
    this.saveAppsToStorage();
  }

  // 更新整个 apps 顺序
  updateAppsOrder(apps: AppItem[]): void {
    this.apps = apps;
    this.saveAppsToStorage();
  }

  // 重置为默认配置
  resetToDefault(): void {
    this.apps = [...DEFAULT_APPS];
    localStorage.removeItem('app-store-config');
  }
}
