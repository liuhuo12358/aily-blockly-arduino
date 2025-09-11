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

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sdkPath'] || changes['librariesPath']) {
      setTimeout(async () => {
        if (this.codeEditor) {
          // 初始化代码智能补全服务
          if (this.sdkPath && this.librariesPath) {
            await this.initializeIntelligence();
          }
        }
      }, 500);
    }
  }

  ngOnDestroy() {
    this.disposables.forEach(d => d.dispose());
  }

  onCodeChange(newCode: string): void {
    this.codeChange.emit(newCode);
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
   * 初始化代码智能补全功能
   */
  async initializeIntelligence(): Promise<void> {
    try {
      // 初始化代码智能补全服务（不再需要 SDK 和库路径）
      await this.clangdService.initialize();

      // 获取Monaco实例
      const monaco = (window as any).monaco;
      if (!monaco) {
        console.error('Monaco实例未找到');
        return;
      }

      // 注册智能补全提供器
      const completionDisposable = monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: async (model: any, position: any, context: any, token: any) => {
          return await this.clangdService.getCompletionItems(model, position, context, token, this.filePath);
        },
        triggerCharacters: ['.', '->', '::', '(', ' ']
      });

      // 注册内联建议提供器（用于AI实时补全）
      const inlineCompletionDisposable = monaco.languages.registerInlineCompletionsProvider('cpp', {
        provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
          return await this.provideInlineCompletions(model, position, context, token);
        },
        freeInlineCompletions: (completions: any) => {
          // 释放资源
        }
      });

      // 注册键盘快捷键处理器（Tab键接受AI建议）
      // 注意：由于editorInstance是私有的，我们在editorInitialized回调中处理

      this.disposables.push(completionDisposable, inlineCompletionDisposable);

      console.log('代码智能补全功能已初始化');

    } catch (error) {
      console.error('初始化代码智能补全功能失败:', error);
    }
  }

  /**
   * 提供内联补全建议（AI实时补全）
   */
  private async provideInlineCompletions(model: any, position: any, context: any, token: any): Promise<any> {
    try {
      const completionResult = await this.clangdService.getCompletionItems(model, position, context, token);
      const aiCompletions = completionResult.suggestions.filter(item => item.source === 'ai');

      if (aiCompletions.length > 0) {
        const bestCompletion = aiCompletions[0];
        return {
          items: [{
            insertText: bestCompletion.insertText,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            }
          }]
        };
      }

      return { items: [] };
    } catch (error) {
      console.error('获取内联补全失败:', error);
      return { items: [] };
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
    this.sdkPath = sdkPath;
    this.librariesPath = librariesPath;

    // 清理旧的注册
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // 重新初始化智能补全
    await this.initializeIntelligence();
  }

  /**
   * 获取代码智能补全服务的状态信息
   */
  public getIntelligenceStatus(): any {
    return {
      clangdReady: this.clangdService.isClangdReady(),
      aiEnabled: true, // 可以添加配置
      cacheSize: this.clangdService.getCacheSize()
    };
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
   * 清除AI补全缓存
   */
  public clearAICache(): void {
    this.clangdService.clearAICache();
  }

  /**
   * 获取Monaco编辑器实例
   */
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
