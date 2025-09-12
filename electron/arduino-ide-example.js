/**
 * ClangdService 使用示例 - 如何过滤内部函数
 */

const ClangdService = require('./clangd');
const CompileCommandsGenerator = require('./compile-commands-generator');

class ArduinoIDE {
  constructor() {
    this.clangdService = new ClangdService();
  }

  /**
   * 初始化代码智能服务
   */
  async initializeCodeIntelligence(projectPath, sdkPaths, librariesPaths) {
    try {
      // 1. 生成优化的编译命令
      const generator = new CompileCommandsGenerator(projectPath, sdkPaths, librariesPaths);
      await generator.saveToFile(projectPath);

      // 2. 启动clangd服务
      const result = await this.clangdService.start(projectPath);
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('Code intelligence initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize code intelligence:', error);
      return false;
    }
  }

  /**
   * 获取过滤后的代码补全
   */
  async getFilteredCompletion(fileUri, position) {
    try {
      // 使用过滤功能，filterInternal = true
      const completion = await this.clangdService.getCompletion(fileUri, position, true);
      
      console.log(`Got ${completion?.items?.length || 0} filtered completion items`);
      
      // 可以进一步自定义过滤
      if (completion && completion.items) {
        completion.items = this.customFilter(completion.items);
      }
      
      return completion;
    } catch (error) {
      console.error('Failed to get completion:', error);
      return null;
    }
  }

  /**
   * 自定义过滤逻辑
   */
  customFilter(items) {
    return items.filter(item => {
      const label = item.label;
      
      // 只显示Arduino核心函数和用户定义的函数
      const arduinoCoreKeywords = [
        'digitalWrite', 'digitalRead', 'analogWrite', 'analogRead',
        'pinMode', 'delay', 'delayMicroseconds', 'millis', 'micros',
        'setup', 'loop', 'Serial', 'String', 'int', 'float', 'char',
        'void', 'boolean', 'byte', 'word', 'long', 'unsigned',
        'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP',
        'true', 'false', 'if', 'else', 'for', 'while', 'do',
        'switch', 'case', 'default', 'break', 'continue', 'return'
      ];
      
      // 如果是Arduino核心关键字，保留
      if (arduinoCoreKeywords.some(keyword => 
          label.toLowerCase().includes(keyword.toLowerCase()))) {
        return true;
      }
      
      // 如果是用户定义的函数（不包含特殊字符），保留
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(label) && 
          !label.startsWith('__') && 
          !label.includes('REGISTER')) {
        return true;
      }
      
      return false;
    }).slice(0, 20); // 限制最多20个结果
  }

  /**
   * 获取过滤后的文档符号
   */
  async getFilteredDocumentSymbols(fileUri) {
    try {
      const symbols = await this.clangdService.getDocumentSymbols(fileUri, true);
      console.log('Got filtered document symbols');
      return symbols;
    } catch (error) {
      console.error('Failed to get document symbols:', error);
      return null;
    }
  }

  /**
   * 停止代码智能服务
   */
  cleanup() {
    this.clangdService.stop();
  }
}

module.exports = ArduinoIDE;

// 使用示例
async function example() {
  const ide = new ArduinoIDE();
  
  const projectPath = 'C:\\Users\\YourUser\\Documents\\Arduino\\MyProject';
  const sdkPaths = ['C:\\Program Files (x86)\\Arduino\\hardware\\arduino\\avr\\cores\\arduino'];
  const librariesPaths = ['C:\\Program Files (x86)\\Arduino\\libraries'];
  
  // 初始化
  await ide.initializeCodeIntelligence(projectPath, sdkPaths, librariesPaths);
  
  // 模拟获取补全
  const fileUri = `file:///${projectPath}/sketch.ino`;
  const position = { line: 10, character: 5 };
  
  const completion = await ide.getFilteredCompletion(fileUri, position);
  console.log('Filtered completion:', completion);
  
  // 清理
  ide.cleanup();
}

// 如果直接运行此文件
if (require.main === module) {
  example().catch(console.error);
}
