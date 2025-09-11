import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AIConfig, DEFAULT_AI_CONFIG, AI_PROMPTS } from '../../../configs/ai-config';

// LSP诊断信息接口
interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number;
  message: string;
  source?: string;
}

// 文档状态管理
interface DocumentState {
  uri: string;
  version: number;
  languageId: string;
  isOpen: boolean;
}

export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText: string;
  insertTextRules?: number;
  sortText?: string;
  filterText?: string;
  additionalTextEdits?: any[];
  source: 'local' | 'ai';
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25
}

export interface AICompletionRequest {
  code: string;
  position: {
    line: number;
    column: number;
  };
  context: {
    beforeCursor: string;
    afterCursor: string;
    fileName?: string;
    language: string;
  };
}

export interface AICompletionResponse {
  suggestions: Array<{
    text: string;
    description?: string;
    confidence: number;
    type: 'completion' | 'suggestion' | 'snippet';
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class ClangdService {
  private aiCompletionsCache = new Map<string, { completions: CompletionItem[], timestamp: number }>();
  private config: AIConfig = { ...DEFAULT_AI_CONFIG };
  
  // clangd相关状态
  private isClangdInitialized = false;
  private documentStates = new Map<string, DocumentState>();
  private diagnostics = new Map<string, LSPDiagnostic[]>();
  private clangdReady = false;

  // 用于实时AI补全状态
  private aiCompletionSubject = new BehaviorSubject<CompletionItem[]>([]);
  public aiCompletions$ = this.aiCompletionSubject.asObservable();
  
  // clangd诊断信息
  private diagnosticsSubject = new BehaviorSubject<Map<string, LSPDiagnostic[]>>(new Map());
  public diagnostics$ = this.diagnosticsSubject.asObservable();

  constructor(
    private http: HttpClient
  ) {
    // 定期清理过期缓存
    setInterval(() => this.cleanExpiredCache(), 60000); // 每分钟清理一次
    
    // 初始化clangd事件监听
    this.initClangdListeners();
  }

  /**
   * 初始化clangd事件监听
   */
  private initClangdListeners(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
      const clangdAPI = (window as any).electronAPI.clangd;
      
      // 监听clangd通知
      clangdAPI.onNotification((message: any) => {
        this.handleClangdNotification(message);
      });

      // 监听clangd错误
      clangdAPI.onError((error: any) => {
        console.error('clangd error:', error);
      });

      // 监听clangd退出
      clangdAPI.onExit((exitInfo: any) => {
        console.warn('clangd exited:', exitInfo);
        this.clangdReady = false;
        this.isClangdInitialized = false;
      });
    }
  }

  /**
   * 处理clangd通知
   */
  private handleClangdNotification(message: any): void {
    if (message.method === 'textDocument/publishDiagnostics') {
      const uri = message.params.uri;
      const diagnostics = message.params.diagnostics || [];
      this.diagnostics.set(uri, diagnostics);
      this.diagnosticsSubject.next(new Map(this.diagnostics));
    }
  }

  /**
   * 初始化代码智能补全服务
   */
  async initialize(workspaceRoot?: string): Promise<void> {
    try {
      console.log('代码智能补全服务已初始化，使用 clangd 进行代码补全');
      
      // 初始化clangd
      if (workspaceRoot) {
        await this.initializeClangd(workspaceRoot);
      }
    } catch (error) {
      console.error('初始化代码智能补全服务失败:', error);
    }
  }

  /**
   * 初始化clangd服务
   */
  async initializeClangd(workspaceRoot: string): Promise<void> {
    if (this.isClangdInitialized) {
      console.log('clangd already initialized');
      return;
    }

    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
        const clangdAPI = (window as any).electronAPI.clangd;
        
        // 启动clangd
        const result = await clangdAPI.start(workspaceRoot);
        
        if (result.success) {
          this.isClangdInitialized = true;
          this.clangdReady = true;
          console.log('clangd initialized successfully');
        } else {
          console.error('Failed to start clangd:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize clangd:', error);
    }
  }

  /**
   * 获取代码补全建议
   */
  async getCompletionItems(
    model: any,
    position: any,
    context: any,
    token: any,
    filePath?: string
  ): Promise<{ suggestions: CompletionItem[] }> {
    const suggestions: CompletionItem[] = [];

    // 1. 获取clangd补全
    if (this.clangdReady && filePath) {
      try {
        const clangdCompletions = await this.getClangdCompletions(filePath, position);
        suggestions.push(...clangdCompletions);
      } catch (error) {
        console.warn('Failed to get clangd completions:', error);
      }
    }

    // 2. 获取AI补全（如果启用）
    if (this.config.enabled) {
      const aiCompletions = await this.getAICompletions(model, position, context);
      suggestions.push(...aiCompletions);
    }

    // 按相关性排序：clangd补全优先级最高
    suggestions.sort((a, b) => {
      if (a.source === 'local' && b.source === 'ai') return -1;
      if (a.source === 'ai' && b.source === 'local') return 1;
      return a.label.localeCompare(b.label);
    });

    return { suggestions };
  }

  /**
   * 获取clangd代码补全
   */
  private async getClangdCompletions(filePath: string, position: any): Promise<CompletionItem[]> {
    if (!this.clangdReady || typeof window === 'undefined' || !(window as any).electronAPI?.clangd) {
      return [];
    }

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      // 将Monaco编辑器位置转换为LSP位置
      const lspPosition = {
        line: position.lineNumber - 1, // LSP行号从0开始
        character: position.column - 1 // LSP列号从0开始
      };

      const result = await clangdAPI.getCompletion(uri, lspPosition);
      
      if (!result.success || !result.result) {
        return [];
      }

      const completions: CompletionItem[] = [];
      const items = result.result.items || [];

      for (const item of items) {
        completions.push({
          label: item.label,
          kind: this.mapLSPKindToCompletionKind(item.kind),
          detail: item.detail,
          documentation: item.documentation,
          insertText: item.insertText || item.label,
          insertTextRules: item.insertTextFormat === 2 ? 4 : 0, // 4 = InsertTextRule.InsertAsSnippet
          sortText: item.sortText,
          filterText: item.filterText,
          source: 'local'
        });
      }

      return completions;
    } catch (error) {
      console.error('Failed to get clangd completions:', error);
      return [];
    }
  }

