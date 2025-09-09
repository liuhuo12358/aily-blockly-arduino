import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ArduinoParserService, ArduinoSymbol } from './arduino-parser.service';
import { AIConfig, DEFAULT_AI_CONFIG, AI_PROMPTS } from '../configs/ai-config';

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
export class CodeIntelligenceService {
  private localSymbols: ArduinoSymbol[] = [];
  private aiCompletionsCache = new Map<string, { completions: CompletionItem[], timestamp: number }>();
  private config: AIConfig = { ...DEFAULT_AI_CONFIG };
  
  // 用于实时AI补全状态
  private aiCompletionSubject = new BehaviorSubject<CompletionItem[]>([]);
  public aiCompletions$ = this.aiCompletionSubject.asObservable();

  constructor(
    private arduinoParserService: ArduinoParserService,
    private http: HttpClient
  ) {
    // 定期清理过期缓存
    setInterval(() => this.cleanExpiredCache(), 60000); // 每分钟清理一次
  }

  /**
   * 初始化代码智能补全服务
   */
  async initialize(sdkPath: string, librariesPath: string): Promise<void> {
    try {
      // 加载本地符号
      await this.loadLocalSymbols(sdkPath, librariesPath);
      console.log(`代码智能补全服务已初始化，加载了 ${this.localSymbols.length} 个本地符号`);
    } catch (error) {
      console.error('初始化代码智能补全服务失败:', error);
    }
  }

  /**
   * 加载本地符号（从Arduino SDK和库文件）
   */
  private async loadLocalSymbols(sdkPath: string, librariesPath: string): Promise<void> {
    this.localSymbols = await this.arduinoParserService.parseSDKAndLibraries(sdkPath, librariesPath);
  }

  /**
   * 获取代码补全建议
   */
  async getCompletionItems(
    model: any,
    position: any,
    context: any,
    token: any
  ): Promise<{ suggestions: CompletionItem[] }> {
    const suggestions: CompletionItem[] = [];

    // 1. 获取本地补全
    const localCompletions = this.getLocalCompletions(model, position);
    suggestions.push(...localCompletions);

    // 2. 获取AI补全（异步）
    if (this.config.enabled) {
      const aiCompletions = await this.getAICompletions(model, position, context);
      suggestions.push(...aiCompletions);
    }

    // 按相关性排序
    suggestions.sort((a, b) => {
      // 本地符号优先级更高
      if (a.source === 'local' && b.source === 'ai') return -1;
      if (a.source === 'ai' && b.source === 'local') return 1;
      
      // 按字母顺序排序
      return a.label.localeCompare(b.label);
    });

    return { suggestions };
  }

  /**
   * 获取本地代码补全
   */
  private getLocalCompletions(model: any, position: any): CompletionItem[] {
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    };

    const completions: CompletionItem[] = [];

    for (const symbol of this.localSymbols) {
      // 基于前缀匹配
      if (symbol.name.toLowerCase().startsWith(word.word.toLowerCase())) {
        completions.push({
          label: symbol.name,
          kind: this.mapSymbolKindToCompletionKind(symbol.kind),
          detail: symbol.detail,
          documentation: symbol.documentation || `来自: ${symbol.filePath}`,
          insertText: symbol.insertText,
          insertTextRules: symbol.kind === 'function' ? 4 : 0, // InsertAsSnippet
          sortText: symbol.name,
          source: 'local'
        });
      }
    }

    return completions;
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
  private async callAIAPI(request: AICompletionRequest): Promise<AICompletionResponse> {
    try {
      const response = await this.http.post<AICompletionResponse>(
        this.config.apiEndpoint,
        request,
        {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
          })
        }
      ).pipe(
        timeout(this.config.timeout),
        catchError(() => of({ suggestions: [] }))
      ).toPromise();

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
   * 映射符号类型到补全类型
   */
  private mapSymbolKindToCompletionKind(symbolKind: string): CompletionItemKind {
    switch (symbolKind) {
      case 'function':
        return CompletionItemKind.Function;
      case 'class':
        return CompletionItemKind.Class;
      case 'variable':
        return CompletionItemKind.Variable;
      default:
        return CompletionItemKind.Text;
    }
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
   * 更新本地符号
   */
  public async updateLocalSymbols(sdkPath: string, librariesPath: string): Promise<void> {
    await this.loadLocalSymbols(sdkPath, librariesPath);
  }

  /**
   * 获取当前加载的符号数量
   */
  public getSymbolsCount(): number {
    return this.localSymbols.length;
  }

  /**
   * 获取当前缓存大小
   */
  public getCacheSize(): number {
    return this.aiCompletionsCache.size;
  }

  /**
   * 搜索符号
   */
  public searchSymbols(query: string): ArduinoSymbol[] {
    return this.localSymbols.filter(symbol =>
      symbol.name.toLowerCase().includes(query.toLowerCase()) ||
      (symbol.detail && symbol.detail.toLowerCase().includes(query.toLowerCase()))
    );
  }
}
