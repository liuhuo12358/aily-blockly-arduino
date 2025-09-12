const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const fs = require('fs');

class ClangdService extends EventEmitter {
  constructor() {
    super();
    this.clangdProcess = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.isInitialized = false;
    this.workspaceRoot = null;
    this.buffer = '';
  }

  /**
   * 启动clangd进程
   * @param {string} workspaceRoot - 工作空间根目录
   * @param {object} options - 配置选项
   */
  async start(workspaceRoot, options = {}) {
    if (this.clangdProcess) {
      console.log('clangd process already running');
      return { success: true, message: 'clangd already running' };
    }

    this.workspaceRoot = workspaceRoot;
    const clangdPath = path.join(__dirname, '..', 'child', 'clangd', 'bin', 'clangd.exe');
    
    if (!fs.existsSync(clangdPath)) {
      const error = `clangd executable not found at ${clangdPath}`;
      console.error(error);
      return { success: false, error };
    }

    // 确保.temp目录存在
    const tempDir = path.join(workspaceRoot, '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const args = [
      '--background-index',
      '--clang-tidy',
      '--completion-style=detailed',
      '--header-insertion=iwyu',
      '--pch-storage=memory',
      '--log=error', // 减少日志输出，只显示错误
      '--pretty',
      `--compile-commands-dir=${tempDir}`,
      '--fallback-style=Google',
      '--limit-results=30', // 进一步限制补全结果数量
      '--cross-file-rename=false', // 禁用跨文件重命名以提高性能
      '--all-scopes-completion=false', // 限制补全范围
      '--header-insertion-decorators=false', // 禁用头文件插入装饰器
      '--function-arg-placeholders=false', // 禁用函数参数占位符
      '--completion-parse=auto', // 自动解析补全
      '--ranking-model=heuristics' // 使用启发式排序模型
    ];

    console.log(`Starting clangd at ${clangdPath} with args:`, args);
    console.log(`Workspace root: ${workspaceRoot}`);
    console.log(`Compile commands directory: ${tempDir}`);

    try {
      this.clangdProcess = spawn(clangdPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workspaceRoot,
        env: {
          ...process.env,
          // 设置一些环境变量优化clangd性能
          CLANGD_BACKGROUND_INDEXING: '1',
          CLANGD_LIMIT_MEMORY: '1024' // 限制内存使用
        }
      });

      this.clangdProcess.on('error', (error) => {
        console.error('clangd process error:', error);
        this.emit('error', error);
      });

      this.clangdProcess.on('exit', (code, signal) => {
        console.log(`clangd process exited with code ${code}, signal ${signal}`);
        this.clangdProcess = null;
        this.isInitialized = false;
        this.emit('exit', { code, signal });
      });

      this.clangdProcess.stdout.on('data', (data) => {
        this.handleStdout(data);
      });

      this.clangdProcess.stderr.on('data', (data) => {
        const stderr = data.toString();
        // 只记录重要错误，忽略一些常见的警告
        if (!stderr.includes('unknown warning option') && 
            !stderr.includes('optimization flag') &&
            !stderr.includes('Background index is not enabled')) {
          console.log('clangd stderr:', stderr);
        }
      });

      // 初始化LSP连接
      await this.initialize();
      
      return { success: true, message: 'clangd started successfully' };
    } catch (error) {
      console.error('Failed to start clangd:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 停止clangd进程
   */
  stop() {
    if (this.clangdProcess) {
      this.clangdProcess.kill('SIGTERM');
      this.clangdProcess = null;
      this.isInitialized = false;
      this.pendingRequests.clear();
    }
  }

  /**
   * 处理stdout数据
   */
  handleStdout(data) {
    this.buffer += data.toString();
    
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/);
      
      if (!contentLengthMatch) {
        console.error('Invalid LSP header:', header);
        break;
      }

      const contentLength = parseInt(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      
      if (this.buffer.length < messageStart + contentLength) {
        // 消息不完整，等待更多数据
        break;
      }

      const messageContent = this.buffer.substring(messageStart, messageStart + contentLength);
      this.buffer = this.buffer.substring(messageStart + contentLength);

      try {
        const message = JSON.parse(messageContent);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse LSP message:', error, messageContent);
      }
    }
  }

  /**
   * 处理LSP消息
   */
  handleMessage(message) {
    console.log('Received LSP message:', message);

    if (message.id !== undefined) {
      // 这是一个响应
      const request = this.pendingRequests.get(message.id);
      if (request) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          request.reject(new Error(message.error.message || 'LSP request failed'));
        } else {
          request.resolve(message.result);
        }
      }
    } else if (message.method) {
      // 这是一个通知或请求
      this.emit('notification', message);
    }
  }

  /**
   * 发送LSP请求
   */
  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.clangdProcess) {
        reject(new Error('clangd process is not running'));
        return;
      }

      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      const messageContent = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(messageContent, 'utf8')}\r\n\r\n`;
      const fullMessage = header + messageContent;

      console.log('Sending LSP request:', message);
      this.clangdProcess.stdin.write(fullMessage);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('LSP request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * 发送LSP通知
   */
  sendNotification(method, params = {}) {
    if (!this.clangdProcess) {
      console.error('clangd process is not running');
      return;
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params
    };

    const messageContent = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(messageContent, 'utf8')}\r\n\r\n`;
    const fullMessage = header + messageContent;

    console.log('Sending LSP notification:', message);
    this.clangdProcess.stdin.write(fullMessage);
  }

  /**
   * 初始化LSP连接
   */
  async initialize() {
    try {
      const result = await this.sendRequest('initialize', {
        processId: process.pid,
        rootPath: this.workspaceRoot,
        rootUri: `file://${this.workspaceRoot.replace(/\\/g, '/')}`,
        capabilities: {
          workspace: {
            workspaceFolders: true,
            didChangeConfiguration: {
              dynamicRegistration: true
            }
          },
          textDocument: {
            synchronization: {
              willSave: true,
              willSaveWaitUntil: true,
              didSave: true
            },
            completion: {
              dynamicRegistration: true,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                deprecatedSupport: true
              },
              contextSupport: true
            },
            hover: {
              dynamicRegistration: true,
              contentFormat: ['markdown', 'plaintext']
            },
            signatureHelp: {
              dynamicRegistration: true,
              signatureInformation: {
                documentationFormat: ['markdown', 'plaintext']
              }
            },
            definition: {
              dynamicRegistration: true
            },
            declaration: {
              dynamicRegistration: true
            },
            references: {
              dynamicRegistration: true
            },
            documentHighlight: {
              dynamicRegistration: true
            },
            documentSymbol: {
              dynamicRegistration: true,
              symbolKind: {
                valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
              }
            },
            codeAction: {
              dynamicRegistration: true
            },
            codeLens: {
              dynamicRegistration: true
            },
            formatting: {
              dynamicRegistration: true
            },
            rangeFormatting: {
              dynamicRegistration: true
            },
            onTypeFormatting: {
              dynamicRegistration: true
            },
            rename: {
              dynamicRegistration: true
            },
            publishDiagnostics: {
              relatedInformation: true
            }
          }
        },
        trace: 'off',
        workspaceFolders: [{
          uri: `file://${this.workspaceRoot.replace(/\\/g, '/')}`,
          name: path.basename(this.workspaceRoot)
        }]
      });

      console.log('clangd initialized:', result);

      // 发送初始化完成通知
      this.sendNotification('initialized', {});
      this.isInitialized = true;

      this.emit('initialized', result);
    } catch (error) {
      console.error('Failed to initialize clangd:', error);
      throw error;
    }
  }

  /**
   * 打开文档
   */
  async didOpen(uri, languageId, version, text) {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text
      }
    });
  }

  /**
   * 文档内容变更
   */
  async didChange(uri, version, changes) {
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version
      },
      contentChanges: changes
    });
  }

  /**
   * 关闭文档
   */
  async didClose(uri) {
    this.sendNotification('textDocument/didClose', {
      textDocument: {
        uri
      }
    });
  }

  /**
   * 保存文档
   */
  async didSave(uri, text) {
    this.sendNotification('textDocument/didSave', {
      textDocument: {
        uri
      },
      text
    });
  }

  /**
   * 获取代码补全（带过滤）
   */
  async getCompletion(uri, position, filterInternal = true) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: {
        uri
      },
      position,
      context: {
        triggerKind: 1 // 手动触发
      }
    });

    // 如果启用过滤，移除内部函数
    if (filterInternal && result && result.items) {
      result.items = this.filterInternalSymbols(result.items);
    }

    return result;
  }

  /**
   * 过滤内部符号，只保留用户需要的函数
   */
  filterInternalSymbols(items) {
    const filtered = items.filter(item => {
      const label = item.label || '';
      const detail = item.detail || '';
      const documentation = item.documentation?.value || item.documentation || '';
      
      // 过滤掉以下模式的内部函数：
      // 1. 以下划线开头的函数（通常是内部函数）
      if (label.startsWith('_') || label.startsWith('__')) {
        return false;
      }
      
      // 2. AVR寄存器和内部宏
      if (label.match(/^(DDR|PORT|PIN)[A-Z]$/) || 
          label.match(/^(TCCR|TCNT|OCR|ICR|TIMSK|TIFR)\d*[A-Z]*$/) ||
          label.match(/^(UCSR|UDR|UBRR|USART)\d*[A-Z]*$/) ||
          label.match(/^(ADCSRA|ADCSRB|ADMUX|ADCL|ADCH)$/)) {
        return false;
      }
      
      // 3. GCC内部函数
      if (label.startsWith('__builtin_') || 
          label.startsWith('__sync_') || 
          label.startsWith('__atomic_')) {
        return false;
      }
      
      // 4. AVR-libc内部函数
      if (label.match(/^(cli|sei|wdt_|eeprom_|pgm_|PROGMEM)/) && 
          !['cli', 'sei'].includes(label)) {
        return false;
      }
      
      // 5. 编译器内部类型和常量
      if (label.match(/^(__flash|__memx|__farflash)/) ||
          label.match(/^(FSTR|PSTR)$/)) {
        return false;
      }
      
      // 6. 过滤内部结构体成员
      if (detail.includes('(anonymous') || 
          detail.includes('__attribute__')) {
        return false;
      }
      
      // 7. 过滤一些不常用的Arduino内部函数
      const internalArduinoFunctions = [
        'serialEvent', 'serialEvent1', 'serialEvent2', 'serialEvent3',
        'yield', 'serialEventRun', 'main',
        'timer0_overflow_count', 'timer0_millis', 'timer0_fract'
      ];
      
      if (internalArduinoFunctions.includes(label)) {
        return false;
      }
      
      return true;
    });
    
    // 按类型排序：函数 > 变量 > 宏 > 其他
    return filtered.sort((a, b) => {
      const getTypePriority = (item) => {
        const kind = item.kind;
        if (kind === 3) return 1; // Function
        if (kind === 6) return 2; // Variable  
        if (kind === 14) return 3; // Macro
        return 4; // Others
      };
      
      const priorityA = getTypePriority(a);
      const priorityB = getTypePriority(b);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * 获取悬停信息
   */
  async getHover(uri, position) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    return await this.sendRequest('textDocument/hover', {
      textDocument: {
        uri
      },
      position
    });
  }

  /**
   * 获取定义
   */
  async getDefinition(uri, position) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    return await this.sendRequest('textDocument/definition', {
      textDocument: {
        uri
      },
      position
    });
  }

  /**
   * 获取引用
   */
  async getReferences(uri, position, includeDeclaration = true) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    return await this.sendRequest('textDocument/references', {
      textDocument: {
        uri
      },
      position,
      context: {
        includeDeclaration
      }
    });
  }

  /**
   * 获取文档符号（带过滤）
   */
  async getDocumentSymbols(uri, filterInternal = true) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: {
        uri
      }
    });

    // 如果启用过滤，移除内部符号
    if (filterInternal && result) {
      return this.filterDocumentSymbols(result);
    }

    return result;
  }

  /**
   * 过滤文档符号
   */
  filterDocumentSymbols(symbols) {
    if (!Array.isArray(symbols)) {
      return symbols;
    }
    
    return symbols.filter(symbol => {
      const name = symbol.name || '';
      
      // 过滤内部符号
      if (name.startsWith('_') || name.startsWith('__')) {
        return false;
      }
      
      // 过滤编译器生成的符号
      if (name.includes('anonymous') || name.includes('$')) {
        return false;
      }
      
      // 递归过滤子符号
      if (symbol.children) {
        symbol.children = this.filterDocumentSymbols(symbol.children);
      }
      
      return true;
    });
  }

  /**
   * 获取签名帮助
   */
  async getSignatureHelp(uri, position) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    return await this.sendRequest('textDocument/signatureHelp', {
      textDocument: {
        uri
      },
      position
    });
  }

  /**
   * 格式化文档
   */
  async formatDocument(uri, options) {
    if (!this.isInitialized) {
      throw new Error('clangd is not initialized');
    }

    return await this.sendRequest('textDocument/formatting', {
      textDocument: {
        uri
      },
      options
    });
  }

  /**
   * 获取诊断信息（错误、警告等）
   */
  getDiagnostics() {
    // 诊断信息通过通知发送，可以通过监听 'notification' 事件获取
    // 这里返回当前缓存的诊断信息
    return this.diagnostics || [];
  }

  /**
   * 检查clangd是否运行
   */
  isRunning() {
    return this.clangdProcess !== null && !this.clangdProcess.killed;
  }

  /**
   * 检查clangd是否已初始化
   */
  isReady() {
    return this.isInitialized && this.isRunning();
  }
}

module.exports = ClangdService;
