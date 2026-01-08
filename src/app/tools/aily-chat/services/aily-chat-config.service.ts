import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * 安全工作区配置项
 */
export interface WorkspaceSecurityOption {
    name: string;           // 选项标识符
    displayName: string;    // 显示名称
    enabled: boolean;       // 是否启用
}

/**
 * 模型配置项
 */
export interface ModelConfigOption {
    model: string;          // 模型标识符
    name: string;           // 显示名称
    family: string;         // 模型家族
    speed: string;          // 速度标识
    enabled: boolean;       // 是否在列表中显示
    isCustom?: boolean;     // 是否是自定义模型
}

/**
 * Aily Chat 配置接口
 */
export interface AilyChatConfig {
    /** 是否使用自定义 API Key */
    useCustomApiKey?: boolean;
    /** 最大循环次数 */
    maxCount?: number;
    /** API Base URL */
    baseUrl?: string;
    /** API Key (加密存储) */
    apiKey?: string;
    /** 自定义模型 */
    customModel?: string;
    /** 启用的工具列表 */
    enabledTools?: string[];
    /** 安全工作区配置 */
    securityWorkspaces?: {
        /** 是否允许访问项目文件 */
        project?: boolean;
        /** 是否允许访问库文件 */
        library?: boolean;
    };
    /** 模型配置列表 */
    models?: ModelConfigOption[];
}

/**
 * 默认内置模型列表
 */
const DEFAULT_MODELS: ModelConfigOption[] = [
    { model: 'glm-4.7', family: 'glm', name: 'GLM-4.7', speed: '1x', enabled: true, isCustom: false },
    { model: 'glm-4.6', family: 'glm', name: 'GLM-4.6', speed: '1x', enabled: true, isCustom: false }
];

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AilyChatConfig = {
    useCustomApiKey: false,
    maxCount: 100,
    baseUrl: '',
    apiKey: '',
    enabledTools: [],
    securityWorkspaces: {
        project: true,
        library: true
    },
    models: DEFAULT_MODELS
};

/**
 * Aily Chat 独立配置服务
 * 用于管理 AI 聊天功能的配置，独立于全局 ConfigService
 */
@Injectable({
    providedIn: 'root'
})
export class AilyChatConfigService {
    private config: AilyChatConfig = { ...DEFAULT_CONFIG };
    private configFileName = 'aily-chat-config.json';
    private loaded = false;

    /** 配置变更通知 Subject */
    private configChangedSubject = new Subject<AilyChatConfig>();

    /** 配置变更通知 Observable */
    public configChanged$: Observable<AilyChatConfig> = this.configChangedSubject.asObservable();

    constructor() {
        this.load();
    }

    /**
     * 获取配置文件路径
     */
    private getConfigPath(): string {
        const appDataPath = window['path']?.getAppDataPath?.() || '';
        return window['path']?.join(appDataPath, this.configFileName) || '';
    }

