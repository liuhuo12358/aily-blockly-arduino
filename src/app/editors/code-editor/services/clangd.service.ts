import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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
  source: 'local';
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

@Injectable({
  providedIn: 'root'
})
export class ClangdService {
  // clangd相关状态
  private isClangdInitialized = false;
  private documentStates = new Map<string, DocumentState>();
  private diagnostics = new Map<string, LSPDiagnostic[]>();
  private clangdReady = false;

  // clangd诊断信息
  private diagnosticsSubject = new BehaviorSubject<Map<string, LSPDiagnostic[]>>(new Map());
  public diagnostics$ = this.diagnosticsSubject.asObservable();

  constructor() {
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

    // 获取clangd补全
    if (this.clangdReady && filePath) {
      try {
        const clangdCompletions = await this.getClangdCompletions(filePath, position);
        suggestions.push(...clangdCompletions);
      } catch (error) {
        console.warn('Failed to get clangd completions:', error);
      }
    }

    // 按标签排序
    suggestions.sort((a, b) => a.label.localeCompare(b.label));

    return { suggestions };
  }

  /**
   * 获取clangd代码补全
   */
  private async getClangdCompletions(filePath: string, position: any): Promise<CompletionItem[]> {
    if (!this.clangdReady || typeof window === 'undefined' || !(window as any).electronAPI?.clangd) {
      console.warn('clangd not ready or electronAPI not available');
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

      console.log('Requesting clangd completion for:', uri, 'at position:', lspPosition);

      const result = await clangdAPI.getCompletion(uri, lspPosition);

      console.log('clangd completion result:', result);

      if (!result.success) {
        console.warn('clangd completion failed:', result.error);
        return [];
      }

      if (!result.result || !result.result.items) {
        console.log('No completion items returned from clangd');
        return [];
      }

      const completions: CompletionItem[] = [];
      const items = result.result.items || [];

      console.log(`Processing ${items.length} completion items from clangd`);

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

      console.log(`Converted ${completions.length} clangd completions`);
      return completions;
    } catch (error) {
      console.error('Failed to get clangd completions:', error);
      return [];
    }
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
