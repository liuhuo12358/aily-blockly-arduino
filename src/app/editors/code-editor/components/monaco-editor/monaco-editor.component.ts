import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, SimpleChanges, ViewChild, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCodeEditorModule, NzCodeEditorComponent } from 'ng-zorro-antd/code-editor';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ClangdService } from '../../services/clangd.service';

@Component({
  selector: 'app-monaco-editor',
  imports: [
    NzCodeEditorModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './monaco-editor.component.html',
  styleUrl: './monaco-editor.component.scss'
})
export class MonacoEditorComponent {

  @ViewChild(NzCodeEditorComponent) codeEditor: NzCodeEditorComponent;

  @Input() options: any = {
    language: 'cpp',
    theme: 'vs-dark',
    lineNumbers: 'on',
    automaticLayout: true
  }

  @Input() code = '';
  @Input() filePath = ''; // 当前文件路径

  @Output() codeChange = new EventEmitter<string>();
  @Output() openFileRequest = new EventEmitter<{filePath: string, position: any}>();

  @Input() sdkPath: string;
  @Input() librariesPath: string;

  private disposables: any[] = [];
  private monacoInstance: any;

  constructor(
    private clangdService: ClangdService,
    private message: NzMessageService
  ) { }

  ngOnInit() {
  }

  ngAfterViewInit() {
    // 编辑器初始化后，尝试启动智能补全服务
    setTimeout(async () => {
      if (this.codeEditor) {
        await this.initializeIntelligence();
      }
    }, 1000); // 给编辑器更多时间初始化
  }

  ngOnChanges(changes: SimpleChanges): void {
    setTimeout(async () => {
      if (this.codeEditor) {
        // 重新初始化代码智能补全服务
        await this.initializeIntelligence();
      }
    }, 500);
  }

  ngOnDestroy() {
    this.disposables.forEach(d => d.dispose());
  }

  onCodeChange(newCode: string): void {
    this.codeChange.emit(newCode);

    // 同步代码变化到 clangd
    if (this.filePath && this.clangdService.isClangdReady()) {
      this.clangdService.updateDocument(this.filePath, newCode).catch(error => {
        console.warn('更新 clangd 文档失败:', error);
      });
    }
  }

  editorInitialized(editor: any): void {
    this.monacoInstance = (window as any).monaco;

    // 在编辑器初始化后设置Tab键处理
    if (editor && this.monacoInstance) {
      //   const tabDisposable = editor.addCommand(this.monacoInstance.KeyCode.Tab, () => {
      //     return this.handleTabKey(editor);
      //   });
      //   this.disposables.push(tabDisposable);

      // 添加自定义右键菜单项
      this.setupContextMenu(editor);
    }
  }

  /**
   * 获取工作空间根目录
   */
  private getWorkspaceRoot(): string | null {
    if (!this.filePath) return null;

    // 获取文件所在的目录作为工作空间根目录
    const path = require('path');
    return path.dirname(this.filePath);
  }

  /**
   * 生成 compile_commands.json (支持数组路径)
   */
  public async generateCompileCommandsWithArrays(
    projectPaths: string[], 
    sdkPaths: string[], 
    librariesPaths: string[]
  ): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
      const clangdAPI = (window as any).electronAPI.clangd;
      
      console.log('Generating compile_commands.json with array paths:');
      console.log('Project paths:', projectPaths);
      console.log('SDK paths:', sdkPaths);
      console.log('Libraries paths:', librariesPaths);
      
      return await clangdAPI.generateCompileCommands(projectPaths, sdkPaths, librariesPaths);
    }
    throw new Error('electronAPI.clangd is not available');
  }

  /**
   * 生成 compile_commands.json
   */
  private async generateCompileCommands(projectPath: string, sdkPath: string, librariesPath: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clangd) {
      const clangdAPI = (window as any).electronAPI.clangd;
      
      // 将路径转换为数组格式
      const projectPaths = [projectPath];
      const sdkPaths = sdkPath ? [sdkPath] : [];
      const librariesPaths = librariesPath ? [librariesPath] : [];
      
      console.log('Generating compile_commands.json with paths:');
      console.log('Project paths:', projectPaths);
      console.log('SDK paths:', sdkPaths);
      console.log('Libraries paths:', librariesPaths);
      
      return await clangdAPI.generateCompileCommands(projectPaths, sdkPaths, librariesPaths);
    }
    throw new Error('electronAPI.clangd is not available');
  }

  /**
   * 等待 clangd 服务准备就绪
   */
  private async waitForClangdReady(timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.clangdService.isClangdReady()) {
        console.log('clangd 服务已准备就绪');
        return true;
      }

      // 等待100ms后重试
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.warn('等待 clangd 服务准备就绪超时');
    return false;
  }

  /**
   * 同步当前文档到 clangd
   */
  private async syncDocumentToClangd(): Promise<void> {
    if (!this.filePath || !this.code) {
      console.warn('文件路径或内容为空，无法同步文档');
      return;
    }

    try {
      // 确保文档已在 clangd 中打开
      await this.clangdService.openDocument(this.filePath, this.code);
      console.log('文档已同步到 clangd:', this.filePath);
    } catch (error) {
      console.error('同步文档到 clangd 失败:', error);
    }
  }

  /**
   * 初始化代码智能补全功能
   */
  async initializeIntelligence(): Promise<void> {
    try {
      console.log('开始初始化代码智能补全功能...');
      console.log('filePath:', this.filePath);

      // 首先初始化 clangd 服务
      const workspaceRoot = this.getWorkspaceRoot();
      console.log('workspaceRoot:', workspaceRoot);

      if (workspaceRoot) {
        await this.clangdService.initialize(workspaceRoot);

        // 生成 compile_commands.json
        if (this.sdkPath && this.librariesPath) {
          console.log('生成 compile_commands.json...');
          try {
            const result = await this.generateCompileCommands(workspaceRoot, this.sdkPath, this.librariesPath);
            console.log('compile_commands.json 生成结果:', result);
          } catch (error) {
            console.warn('生成 compile_commands.json 失败，但继续初始化:', error);
          }
        }

        // 等待 clangd 服务准备就绪
        await this.waitForClangdReady(5000); // 等待最多5秒
      }

      // 获取Monaco实例
      const monaco = (window as any).monaco;
      if (!monaco) {
        console.error('Monaco实例未找到');
        return;
      }

      // 如果已有注册的提供器，先清理
      this.disposables.forEach(d => d.dispose());
      this.disposables = [];

      // 注册智能补全提供器
      const completionDisposable = monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: async (model: any, position: any, context: any, token: any) => {
          console.log('Monaco requesting completions at:', position, 'context:', context);
          const result = await this.clangdService.getCompletionItems(model, position, context, token, this.filePath);
          console.log('Completion results:', result);
          return result;
        },
        triggerCharacters: ['.', '->', '::', '(', ' ', '#'],
        resolveCompletionItem: (item: any, token: any) => {
          // 提供更详细的补全信息
          return item;
        }
      });

      // 注册悬停提供器
      const hoverDisposable = monaco.languages.registerHoverProvider('cpp', {
        provideHover: async (model: any, position: any, token: any) => {
          if (this.clangdService.isClangdReady() && this.filePath) {
            const lspPosition = {
              line: position.lineNumber - 1,
              character: position.column - 1
            };
            const hoverInfo = await this.clangdService.getHoverInfo(this.filePath, lspPosition);
            if (hoverInfo) {
              return {
                contents: [
                  { value: hoverInfo.contents || '暂无信息' }
                ]
              };
            }
          }
          return null;
        }
      });

      this.disposables.push(completionDisposable, inlineCompletionDisposable, hoverDisposable);

      // 同步当前文档到 clangd
      if (this.filePath && this.code) {
        await this.syncDocumentToClangd();
      }

      console.log('代码智能补全功能已初始化');

      // 添加调试信息
      setTimeout(() => {
        this.clangdService.diagnoseClangdStatus();
      }, 3000);

    } catch (error) {
      console.error('初始化代码智能补全功能失败:', error);
    }
  }

  /**
   * 处理Tab键按下事件
   */
  private handleTabKey(editor: any): boolean {
    // 检查是否有活跃的内联补全建议
    const inlineCompletions = editor.getModel()?.getInlineCompletions?.();

    // 如果有内联补全建议，则接受它
    if (inlineCompletions && inlineCompletions.items && inlineCompletions.items.length > 0) {
      this.acceptInlineCompletion(editor);
      return true; // 阻止默认Tab行为
    }

    // 检查是否有活跃的建议小部件
    const suggestWidget = editor.getContribution('editor.contrib.suggestController');
    if (suggestWidget && suggestWidget.widget && suggestWidget.widget.getValue()) {
      // 有建议小部件显示，让默认行为处理
      return false;
    }

    // 没有补全建议，插入Tab字符
    const selection = editor.getSelection();
    const model = editor.getModel();

    if (selection && model) {
      const tabSize = editor.getModel().getOptions().tabSize;
      const useSpaces = editor.getModel().getOptions().insertSpaces;
      const tabString = useSpaces ? ' '.repeat(tabSize) : '\t';

      editor.executeEdits('tab-insert', [{
        range: selection,
        text: tabString
      }]);

      // 移动光标到插入位置之后
      const newPosition = {
        lineNumber: selection.startLineNumber,
        column: selection.startColumn + tabString.length
      };
      editor.setPosition(newPosition);
    }

    return true; // 阻止默认Tab行为，因为我们已经处理了
  }

  /**
   * 接受内联补全建议
   */
  private acceptInlineCompletion(editor: any): void {
    // 这里可以添加接受内联补全的逻辑
    // Monaco Editor会自动处理大部分情况
    editor.trigger('keyboard', 'acceptAlternativeSelectedSuggestion', {});
  }

  /**
   * 设置自定义右键菜单
   */
  private setupContextMenu(editor: any): void {
    if (!this.monacoInstance) return;

    // 添加自定义菜单项
    const contextMenuAction = {
      id: 'go-to-definition',
      label: '跳转到定义位置',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (editor: any) => {
        this.goToDefinition(editor);
      }
    };

    // 注册菜单项动作
    editor.addAction(contextMenuAction);

    // 添加更多菜单项
    const findReferencesAction = {
      id: 'find-references',
      label: '查找引用',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: (editor: any) => {
        this.findReferences(editor);
      }
    };

    editor.addAction(findReferencesAction);

    const showHoverAction = {
      id: 'show-hover',
      label: '显示详情',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.7,
      run: (editor: any) => {
        this.showHoverInfo(editor);
      }
    };

    editor.addAction(showHoverAction);
  }

  /**
   * 跳转到定义位置
   */
  private async goToDefinition(editor: any): Promise<void> {
    try {
      const position = editor.getPosition();
      const model = editor.getModel();

      if (!position || !model || !this.filePath) {
        console.warn('无法获取当前位置或文件路径');
        return;
      }

      // 调用代码智能服务获取定义位置
      const definitions = await this.clangdService.getDefinition(
        this.filePath,
        {
          line: position.lineNumber - 1, // LSP使用0基行号
          character: position.column - 1  // LSP使用0基列号
        }
      );

      if (!definitions || definitions.length === 0) {
        this.showMessage('未找到定义位置', 'info');
        return;
      }

      // 处理定义结果
      const definition = Array.isArray(definitions) ? definitions[0] : definitions;
      await this.navigateToDefinition(definition);

    } catch (error) {
      console.error('跳转到定义位置失败:', error);
      this.showMessage('跳转到定义位置失败', 'error');
    }
  }

  /**
   * 导航到定义位置
   */
  private async navigateToDefinition(definition: any): Promise<void> {
    if (!definition || !definition.uri) {
      console.warn('定义信息无效');
      return;
    }

    try {
      // 解析URI，获取文件路径
      const uri = definition.uri;
      let filePath = uri;

      // 处理file://协议的URI
      if (uri.startsWith('file://')) {
        filePath = uri.substring(7); // 移除 'file://' 前缀
        // 在Windows上处理路径格式
        if (process.platform === 'win32') {
          filePath = filePath.replace(/\//g, '\\');
        }
      }

      const range = definition.range;
      const targetPosition = {
        lineNumber: range.start.line + 1, // Monaco使用1基行号
        column: range.start.character + 1  // Monaco使用1基列号
      };

      // 检查是否是当前文件
      if (filePath === this.filePath) {
        // 在当前编辑器中跳转
        const editor = this.getEditorInstance();
        if (editor) {
          // 跳转到指定位置
          editor.setPosition(targetPosition);
          editor.revealLineInCenter(targetPosition.lineNumber);

          // 高亮显示目标行
          this.highlightLine(editor, targetPosition.lineNumber);

          this.showMessage(`已跳转到第 ${targetPosition.lineNumber} 行`, 'success');
        }
      } else {
        // 需要打开其他文件，通知父组件
        this.requestOpenFile(filePath, targetPosition);
      }

    } catch (error) {
      console.error('导航到定义位置失败:', error);
      this.showMessage('导航失败', 'error');
    }
  }

  /**
   * 查找引用
   */
  private async findReferences(editor: any): Promise<void> {
    try {
      const position = editor.getPosition();

      if (!position || !this.filePath) {
        console.warn('无法获取当前位置或文件路径');
        return;
      }

      const references = await this.clangdService.getReferences(
        this.filePath,
        {
          line: position.lineNumber - 1,
          character: position.column - 1
        }
      );

      if (!references || references.length === 0) {
        this.showMessage('未找到引用', 'info');
        return;
      }

      // 显示引用列表
      this.showReferences(references);

    } catch (error) {
      console.error('查找引用失败:', error);
      this.showMessage('查找引用失败', 'error');
    }
  }

  /**
   * 显示悬停信息
   */
  private async showHoverInfo(editor: any): Promise<void> {
    try {
      const position = editor.getPosition();

      if (!position || !this.filePath) {
        console.warn('无法获取当前位置或文件路径');
        return;
      }

      const hoverInfo = await this.clangdService.getHoverInfo(
        this.filePath,
        {
          line: position.lineNumber - 1,
          character: position.column - 1
        }
      );

      if (!hoverInfo || !hoverInfo.contents) {
        this.showMessage('无详细信息', 'info');
        return;
      }

      // 显示悬停信息
      this.displayHoverInfo(hoverInfo);

    } catch (error) {
      console.error('显示详情失败:', error);
      this.showMessage('显示详情失败', 'error');
    }
  }

  /**
   * 高亮显示指定行
   */
  private highlightLine(editor: any, lineNumber: number): void {
    const decorations = editor.deltaDecorations([], [{
      range: new this.monacoInstance.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: 'line-highlight',
        linesDecorationsClassName: 'line-highlight-decoration'
      }
    }]);

    // 2秒后清除高亮
    setTimeout(() => {
      editor.deltaDecorations(decorations, []);
    }, 2000);
  }

  /**
   * 显示引用列表
   */
  private showReferences(references: any[]): void {
    // 这里可以显示一个引用列表对话框
    console.log('References found:', references);

    // 简单的实现：显示第一个引用的位置信息
    if (references.length > 0) {
      const ref = references[0];
      const message = `找到 ${references.length} 个引用，第一个在第 ${ref.range.start.line + 1} 行`;
      this.showMessage(message, 'success');
    }
  }

  /**
   * 显示悬停信息
   */
  private displayHoverInfo(hoverInfo: any): void {
    let content = '';

    if (hoverInfo.contents) {
      if (Array.isArray(hoverInfo.contents)) {
        content = hoverInfo.contents.map((item: any) => {
          if (typeof item === 'string') {
            return item;
          } else if (item.value) {
            return item.value;
          }
          return JSON.stringify(item);
        }).join('\n');
      } else if (typeof hoverInfo.contents === 'string') {
        content = hoverInfo.contents;
      } else if (hoverInfo.contents.value) {
        content = hoverInfo.contents.value;
      }
    }

    if (content) {
      // 这里可以显示一个信息对话框或工具提示
      this.showMessage(content, 'info');
      console.log('Hover info:', content);
    }
  }

  /**
   * 请求打开文件（通知父组件）
   */
  private requestOpenFile(filePath: string, position: any): void {
    // 发出事件通知父组件打开文件并跳转到指定位置
    this.openFileRequest.emit({
      filePath,
      position
    });
  }

  /**
   * 显示消息
   */
  private showMessage(message: string, type: 'success' | 'info' | 'warning' | 'error'): void {
    // 使用ng-zorro的消息服务
    switch (type) {
      case 'success':
        this.message.success(message);
        break;
      case 'info':
        this.message.info(message);
        break;
      case 'warning':
        this.message.warning(message);
        break;
      case 'error':
        this.message.error(message);
        break;
    }
  }



  /**
   * 更新SDK和库文件路径，重新加载补全
   */
  public async updatePaths(sdkPath: string, librariesPath: string): Promise<void> {
    // this.sdkPath = sdkPath;
    // this.librariesPath = librariesPath;

    // 清理旧的注册
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // 重新初始化智能补全
    await this.initializeIntelligence();
  }

  /**
   * 搜索符号（现在使用 clangd 功能）
   * 注意：这个方法现在返回空数组，因为符号搜索现在通过 clangd 的文档符号功能实现
   */
  public searchSymbols(query: string): any[] {
    // 由于移除了本地符号解析，现在返回空数组
    // 实际的符号搜索现在通过 clangd 的文档符号功能在编辑器中实现
    console.warn('符号搜索功能已迁移到 clangd，请使用编辑器的"转到符号"功能');
    return [];
  }

  /**
   * 测试代码补全功能
   */
  public async testCompletion(): Promise<void> {
    console.log('=== 测试代码补全功能 ===');

    const editor = this.getEditorInstance();
    if (!editor) {
      console.error('编辑器实例未找到');
      return;
    }

    const model = editor.getModel();
    const position = editor.getPosition();

    if (!model || !position) {
      console.error('无法获取编辑器模型或位置');
      return;
    }

    console.log('当前位置:', position);
    console.log('文件路径:', this.filePath);

    try {
      // 直接调用 clangd 服务获取补全
      const result = await this.clangdService.getCompletionItems(model, position, {}, null, this.filePath);
      console.log('补全结果:', result);

      if (result.suggestions.length > 0) {
        console.log(`获取到 ${result.suggestions.length} 个补全建议:`);
        result.suggestions.slice(0, 5).forEach((item, index) => {
          console.log(`${index + 1}. ${item.label} (${item.source})`);
        });
      } else {
        console.log('没有获取到补全建议');
      }
    } catch (error) {
      console.error('测试补全失败:', error);
    }

    console.log('=== 测试结束 ===');
  }

  /**
   * 调试：检查 clangd 状态和补全功能
   */
  public async debugClangdStatus(): Promise<void> {
    console.log('=== Monaco Editor clangd 调试信息 ===');

    // 检查编辑器状态
    const editor = this.getEditorInstance();
    console.log('editor instance:', !!editor);
    console.log('monaco instance:', !!(window as any).monaco);

    // 检查 clangd 服务状态
    console.log('clangd ready:', this.clangdService.isClangdReady());

    // 检查 electronAPI
    const hasElectronAPI = typeof window !== 'undefined' && !!(window as any).electronAPI?.clangd;
    console.log('electronAPI.clangd available:', hasElectronAPI);

    if (hasElectronAPI) {
      try {
        const clangdAPI = (window as any).electronAPI.clangd;
        const status = await clangdAPI.getStatus();
        console.log('clangd status from electron:', status);
      } catch (error) {
        console.error('获取 clangd 状态失败:', error);
      }
    }

    // 检查注册的提供器数量
    console.log('disposables count:', this.disposables.length);

    // 如果有文件路径，测试文档是否已同步
    if (this.filePath) {
      const diagnostics = this.clangdService.getDocumentDiagnostics(this.filePath);
      console.log('document diagnostics count:', diagnostics.length);
    }

    console.log('=== 调试信息结束 ===');
  }
  public getEditorInstance(): any {
    return this.codeEditor?.['editorInstance'] || null;
  }

  /**
   * 获取编辑器的视图状态（包含滚动位置、光标位置等）
   */
  public getViewState(): any {
    const editor = this.getEditorInstance();
    if (editor && editor.getModel()) {
      try {
        const viewState = editor.saveViewState();
        // console.log('获取视图状态成功:', viewState);
        return viewState;
      } catch (error) {
        console.warn('获取视图状态失败:', error);
        return null;
      }
    } else {
      console.warn('编辑器实例或模型未准备好，无法获取视图状态');
      return null;
    }
  }

  /**
   * 恢复编辑器的视图状态
   */
  public restoreViewState(viewState: any): void {
    if (!viewState) return;

    const editor = this.getEditorInstance();
    if (editor && editor.getModel()) {
      try {
        editor.restoreViewState(viewState);
        console.log('视图状态恢复成功');
      } catch (error) {
        console.warn('恢复视图状态失败:', error);
      }
    } else {
      console.warn('编辑器实例或模型未准备好，无法恢复视图状态');
    }
  }

  /**
   * 安全地恢复编辑器状态，会等待编辑器准备就绪
   */
  public async restoreViewStateSafely(viewState: any): Promise<boolean> {
    if (!viewState) return false;

    return new Promise((resolve) => {
      const maxAttempts = 20;
      let attempts = 0;

      const tryRestore = () => {
        const editor = this.getEditorInstance();
        if (editor && editor.getModel()) {
          try {
            editor.restoreViewState(viewState);
            console.log('视图状态安全恢复成功');
            resolve(true);
            return;
          } catch (error) {
            console.warn('恢复视图状态失败:', error);
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryRestore, 50);
        } else {
          console.warn('视图状态恢复超时');
          resolve(false);
        }
      };

      tryRestore();
    });
  }

}