    /**
     * 加载配置
     */
    load(): void {
        try {
            const configPath = this.getConfigPath();
            if (configPath && window['fs']?.existsSync(configPath)) {
                const content = window['fs'].readFileSync(configPath, 'utf-8');
                const savedConfig = JSON.parse(content);
                // 合并默认配置和已保存的配置
                this.config = { ...DEFAULT_CONFIG, ...savedConfig };
            } else {
                this.config = { ...DEFAULT_CONFIG };
            }
            this.loaded = true;
        } catch (error) {
            console.error('[AilyChatConfigService] 加载配置失败:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    /**
     * 保存配置
     */
    save(): boolean {
        try {
            const configPath = this.getConfigPath();
            if (configPath) {
                window['fs'].writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
                // 发送配置变更通知
                this.configChangedSubject.next({ ...this.config });
                return true;
            }
            return false;
        } catch (error) {
            console.error('[AilyChatConfigService] 保存配置失败:', error);
            return false;
        }
    }

    /**
     * 获取完整配置
     */
    getConfig(): AilyChatConfig {
        if (!this.loaded) {
            this.load();
        }
        return { ...this.config };
    }

    /**
     * 更新配置
     */
    updateConfig(updates: Partial<AilyChatConfig>): void {
        this.config = { ...this.config, ...updates };
    }

    // ==================== 便捷访问方法 ====================

    /**
     * 获取是否使用自定义 API Key
     */
    get useCustomApiKey(): boolean {
        return this.config.useCustomApiKey ?? false;
    }

    set useCustomApiKey(value: boolean) {
        this.config.useCustomApiKey = value;
    }

    /**
     * 获取最大循环次数
     */
    get maxCount(): number {
        return this.config.maxCount ?? 100;
    }

    set maxCount(value: number) {
        this.config.maxCount = value;
    }

    /**
     * 获取 API Base URL
     */
    get baseUrl(): string {
        return this.config.baseUrl ?? '';
    }

    set baseUrl(value: string) {
        this.config.baseUrl = value;
    }

    /**
     * 获取 API Key
     */
    get apiKey(): string {
        return this.config.apiKey ?? '';
    }

    set apiKey(value: string) {
        this.config.apiKey = value;
    }

    /**
     * 获取自定义模型
     */
    get customModel(): string {
        return this.config.customModel ?? '';
    }

    set customModel(value: string) {
        this.config.customModel = value;
    }

    /**
     * 获取启用的工具列表
     */
    get enabledTools(): string[] {
        return this.config.enabledTools ?? [];
    }

    set enabledTools(value: string[]) {
        this.config.enabledTools = value;
    }

    /**
     * 获取安全工作区配置
     */
    get securityWorkspaces(): { project: boolean; library: boolean } {
        return {
            project: this.config.securityWorkspaces?.project ?? true,
            library: this.config.securityWorkspaces?.library ?? true
        };
    }

    set securityWorkspaces(value: { project?: boolean; library?: boolean }) {
        this.config.securityWorkspaces = {
            project: value.project ?? true,
            library: value.library ?? true
        };
    }

    /**
     * 检查项目文件访问是否启用
     */
    isProjectAccessEnabled(): boolean {
        return this.config.securityWorkspaces?.project ?? true;
    }

    /**
     * 检查库文件访问是否启用
     */
    isLibraryAccessEnabled(): boolean {
        return this.config.securityWorkspaces?.library ?? true;
    }

    /**
     * 更新安全工作区的单个选项
     */
    setSecurityWorkspaceOption(name: 'project' | 'library', enabled: boolean): void {
        if (!this.config.securityWorkspaces) {
            this.config.securityWorkspaces = { project: true, library: true };
        }
        this.config.securityWorkspaces[name] = enabled;
    }

    /**
     * 获取工作区安全选项列表（用于设置界面）
     */
    getWorkspaceSecurityOptions(): WorkspaceSecurityOption[] {
        return [
            { 
                name: 'project', 
                displayName: '项目文件', 
                enabled: this.isProjectAccessEnabled() 
            },
            { 
                name: 'library', 
                displayName: '库文件', 
                enabled: this.isLibraryAccessEnabled() 
            }
        ];
    }

    /**
     * 从选项列表更新安全工作区配置
     */
    updateFromWorkspaceOptions(options: WorkspaceSecurityOption[]): void {
        options.forEach(opt => {
            if (opt.name === 'project' || opt.name === 'library') {
                this.setSecurityWorkspaceOption(opt.name, opt.enabled);
            }
        });
    }

    // ==================== 模型管理方法 ====================

    /**
     * 获取模型列表
     */
    get models(): ModelConfigOption[] {
        if (!this.config.models || this.config.models.length === 0) {
            this.config.models = [...DEFAULT_MODELS];
        }
        return this.config.models;
    }

    set models(value: ModelConfigOption[]) {
        this.config.models = value;
    }

    /**
     * 获取已启用的模型列表
     * 规则：如果未启用自定义API KEY，则只返回内置模型
     */
    getEnabledModels(): ModelConfigOption[] {
        const enabledModels = this.models.filter(m => m.enabled);
        
        // 如果未启用自定义API KEY，过滤掉自定义模型
        if (!this.useCustomApiKey) {
            return enabledModels.filter(m => !m.isCustom);
        }
        
        return enabledModels;
    }

    /**
     * 添加自定义模型
     */
    addCustomModel(model: Omit<ModelConfigOption, 'isCustom'>): void {
        const newModel: ModelConfigOption = {
            ...model,
            isCustom: true
        };
        this.models.push(newModel);
    }

    /**
     * 删除模型（只能删除自定义模型）
     */
    removeModel(modelId: string): boolean {
        const index = this.models.findIndex(m => m.model === modelId && m.isCustom);
        if (index !== -1) {
            this.models.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * 更新模型启用状态
     */
    updateModelEnabled(modelId: string, enabled: boolean): void {
        const model = this.models.find(m => m.model === modelId);
        if (model) {
            model.enabled = enabled;
        }
    }

    /**
     * 重置模型列表到默认值
     */
    resetModels(): void {
        this.config.models = [...DEFAULT_MODELS];
    }
}
