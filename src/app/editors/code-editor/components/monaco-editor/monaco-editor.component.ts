import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCodeEditorModule, NzCodeEditorComponent } from 'ng-zorro-antd/code-editor';
import { CodeIntelligenceService } from '../../../../services/code-intelligence.service';

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

  @Output() codeChange = new EventEmitter<string>();

  @Input() sdkPath: string;
  @Input() librariesPath: string;

  private disposables: any[] = [];
  private monacoInstance: any;

  constructor(
    private codeIntelligenceService: CodeIntelligenceService
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
      const tabDisposable = editor.addCommand(this.monacoInstance.KeyCode.Tab, () => {
        this.acceptInlineCompletion(editor);
      });
      this.disposables.push(tabDisposable);
    }
    
    // console.log(editor);
    // setTimeout(() => {
    //   editor.getAction('editor.action.formatDocument').run();
    // }, 3000);
  }

  /**
   * 初始化代码智能补全功能
   */
  async initializeIntelligence(): Promise<void> {
    try {
      // 初始化代码智能补全服务
      await this.codeIntelligenceService.initialize(this.sdkPath, this.librariesPath);

      // 获取Monaco实例
      const monaco = (window as any).monaco;
      if (!monaco) {
        console.error('Monaco实例未找到');
        return;
      }

      // 注册智能补全提供器
      const completionDisposable = monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: async (model: any, position: any, context: any, token: any) => {
          return await this.codeIntelligenceService.getCompletionItems(model, position, context, token);
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
      const completionResult = await this.codeIntelligenceService.getCompletionItems(model, position, context, token);
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
   * 接受内联补全建议
   */
  private acceptInlineCompletion(editor: any): void {
    // 这里可以添加接受内联补全的逻辑
    // Monaco Editor会自动处理大部分情况
    editor.trigger('keyboard', 'acceptAlternativeSelectedSuggestion', {});
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
      symbolsCount: this.codeIntelligenceService.getSymbolsCount(),
      aiEnabled: true, // 可以添加配置
      sdkPath: this.sdkPath,
      librariesPath: this.librariesPath
    };
  }

  /**
   * 搜索符号
   */
  public searchSymbols(query: string): any[] {
    return this.codeIntelligenceService.searchSymbols(query);
  }

  /**
   * 清除AI补全缓存
   */
  public clearAICache(): void {
    this.codeIntelligenceService.clearAICache();
  }

}
