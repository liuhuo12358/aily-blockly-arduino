import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ElectronService } from './electron.service';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {

  data: AppConfig | any = {};

  constructor(
    private http: HttpClient,
    private electronService: ElectronService
  ) { }

  init() {
    if (!this.electronService.isElectron) return;
    this.load();
  }

  get_lang_filename(lang: string) {
    if (!lang) lang = 'zh_cn';
    else if(lang.toLowerCase() == 'zh-cn' || lang.toLowerCase() == 'zh_cn') lang = 'zh_cn';
    else if(lang.toLowerCase() == 'zh-hk' || lang.toLowerCase() == 'zh_hk') lang = 'zh_hk';
    else if(lang.startsWith('en_') || lang.startsWith('en-')) lang = 'en';
    else if(lang.startsWith('fr_') || lang.startsWith('fr-')) lang = 'fr';
    else if(lang.startsWith('de_') || lang.startsWith('de-')) lang = 'de';
    else if(lang.startsWith('pt_') || lang.startsWith('pt-')) lang = 'pt';
    else lang = lang.toLowerCase();

    return lang;
  }

  async load() {
    let defaultConfigFilePath = window['path'].getElectronPath();
    let defaultConfigFile = window['fs'].readFileSync(`${defaultConfigFilePath}/config/config.json`);
    this.data = await JSON.parse(defaultConfigFile);

    this.data["selectedLanguage"] = this.get_lang_filename(window['platform'].lang);

    let userConfData;
    let configFilePath = window['path'].getAppDataPath();
    // 检查配置文件是否存在，如果不存在则创建一个默认的配置文件
    if (this.electronService.exists(`${configFilePath}/config.json`)) {
      userConfData = JSON.parse(this.electronService.readFile(`${configFilePath}/config.json`));
    } else {
      userConfData = {};
    }

    // 合并用户配置和默认配置
    this.data = { ...this.data, ...userConfData };

    // 添加当前系统类型到data中
    this.data["platform"] = window['platform'].type;
    this.data["lang"] = this.get_lang_filename(window['platform'].lang);

    // 并行加载缓存的boards.json和libraries.json
    // await Promise.all([
    this.loadAndCacheBoardList(configFilePath);
    this.loadAndCacheLibraryList(configFilePath);
    // ]);

    // 加载新格式索引（boards-index.json / libraries-index.json）
    this.loadAndCacheBoardIndex(configFilePath);
    this.loadAndCacheLibraryIndex(configFilePath);
  }

  private async loadAndCacheBoardList(configFilePath: string): Promise<void> {
    if (this.electronService.exists(`${configFilePath}/boards.json`)) {
      this.boardList = JSON.parse(this.electronService.readFile(`${configFilePath}/boards.json`));
      let boardList = await this.loadBoardList();
      if (boardList.length > 0) {
        this.boardList = boardList;
        this.electronService.writeFile(`${configFilePath}/boards.json`, JSON.stringify(boardList));
      }
    } else {
      // 首次启动软件，创建boards.json
      this.boardList = await this.loadBoardList();
      this.electronService.writeFile(`${configFilePath}/boards.json`, JSON.stringify(this.boardList));
    }
    // 创建一个boardDict，方便通过name快速查找board信息
    this.boardList.forEach(board => {
      this.boardDict[board.name] = board;
    });
  }

  private async loadAndCacheLibraryList(configFilePath: string): Promise<void> {
    if (this.electronService.exists(`${configFilePath}/libraries.json`)) {
      this.libraryList = JSON.parse(this.electronService.readFile(`${configFilePath}/libraries.json`));
      let libraryList = await this.loadLibraryList();
      if (libraryList.length > 0) {
        this.libraryList = libraryList;
        this.electronService.writeFile(`${configFilePath}/libraries.json`, JSON.stringify(libraryList));
      }
    } else {
      // 首次启动软件，创建libraries.json
      this.libraryList = await this.loadLibraryList();
      this.electronService.writeFile(`${configFilePath}/libraries.json`, JSON.stringify(this.libraryList));
    }
    // 创建一个libraryDict，方便通过name快速查找library信息
    this.libraryList.forEach(library => {
      this.libraryDict[library.name] = library;
    });
  }

  async save() {
    if (!this.electronService.isElectron) return;
    let configFilePath = window['path'].getAppDataPath();
    window['fs'].writeFileSync(`${configFilePath}/config.json`, JSON.stringify(this.data, null, 2));
  }

  boardList = [];
  boardDict = {};
  async loadBoardList(): Promise<any[]> {
    try {
      let boardList: any = await lastValueFrom(
        this.http.get(this.data.resource[0] + '/boards.json', {
          responseType: 'json',
        }),
      );
      return boardList;
    } catch (error) {
      console.error('Failed to load board list:', error);
      return [];
    }
  }

  libraryList = [];
  libraryDict = {};
  async loadLibraryList(): Promise<any[]> {
    try {
      let libraryList: any = await lastValueFrom(
        this.http.get(this.data.resource[0] + '/libraries.json', {
          responseType: 'json',
        }),
      );
      return libraryList;
    } catch (error) {
      console.error('Failed to load library list:', error);
      return [];
    }
  }

  // ==================== 新格式索引（结构化数据）====================
  boardIndex: any[] = [];  // 新格式开发板索引
  libraryIndex: any[] = [];  // 新格式库索引

  private async loadAndCacheBoardIndex(configFilePath: string): Promise<void> {
    try {
      const localPath = `${configFilePath}/boards-index.json`;
      // 优先从本地缓存读取
      if (this.electronService.exists(localPath)) {
        const fileContent = this.electronService.readFile(localPath);
        const parsed = JSON.parse(fileContent);
        
        // 新格式：{ boards: [...] } 或 旧格式：直接数组 [...]
        if (Array.isArray(parsed)) {
          this.boardIndex = parsed;
        } else if (parsed && parsed.boards && Array.isArray(parsed.boards)) {
          this.boardIndex = parsed.boards;
        }
        console.log('[ConfigService] 本地 boardIndex 加载成功, 数量:', this.boardIndex?.length || 0);
      }
      // 从远程加载最新数据
      let boardIndex = await this.loadBoardIndex();
      if (boardIndex.length > 0) {
        this.boardIndex = boardIndex;
        // 缓存时保持新格式（包含元数据）
        const cacheData = {
          version: '1.0.0',
          generated: new Date().toISOString(),
          count: boardIndex.length,
          boards: boardIndex
        };
        this.electronService.writeFile(localPath, JSON.stringify(cacheData));
        console.log('[ConfigService] 远程 boardIndex 加载成功并缓存, 数量:', boardIndex.length);
      }
    } catch (error) {
      console.warn('Failed to load board index, will fallback to old format:', error);
    }
  }

  private async loadAndCacheLibraryIndex(configFilePath: string): Promise<void> {
    try {
      // 优先从本地缓存读取
      const localPath = `${configFilePath}/libraries-index.json`;
      console.log('[ConfigService] 检查 libraries-index.json 路径:', localPath);
      
      if (this.electronService.exists(localPath)) {
        const fileContent = this.electronService.readFile(localPath);
        console.log('[ConfigService] 本地 libraries-index.json 文件大小:', fileContent?.length || 0, '字节');
        
        const parsed = JSON.parse(fileContent);
        
        // 新格式：{ libraries: [...] } 或 旧格式：直接数组 [...]
        if (Array.isArray(parsed)) {
          this.libraryIndex = parsed;
        } else if (parsed && parsed.libraries && Array.isArray(parsed.libraries)) {
          this.libraryIndex = parsed.libraries;
        } else {
          console.warn('[ConfigService] libraries-index.json 格式无法识别, 可用字段:', Object.keys(parsed || {}));
        }
        
        console.log('[ConfigService] 本地 libraryIndex 加载成功, 数量:', this.libraryIndex?.length || 0);
        
        // 检查第一条数据的格式
        if (this.libraryIndex.length > 0) {
          const sample = this.libraryIndex[0];
          console.log('[ConfigService] libraryIndex 示例数据:', {
            name: sample.name,
            displayName: sample.displayName,
            category: sample.category,
            hasNewFormat: !!(sample.displayName && sample.category && sample.supportedCores)
          });
        }
      } else {
        console.log('[ConfigService] 本地 libraries-index.json 不存在');
      }
      
      // 从远程加载最新数据
      let libraryIndex = await this.loadLibraryIndex();
      if (libraryIndex.length > 0) {
        this.libraryIndex = libraryIndex;
        // 缓存时保持新格式（包含元数据）
        const cacheData = {
          version: '1.0.0',
          generated: new Date().toISOString(),
          count: libraryIndex.length,
          libraries: libraryIndex
        };
        this.electronService.writeFile(localPath, JSON.stringify(cacheData));
        console.log('[ConfigService] 远程 libraryIndex 加载成功并缓存, 数量:', libraryIndex.length);
      }
    } catch (error) {
      console.warn('[ConfigService] Failed to load library index, will fallback to old format:', error);
    }
  }

  async loadBoardIndex(): Promise<any[]> {
    try {
      let response: any = await lastValueFrom(
        this.http.get(this.data.resource[0] + '/boards-index.json', {
          responseType: 'json',
        }),
      );
      // 新格式：{ boards: [...] } 或 旧格式：直接数组 [...]
      if (Array.isArray(response)) {
        return response;
      } else if (response && response.boards && Array.isArray(response.boards)) {
        return response.boards;
      }
      return [];
    } catch (error) {
      console.warn('boards-index.json not available:', error);
      return [];
    }
  }

  async loadLibraryIndex(): Promise<any[]> {
    try {
      let response: any = await lastValueFrom(
        this.http.get(this.data.resource[0] + '/libraries-index.json', {
          responseType: 'json',
        }),
      );
      // 新格式：{ libraries: [...] } 或 旧格式：直接数组 [...]
      if (Array.isArray(response)) {
        return response;
      } else if (response && response.libraries && Array.isArray(response.libraries)) {
        return response.libraries;
      }
      return [];
    } catch (error) {
      console.warn('libraries-index.json not available:', error);
      return [];
    }
  }

  examplesList;
  async loadExamplesList() {
    this.examplesList = await lastValueFrom(
      this.http.get(this.data.resource[0] + '/examples.json', {
        responseType: 'json',
      }),
    );
    return this.examplesList;
  }

  /**
   * 记录开发板使用次数
   * @param boardName 开发板名称
   */
  recordBoardUsage(boardName: string) {
    if (!this.data.boardUsageCount) {
      this.data.boardUsageCount = {};
    }

    // 增加使用次数
    this.data.boardUsageCount[boardName] = (this.data.boardUsageCount[boardName] || 0) + 1;

    // 保存配置
    this.save();
  }

  /**
   * 获取开发板使用次数
   * @param boardName 开发板名称
   * @returns 使用次数
   */
  getBoardUsageCount(boardName: string): number {
    return this.data.boardUsageCount?.[boardName] || 0;
  }

  /**
   * 获取所有开发板的使用次数统计
   * @returns 使用次数统计对象
   */
  getAllBoardUsageCount(): Record<string, number> {
    return this.data.boardUsageCount || {};
  }

  /**
   * 根据使用次数对开发板列表进行排序
   * @param boardList 开发板列表
   * @returns 排序后的开发板列表
   */
  sortBoardsByUsage(boardList: any[]): any[] {
    const usageCount = this.getAllBoardUsageCount();

    return [...boardList].sort((a, b) => {
      const usageA = usageCount[a.name] || 0;
      const usageB = usageCount[b.name] || 0;

      // 首先按使用次数降序排列
      if (usageA !== usageB) {
        return usageB - usageA;
      }

      // 如果使用次数相同，按原来的顺序排列（保持稳定排序）
      return 0;
    });
  }

  // ==================== 库/开发板验证和模糊查询 ====================

  /**
   * 验证库是否存在，不存在则模糊查询
   * @param libraryName 库名称（可以是 name 或 nickname）
   * @returns 验证结果，包含是否存在、真实库数据、是否为模糊匹配
   */
  validateLibrary(libraryName: string): { exists: boolean; library: any | null; fuzzyMatch: boolean; originalQuery: string } {
    if (!libraryName) {
      return { exists: false, library: null, fuzzyMatch: false, originalQuery: libraryName };
    }

    const queryLower = libraryName.toLowerCase().trim();

    // 1. 精确匹配 name
    const exactMatch = this.libraryList.find(lib => 
      lib.name?.toLowerCase() === queryLower
    );
    if (exactMatch) {
      return { exists: true, library: exactMatch, fuzzyMatch: false, originalQuery: libraryName };
    }

    // 2. 精确匹配 nickname
    const nicknameMatch = this.libraryList.find(lib => 
      lib.nickname?.toLowerCase() === queryLower
    );
    if (nicknameMatch) {
      return { exists: true, library: nicknameMatch, fuzzyMatch: false, originalQuery: libraryName };
    }

    // 3. 模糊匹配 - 计算相似度并找最佳匹配
    const candidates = this.libraryList.map(lib => {
      const nameScore = this.calculateSimilarity(queryLower, lib.name?.toLowerCase() || '');
      const nicknameScore = this.calculateSimilarity(queryLower, lib.nickname?.toLowerCase() || '');
      const keywordScore = (lib.keywords || []).some((kw: string) => 
        kw.toLowerCase().includes(queryLower) || queryLower.includes(kw.toLowerCase())
      ) ? 0.3 : 0;
      
      return {
        library: lib,
        score: Math.max(nameScore, nicknameScore) + keywordScore
      };
    }).filter(c => c.score > 0.3)  // 相似度阈值
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      return { 
        exists: true, 
        library: candidates[0].library, 
        fuzzyMatch: true, 
        originalQuery: libraryName 
      };
    }

    return { exists: false, library: null, fuzzyMatch: false, originalQuery: libraryName };
  }

  /**
   * 验证开发板是否存在，不存在则模糊查询
   * @param boardName 开发板名称（可以是 name 或 nickname/displayName）
   * @returns 验证结果，包含是否存在、真实开发板数据、是否为模糊匹配
   */
  validateBoard(boardName: string): { exists: boolean; board: any | null; fuzzyMatch: boolean; originalQuery: string } {
    if (!boardName) {
      return { exists: false, board: null, fuzzyMatch: false, originalQuery: boardName };
    }

    const queryLower = boardName.toLowerCase().trim();

    // 1. 精确匹配 name
    const exactMatch = this.boardList.find(board => 
      board.name?.toLowerCase() === queryLower
    );
    if (exactMatch) {
      return { exists: true, board: exactMatch, fuzzyMatch: false, originalQuery: boardName };
    }

    // 2. 精确匹配 nickname/displayName
    const nicknameMatch = this.boardList.find(board => 
      board.nickname?.toLowerCase() === queryLower ||
      board.displayName?.toLowerCase() === queryLower
    );
    if (nicknameMatch) {
      return { exists: true, board: nicknameMatch, fuzzyMatch: false, originalQuery: boardName };
    }

    // 3. 模糊匹配 - 计算相似度并找最佳匹配
    const candidates = this.boardList.map(board => {
      const nameScore = this.calculateSimilarity(queryLower, board.name?.toLowerCase() || '');
      const nicknameScore = this.calculateSimilarity(queryLower, board.nickname?.toLowerCase() || '');
      const displayNameScore = this.calculateSimilarity(queryLower, board.displayName?.toLowerCase() || '');
      
      return {
        board: board,
        score: Math.max(nameScore, nicknameScore, displayNameScore)
      };
    }).filter(c => c.score > 0.3)  // 相似度阈值
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      return { 
        exists: true, 
        board: candidates[0].board, 
        fuzzyMatch: true, 
        originalQuery: boardName 
      };
    }

    return { exists: false, board: null, fuzzyMatch: false, originalQuery: boardName };
  }

  /**
   * 计算两个字符串的相似度（Dice系数 + 包含关系）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    // 包含关系检查
    if (str1.includes(str2) || str2.includes(str1)) {
      const shorter = str1.length < str2.length ? str1 : str2;
      const longer = str1.length < str2.length ? str2 : str1;
      return shorter.length / longer.length * 0.8 + 0.2;
    }

    // Dice 系数计算
    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);
    
    let intersection = 0;
    for (const bigram of bigrams1) {
      if (bigrams2.has(bigram)) {
        intersection++;
      }
    }
    
    return (2 * intersection) / (bigrams1.size + bigrams2.size);
  }

  /**
   * 获取字符串的 bigrams 集合
   */
  private getBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }
}