  /**
   * 获取AI代码补全
   */
  private async getAICompletions(model: any, position: any, context: any): Promise<CompletionItem[]> {
    try {
      const beforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const afterCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: model.getLineCount(),
        endColumn: model.getLineMaxColumn(model.getLineCount())
      });

      const cacheKey = this.generateCacheKey(beforeCursor, position);

      // 检查缓存
      const cached = this.aiCompletionsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 30000)) { // 30秒缓存
        return cached.completions;
      }

      const requestData: AICompletionRequest = {
        code: model.getValue(),
        position: {
          line: position.lineNumber,
          column: position.column
        },
        context: {
          beforeCursor,
          afterCursor,
          language: 'cpp'
        }
      };

      const response = await this.callAIAPI(requestData);
      const aiCompletions = this.parseAIResponse(response);

      // 缓存结果
      this.aiCompletionsCache.set(cacheKey, {
        completions: aiCompletions,
        timestamp: Date.now()
      });

      // 更新AI补全状态
      this.aiCompletionSubject.next(aiCompletions);

      return aiCompletions;
    } catch (error) {
      console.error('获取AI补全失败:', error);
      return [];
    }
  }

  /**
   * 调用AI API
   */
  private async callAIAPI(request: AICompletionRequest): Promise<any> {
    try {
      const response=''
      //  = await this.http.post<AICompletionResponse>(
      //   this.config.apiEndpoint,
      //   request,
      //   {
      //     headers: new HttpHeaders({
      //       'Content-Type': 'application/json',
      //       ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
      //     })
      //   }
      // ).pipe(
      //   timeout(this.config.timeout),
      //   catchError(() => of({ suggestions: [] }))
      // ).toPromise() as Promise<AICompletionResponse>;

      return response || { suggestions: [] };
    } catch (error) {
      console.error('AI API调用失败:', error);
      // 返回模拟的AI补全结果用于测试
      return this.getMockAIResponse(request);
    }
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: AICompletionResponse): CompletionItem[] {
    const completions: CompletionItem[] = [];

    for (const suggestion of response.suggestions) {
      completions.push({
        label: suggestion.text.split('\n')[0], // 取第一行作为标签
        kind: this.getAICompletionKind(suggestion.type),
        detail: `AI建议 (置信度: ${Math.round(suggestion.confidence * 100)}%)`,
        documentation: suggestion.description || '由AI生成的代码建议',
        insertText: suggestion.text,
        insertTextRules: 4, // InsertAsSnippet
        sortText: `z_ai_${suggestion.confidence}`, // AI补全排在后面
        source: 'ai'
      });
    }

    return completions;
  }

  /**
   * 获取模拟AI响应（用于测试和离线使用）
   */
  private getMockAIResponse(request: AICompletionRequest): AICompletionResponse {
    const beforeCursor = request.context.beforeCursor.toLowerCase();
    const suggestions: any[] = [];

    // 检查常用的Arduino模式
    const patterns = [
      {
        trigger: ['for', 'for(', 'for '],
        suggestions: [
          {
            text: 'for (int i = 0; i < ${1:10}; i++) {\n  ${2:// your code here}\n}',
            description: 'for循环模板',
            confidence: 0.9,
            type: 'snippet'
          }
        ]
      },
      {
        trigger: ['if', 'if(', 'if '],
        suggestions: [
          {
            text: 'if (${1:condition}) {\n  ${2:// your code here}\n}',
            description: 'if语句模板',
            confidence: 0.85,
            type: 'snippet'
          }
        ]
      },
      {
        trigger: ['while', 'while(', 'while '],
        suggestions: [
          {
            text: 'while (${1:condition}) {\n  ${2:// your code here}\n}',
            description: 'while循环模板',
            confidence: 0.85,
            type: 'snippet'
          }
        ]
      },
      {
        trigger: ['serial', 'serial.'],
        suggestions: [
          {
            text: 'Serial.begin(${1:9600});',
            description: '初始化串口',
            confidence: 0.8,
            type: 'completion'
          },
          {
            text: 'Serial.println(${1:"Hello"});',
            description: '串口输出并换行',
            confidence: 0.8,
            type: 'completion'
          },
          {
            text: 'Serial.print(${1:"Hello"});',
            description: '串口输出',
            confidence: 0.75,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['pinmode', 'pin'],
        suggestions: [
          {
            text: 'pinMode(${1:13}, ${2|OUTPUT,INPUT,INPUT_PULLUP|});',
            description: '设置引脚模式',
            confidence: 0.8,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['digitalwrite', 'digital'],
        suggestions: [
          {
            text: 'digitalWrite(${1:13}, ${2|HIGH,LOW|});',
            description: '数字引脚输出',
            confidence: 0.8,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['digitalread'],
        suggestions: [
          {
            text: 'digitalRead(${1:2})',
            description: '读取数字引脚',
            confidence: 0.8,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['analogwrite', 'analog'],
        suggestions: [
          {
            text: 'analogWrite(${1:9}, ${2:255});',
            description: 'PWM输出',
            confidence: 0.75,
            type: 'completion'
          },
          {
            text: 'analogRead(${1:A0})',
            description: '读取模拟引脚',
            confidence: 0.75,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['delay'],
        suggestions: [
          {
            text: 'delay(${1:1000});',
            description: '延迟毫秒',
            confidence: 0.75,
            type: 'completion'
          }
        ]
      },
      {
        trigger: ['void setup', 'setup'],
        suggestions: [
          {
            text: 'void setup() {\n  ${1:// 初始化代码}\n  Serial.begin(9600);\n}',
            description: 'setup函数模板',
            confidence: 0.9,
            type: 'snippet'
          }
        ]
      },
      {
        trigger: ['void loop', 'loop'],
        suggestions: [
          {
            text: 'void loop() {\n  ${1:// 主循环代码}\n}',
            description: 'loop函数模板',
            confidence: 0.9,
            type: 'snippet'
          }
        ]
      }
    ];

    // 检查哪些模式匹配
    for (const pattern of patterns) {
      for (const trigger of pattern.trigger) {
        if (beforeCursor.includes(trigger)) {
          suggestions.push(...pattern.suggestions);
          break;
        }
      }
    }

    // 如果没有特定匹配，提供通用的Arduino建议
    if (suggestions.length === 0) {
      // 基于当前代码上下文的智能建议
      if (beforeCursor.includes('setup') && !beforeCursor.includes('serial.begin')) {
        suggestions.push({
          text: 'Serial.begin(9600);',
          description: '建议添加串口初始化',
          confidence: 0.7,
          type: 'completion'
        });
      }

      if (beforeCursor.includes('loop') && beforeCursor.split('\n').length < 5) {
        suggestions.push({
          text: 'delay(${1:100});',
          description: '建议添加延迟',
          confidence: 0.6,
          type: 'completion'
        });
      }
    }

    return { suggestions: suggestions.slice(0, 5) }; // 最多返回5个建议
  }

  /**
   * 获取AI补全类型
   */
  private getAICompletionKind(type: string): CompletionItemKind {
    switch (type) {
      case 'snippet':
        return CompletionItemKind.Snippet;
      case 'suggestion':
        return CompletionItemKind.Text;
      case 'completion':
        return CompletionItemKind.Method;
      default:
        return CompletionItemKind.Text;
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(code: string, position: any): string {
    const hash = this.simpleHash(code + position.lineNumber + position.column);
    return hash.toString();
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * 清除AI补全缓存
   */
  public clearAICache(): void {
    this.aiCompletionsCache.clear();
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟

    for (const [key, value] of this.aiCompletionsCache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.aiCompletionsCache.delete(key);
      }
    }

    // 如果缓存过大，删除最旧的条目
    if (this.aiCompletionsCache.size > this.config.maxCacheSize) {
      const entries = Array.from(this.aiCompletionsCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toDelete = entries.slice(0, entries.length - this.config.maxCacheSize);
      toDelete.forEach(([key]) => this.aiCompletionsCache.delete(key));
    }
  }

  /**
   * 设置AI功能开关
   */
  public setAIEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * 设置AI API端点
   */
  public setAPIEndpoint(endpoint: string): void {
    this.config.apiEndpoint = endpoint;
  }

  /**
   * 更新AI配置
   */
  public updateAIConfig(newConfig: Partial<AIConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前AI配置
   */
  public getAIConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * 获取当前缓存大小
   */
  public getCacheSize(): number {
    return this.aiCompletionsCache.size;
  }

  /**
   * 映射LSP CompletionItemKind到Monaco CompletionItemKind
   */
  private mapLSPKindToCompletionKind(lspKind: number): CompletionItemKind {
    // LSP CompletionItemKind 映射到 Monaco CompletionItemKind
    switch (lspKind) {
      case 1: return CompletionItemKind.Text;
      case 2: return CompletionItemKind.Method;
      case 3: return CompletionItemKind.Function;
      case 4: return CompletionItemKind.Constructor;
      case 5: return CompletionItemKind.Field;
      case 6: return CompletionItemKind.Variable;
      case 7: return CompletionItemKind.Class;
      case 8: return CompletionItemKind.Interface;
      case 9: return CompletionItemKind.Module;
      case 10: return CompletionItemKind.Property;
      case 11: return CompletionItemKind.Unit;
      case 12: return CompletionItemKind.Value;
      case 13: return CompletionItemKind.Enum;
      case 14: return CompletionItemKind.Keyword;
      case 15: return CompletionItemKind.Snippet;
      case 16: return CompletionItemKind.Color;
      case 17: return CompletionItemKind.File;
      case 18: return CompletionItemKind.Reference;
      case 19: return CompletionItemKind.Folder;
      case 20: return CompletionItemKind.EnumMember;
      case 21: return CompletionItemKind.Constant;
      case 22: return CompletionItemKind.Struct;
      case 23: return CompletionItemKind.Event;
      case 24: return CompletionItemKind.Operator;
      case 25: return CompletionItemKind.TypeParameter;
      default: return CompletionItemKind.Text;
    }
  }

  // clangd文档管理方法
  /**
   * 打开文档
   */
  async openDocument(filePath: string, content: string): Promise<void> {
    if (!this.clangdReady) return;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      const version = Date.now(); // 使用时间戳作为版本号
      
      // 根据文件扩展名确定语言ID
      const languageId = this.getLanguageIdFromPath(filePath);
      
      await clangdAPI.didOpen(uri, languageId, version, content);
      
      // 记录文档状态
      this.documentStates.set(uri, {
        uri,
        version,
        languageId,
        isOpen: true
      });
      
      console.log(`Opened document: ${filePath}`);
    } catch (error) {
      console.error('Failed to open document in clangd:', error);
    }
  }

  /**
   * 更新文档内容
   */
  async updateDocument(filePath: string, content: string, changes?: any[]): Promise<void> {
    if (!this.clangdReady) return;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      const docState = this.documentStates.get(uri);
      
      if (!docState) {
        // 如果文档未打开，先打开它
        await this.openDocument(filePath, content);
        return;
      }

      const newVersion = docState.version + 1;
      
      // 如果提供了增量变更，使用增量更新
      if (changes && changes.length > 0) {
        await clangdAPI.didChange(uri, newVersion, changes);
      } else {
        // 否则使用全文更新
        await clangdAPI.didChange(uri, newVersion, [{
          text: content
        }]);
      }
      
      // 更新文档状态
      docState.version = newVersion;
      this.documentStates.set(uri, docState);
      
    } catch (error) {
      console.error('Failed to update document in clangd:', error);
    }
  }

  /**
   * 关闭文档
   */
  async closeDocument(filePath: string): Promise<void> {
    if (!this.clangdReady) return;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      await clangdAPI.didClose(uri);
      
      // 清理文档状态
      this.documentStates.delete(uri);
      this.diagnostics.delete(uri);
      
      console.log(`Closed document: ${filePath}`);
    } catch (error) {
      console.error('Failed to close document in clangd:', error);
    }
  }

  /**
   * 保存文档
   */
  async saveDocument(filePath: string, content?: string): Promise<void> {
    if (!this.clangdReady) return;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      await clangdAPI.didSave(uri, content);
      
      console.log(`Saved document: ${filePath}`);
    } catch (error) {
      console.error('Failed to save document in clangd:', error);
    }
  }

  /**
   * 根据文件路径获取语言ID
   */
  private getLanguageIdFromPath(filePath: string): string {
    const extension = filePath.toLowerCase().split('.').pop();
    switch (extension) {
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'c':
        return 'c';
      case 'h':
      case 'hpp':
      case 'hxx':
        return 'cpp'; // 头文件通常当作C++处理
      case 'ino':
        return 'cpp'; // Arduino文件当作C++处理
      default:
        return 'cpp';
    }
  }

  /**
   * 获取文档诊断信息
   */
  getDocumentDiagnostics(filePath: string): LSPDiagnostic[] {
    const uri = `file://${filePath.replace(/\\/g, '/')}`;
    return this.diagnostics.get(uri) || [];
  }

  /**
   * 获取悬停信息
   */
  async getHoverInfo(filePath: string, position: { line: number; character: number }): Promise<any> {
    if (!this.clangdReady) return null;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      const result = await clangdAPI.getHover(uri, position);
      return result.success ? result.result : null;
    } catch (error) {
      console.error('Failed to get hover info:', error);
      return null;
    }
  }

  /**
   * 获取定义位置
   */
  async getDefinition(filePath: string, position: { line: number; character: number }): Promise<any> {
    if (!this.clangdReady) return null;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      const result = await clangdAPI.getDefinition(uri, position);
      return result.success ? result.result : null;
    } catch (error) {
      console.error('Failed to get definition:', error);
      return null;
    }
  }

  /**
   * 获取引用
   */
  async getReferences(filePath: string, position: { line: number; character: number }): Promise<any> {
    if (!this.clangdReady) return null;

    try {
      const clangdAPI = (window as any).electronAPI.clangd;
      const uri = `file://${filePath.replace(/\\/g, '/')}`;
      
      const result = await clangdAPI.getReferences(uri, position, true);
      return result.success ? result.result : null;
    } catch (error) {
      console.error('Failed to get references:', error);
      return null;
    }
  }

  /**
   * 检查clangd是否就绪
   */
  public isClangdReady(): boolean {
    return this.clangdReady;
  }

  /**
   * 停止clangd服务
   */
  async stopClangd(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
      const clangdAPI = (window as any).electronAPI.clangd;
      await clangdAPI.stop();
      this.isClangdInitialized = false;
      this.clangdReady = false;
      this.documentStates.clear();
      this.diagnostics.clear();
    }
  }

  /**
   * 诊断clangd状态
   */
  public diagnoseClangdStatus(): void {
    console.log('=== Clangd 诊断信息 ===');
    console.log('isClangdInitialized:', this.isClangdInitialized);
    console.log('clangdReady:', this.clangdReady);
    console.log('documentStates count:', this.documentStates.size);
    console.log('diagnostics count:', this.diagnostics.size);
    console.log('AI config enabled:', this.config.enabled);
    console.log('AI completions cache size:', this.aiCompletionsCache.size);
    
    // 检查electronAPI是否可用
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
      console.log('electronAPI.clangd is available');
    } else {
      console.log('electronAPI.clangd is NOT available');
    }
    
    // 列出已打开的文档
    console.log('Open documents:');
    for (const [uri, state] of this.documentStates.entries()) {
      console.log(`  ${uri}: version=${state.version}, language=${state.languageId}, isOpen=${state.isOpen}`);
    }
    
    // 列出诊断信息
    console.log('Diagnostics:');
    for (const [uri, diagnostics] of this.diagnostics.entries()) {
      console.log(`  ${uri}: ${diagnostics.length} diagnostics`);
    }
    console.log('=== 诊断结束 ===');
  }
}