interface AppConfig {
  /** 语言设置，例如 "zh_CN" */
  lang: string;

  /** UI主题 */
  theme: string;

  /** 字体设置 */
  font: string;

  /** 系统类型 */
  platform: string;

  /** 项目数据默认路径 */
  appdata_path: {
    win32: string;
    darwin: string;
    linux: string;
  }

  /** 项目默认路径 */
  project_path: string;

  /** NPM 镜像源列表 */
  npm_registry: string[];

  /** 资源文件服务器列表 */
  resource: string[];

  /** 更新服务器列表 */
  updater: string[];

  /** 编译选项 */
  compile: {
    /** 是否显示详细日志 */
    verbose: boolean;
    /** 警告处理方式，如 "error" 表示将警告视为错误 */
    warnings: string;
  };

  /** 上传选项 */
  upload: {
    /** 是否显示详细日志 */
    verbose: boolean;
    /** 警告处理方式 */
    warnings: string;
  };

  devmode: {
    enabled: boolean;
    autoSave: boolean;
  };

  blockly: {
    renderer: string; // Blockly渲染器
  }

  /** 串口监视器快速发送列表 */
  quickSendList?: Array<{ name: string, type: "signal" | "text" | "hex", data: string }>;

  /** 最近打开的项目列表 */
  recentlyProjects?: Array<{ name: string, path: string }>;

  /** 当前选择的语言 */
  selectedLanguage?: string;

  /** 跳过更新的版本列表 */
  skippedVersions?: string[];

  /** 开发板使用次数统计 */
  boardUsageCount?: Record<string, number>;

  /** AI聊天模式 */
  aiChatMode?: 'agent' | 'ask';
}