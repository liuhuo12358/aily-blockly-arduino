import { Injectable } from '@angular/core';
import { CmdService } from '../../../services/cmd.service';
import { ProjectService } from '../../../services/project.service';
import { BlocklyService } from '../../../editors/blockly-editor/services/blockly.service';

// Arduino 代码检查器
declare const arduinoGenerator: any;

/**
 * Lint 检测模式
 */
export type LintMode = 'fast' | 'accurate' | 'auto';

/**
 * Lint 输出格式
 */
export type LintFormat = 'human' | 'vscode' | 'json';

/**
 * Lint 检查选项
 */
export interface LintOptions {
  mode?: LintMode;           // 检测模式，默认 'auto'
  format?: LintFormat;       // 输出格式，默认 'json'
  timeout?: number;          // 超时时间，默认 10000ms
}

/**
 * Lint 检查结果（JSON格式）
 */
export interface LintResult {
  success: boolean;          // 是否检查成功
  errors: LintError[];       // 错误列表
  warnings: LintError[];     // 警告列表
  executionTime: number;     // 执行时间（毫秒）
  mode?: string;             // 实际使用的检测模式
}

/**
 * Lint 错误信息
 */
export interface LintError {
  file: string;              // 文件路径
  line: number;              // 行号
  column: number;            // 列号
  message: string;           // 错误信息
  severity: 'error' | 'warning'; // 严重程度
}

/**
 * Arduino Lint 服务
 * 基于 aily-builder 的 lint 功能，提供简化的代码语法检查
 */
@Injectable({
  providedIn: 'root'
})
export class ArduinoLintService {

  private lintInProgress = false;

  constructor(
    private cmdService: CmdService,
    private projectService: ProjectService,
    private blocklyService: BlocklyService
  ) { 
    // 将服务实例注册到全局对象，以便 ArduinoSyntaxTool 可以访问
    (window as any)['arduinoLintService'] = this;
    console.log('🔧 ArduinoLintService 已注册到全局对象');
  }

  /**
   * 检查 Arduino 代码语法
   * @param code Arduino 代码字符串
   * @param options 检查选项
   * @returns 检查结果
   */
  async checkSyntax(code: string, options: LintOptions = {}): Promise<LintResult> {
    const startTime = Date.now();
    
    // 设置默认选项
    const {
      mode = 'auto',
      format = 'json',
      timeout = 10000
    } = options;

    try {
      if (this.lintInProgress) {
        console.warn('⚠️ 检测到并发 lint 请求，重置状态后继续');
        this.lintInProgress = false; // 强制重置状态
        // 等待一小段时间确保之前的操作完成
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.lintInProgress = true;

      console.log(`🔍 开始 Arduino 语法检查 (模式: ${mode}, 格式: ${format})...`);

      // 验证输入
      if (!code || code.trim().length === 0) {
        throw new Error('代码内容为空');
      }

      // 准备临时环境
      const tempEnv = await this.prepareTempEnvironment(code);
      
      try {
        // 执行 lint 检查
        const result = await this.executeLint(tempEnv, mode, format, timeout);
        
        // 解析结果
        const parsedResult = this.parseResult(result, startTime, mode, format);
        
        console.log(`✅ Lint 检查完成: ${parsedResult.success ? '通过' : '失败'} (${parsedResult.executionTime}ms)`);
        
        return parsedResult;
        
      } finally {
        // 清理临时文件
        await this.cleanupTempFiles(tempEnv.tempPath);
      }

    } catch (error: any) {
      console.error('❌ Arduino 语法检查失败:', error);
      
      return {
        success: false,
        errors: [{
          file: 'sketch.ino',
          line: 1,
          column: 1,
          message: `语法检查失败: ${error.message}`,
          severity: 'error'
        }],
        warnings: [],
        executionTime: Date.now() - startTime,
        mode
      };
    } finally {
      this.lintInProgress = false;
    }
  }

  /**
   * 重置 lint 状态 (用于调试和错误恢复)
   */
  resetLintState(): void {
    console.log('🔄 重置 Arduino lint 状态');
    this.lintInProgress = false;
  }

  /**
   * 检查当前 Blockly 工作区的代码
   * @param options 检查选项
   * @returns 检查结果
   */
  async checkCurrentWorkspace(options: LintOptions = {}): Promise<LintResult> {
    try {
      // 从 Blockly 工作区生成代码
      const code = arduinoGenerator.workspaceToCode(this.blocklyService.workspace);
      
      if (!code || code.trim().length === 0) {
        return {
          success: false,
          errors: [{
            file: 'workspace',
            line: 1,
            column: 1,
            message: '工作区为空，无法生成代码',
            severity: 'error'
          }],
          warnings: [],
          executionTime: 0,
          mode: options.mode || 'auto'
        };
      }

      return await this.checkSyntax(code, options);
    } catch (error: any) {
      console.error('检查当前工作区失败:', error);
      throw error;
    }
  }

  /**
   * 准备临时环境 - 复用项目的 .temp 目录
   */
  private async prepareTempEnvironment(code: string): Promise<{
    tempPath: string;
    sketchPath: string;
    sketchFilePath: string;
    librariesPath: string;
  }> {
    const currentProjectPath = this.projectService.currentProjectPath;
    
    // 复用项目的 .temp 目录，与 BuilderService 保持一致
    const tempPath = currentProjectPath + '/.temp';
    const sketchPath = tempPath + '/sketch';
    const sketchFilePath = sketchPath + '/sketch.ino';
    const librariesPath = tempPath + '/libraries';

    try {
      // 创建必要的目录结构（如果不存在）
      if (!window['path'].isExists(tempPath)) {
        await this.cmdService.runAsync(`New-Item -Path "${tempPath}" -ItemType Directory -Force`);
        console.log(`✅ 创建临时目录: ${tempPath}`);
      } else {
        console.log(`♻️ 复用现有临时目录: ${tempPath}`);
      }
      
      if (!window['path'].isExists(sketchPath)) {
        await this.cmdService.runAsync(`New-Item -Path "${sketchPath}" -ItemType Directory -Force`);
        console.log(`✅ 创建 sketch 目录: ${sketchPath}`);
      }
      
      if (!window['path'].isExists(librariesPath)) {
        await this.cmdService.runAsync(`New-Item -Path "${librariesPath}" -ItemType Directory -Force`);
        console.log(`✅ 创建 libraries 目录: ${librariesPath}`);
      }

      // 写入代码到 sketch.ino 文件
      await window['fs'].writeFileSync(sketchFilePath, code);
      console.log(`✅ 写入代码到: ${sketchFilePath}`);

      console.log(`✅ 临时环境准备完成，复用项目 .temp 目录: ${tempPath}`);

      return {
        tempPath,
        sketchPath,
        sketchFilePath,
        librariesPath
      };
    } catch (error: any) {
      console.error('准备 lint 环境失败:', error);
      throw new Error(`准备检查环境失败: ${error.message}`);
    }
  }

  /**
   * 执行 aily-builder lint 检查
   */
  private async executeLint(
    env: { tempPath: string; sketchPath: string; sketchFilePath: string; librariesPath: string; },
    mode: LintMode,
    format: LintFormat,
    timeout: number
  ): Promise<string> {
    try {
      // 构建 lint 命令
      const lintCommand = await this.buildLintCommand(env, mode, format);

      console.log(`🚀 执行 lint 命令: ${lintCommand}`);

      // 收集所有输出
      let allOutput = '';
      let hasError = false;
      let errorMessage = '';

      return new Promise((resolve, reject) => {
        this.cmdService.run(lintCommand).subscribe({
          next: (output) => {
            console.log('📋 cmdService 输出类型:', output.type);
            console.log('📋 cmdService 输出数据:', output.data);
            
            if (output.type === 'stdout' && output.data) {
              allOutput += output.data;
            } else if (output.type === 'stderr' && output.data) {
              // stderr 也可能包含有效的 JSON 输出
              allOutput += output.data;
            } else if (output.type === 'error') {
              hasError = true;
              errorMessage = output.error || '命令执行失败';
            }
          },
          error: (error) => {
            console.error('📋 cmdService 执行错误:', error);
            reject(new Error(`命令执行失败: ${error.message || error}`));
          },
          complete: () => {
            console.log('📋 cmdService 执行完成，总输出:', allOutput);
            if (hasError && !allOutput.trim()) {
              reject(new Error(errorMessage));
            } else {
              resolve(allOutput);
            }
          }
        });
      });

    } catch (error: any) {
      console.error('执行 lint 失败:', error);
      throw error;
    }
  }

  /**
   * 构建 aily-builder lint 命令
   */
  private async buildLintCommand(
    env: { sketchFilePath: string; librariesPath: string; },
    mode: LintMode,
    format: LintFormat
  ): Promise<string> {
    // 获取项目配置
    const packageJson = await this.projectService.getPackageJson();
    const boardJson = await this.projectService.getBoardJson();

    if (!boardJson) {
      throw new Error('未找到板子信息(board.json)');
    }

    // 获取编译参数并替换 compile 为 lint
    let compilerParam = boardJson.compilerParam;
    if (!compilerParam) {
      throw new Error('未找到编译命令(compilerParam)');
    }

    // 将 compile 替换为 lint，并清理不支持的参数
    let lintParam = compilerParam.replace(/\bcompile\b/g, 'lint');
    
    // 移除 lint 命令不支持的参数
    lintParam = lintParam.replace(/\s+-v\b/g, ''); // 移除 -v
    lintParam = lintParam.replace(/\s+--verbose\b/g, ''); // 移除已有的 --verbose
    
    // 添加 --verbose 以获取详细输出
    // lintParam += ' --verbose';

    // 提取板子类型
    let boardType = '';
    const compilerParamList = lintParam.split(' ');
    for (let i = 0; i < compilerParamList.length; i++) {
      if (compilerParamList[i] === '-b' || compilerParamList[i] === '--board') {
        if (i + 1 < compilerParamList.length) {
          boardType = compilerParamList[i + 1];
          break;
        }
      }
    }

    if (!boardType) {
      throw new Error('未找到板子类型');
    }

    // 获取工具版本信息
    const boardDependencies = (await this.projectService.getBoardPackageJson()).boardDependencies || {};
    const toolVersions: string[] = [];
    let sdk = '';

    Object.entries(boardDependencies).forEach(([key, version]) => {
      if (key.startsWith('@aily-project/compiler-')) {
        const compiler = key.replace(/^@aily-project\/compiler-/, '') + '@' + version;
        toolVersions.push(compiler);
      } else if (key.startsWith('@aily-project/sdk-')) {
        sdk = key.replace(/^@aily-project\/sdk-/, '') + '_' + version;
      } else if (key.startsWith('@aily-project/tool-')) {
        let toolName = key.replace(/^@aily-project\/tool-/, '');
        if (toolName.startsWith('idf_')) {
          toolName = 'esp32-arduino-libs';
        }
        const tool = toolName + '@' + version;
        toolVersions.push(tool);
      }
    });

    if (!sdk) {
      throw new Error('未找到 SDK 信息');
    }

    // 构建路径
    const sdkPath = await window["env"].get('AILY_SDK_PATH') + `/${sdk}`;
    const toolsPath = await window["env"].get('AILY_TOOLS_PATH');

    // 构建完整的 lint 命令
    const lintCommandParts = [
      "node",
      `"${window['path'].getAilyBuilderPath()}/index.js"`,
      lintParam,
      `"${env.sketchFilePath}"`,
      '--board', `"${boardType}"`,
      '--libraries-path', `"${env.librariesPath}"`,
      '--sdk-path', `"${sdkPath}"`,
      '--tools-path', `"${toolsPath}"`,
      '--tool-versions', `"${toolVersions.join(',')}"`,
      '--mode', mode,
      '--format', format
    ];

    return lintCommandParts.join(' ');
  }

  /**
   * 解析 lint 检查结果
   */
  private parseResult(output: string, startTime: number, mode: LintMode, format: LintFormat): LintResult {
    const executionTime = Date.now() - startTime;

    try {
      if (format === 'json') {
        // 提取 JSON 部分 - aily-builder 输出可能包含日志信息
        console.log('🔍 原始输出:', output);
        
        let jsonText = output;
        
        // 查找 JSON 对象的开始位置
        const jsonStart = output.indexOf('{');
        console.log('📍 JSON 开始位置:', jsonStart);
        
        if (jsonStart !== -1) {
          // 从第一个 { 开始提取
          jsonText = output.substring(jsonStart);
          
          // 查找最后一个完整的 }
          let braceCount = 0;
          let jsonEnd = -1;
          for (let i = 0; i < jsonText.length; i++) {
            if (jsonText[i] === '{') braceCount++;
            if (jsonText[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          
          if (jsonEnd !== -1) {
            jsonText = jsonText.substring(0, jsonEnd);
          }
        } else {
          console.warn('⚠️ 未找到 JSON 开始标记，尝试直接解析整个输出');
        }
        
        console.log('🔍 提取的 JSON 文本:', jsonText);
        console.log('📏 JSON 文本长度:', jsonText.length);
        
        if (!jsonText.trim()) {
          throw new Error('提取的 JSON 文本为空');
        }
        
        // JSON 格式直接解析
        const jsonResult = JSON.parse(jsonText);
        return {
          success: jsonResult.success || false,
          errors: jsonResult.errors || [],
          warnings: jsonResult.warnings || [],
          executionTime: jsonResult.executionTime || executionTime,
          mode: jsonResult.mode || mode
        };
      } else if (format === 'vscode') {
        // VS Code 格式解析
        return this.parseVSCodeFormat(output, executionTime, mode);
      } else {
        // Human 格式解析
        return this.parseHumanFormat(output, executionTime, mode);
      }
    } catch (error) {
      console.error('解析 lint 结果失败:', error);
      return {
        success: false,
        errors: [{
          file: 'sketch.ino',
          line: 1,
          column: 1,
          message: `结果解析失败: ${error.message}`,
          severity: 'error'
        }],
        warnings: [],
        executionTime,
        mode
      };
    }
  }

  /**
   * 解析 VS Code 格式输出
   */
  private parseVSCodeFormat(output: string, executionTime: number, mode: LintMode): LintResult {
    const errors: LintError[] = [];
    const warnings: LintError[] = [];

    if (!output || output.trim().length === 0) {
      return {
        success: true,
        errors: [],
        warnings: [],
        executionTime,
        mode
      };
    }

    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // VS Code 格式: file(line,column): severity: message
      const match = trimmedLine.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning|info):\s+(.+)$/);
      if (match) {
        const [, file, lineStr, colStr, severity, message] = match;
        
        const lintError: LintError = {
          file: file.trim(),
          line: parseInt(lineStr),
          column: parseInt(colStr),
          message: message.trim(),
          severity: severity.toLowerCase() === 'error' ? 'error' : 'warning'
        };

        if (lintError.severity === 'error') {
          errors.push(lintError);
        } else {
          warnings.push(lintError);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      executionTime,
      mode
    };
  }

  /**
   * 解析 Human 格式输出
   */
  private parseHumanFormat(output: string, executionTime: number, mode: LintMode): LintResult {
    const errors: LintError[] = [];
    const warnings: LintError[] = [];

    if (!output || output.trim().length === 0) {
      return {
        success: true,
        errors: [],
        warnings: [],
        executionTime,
        mode
      };
    }

    // 检查是否包含成功标识
    if (output.includes('✅ Syntax check passed!')) {
      return {
        success: true,
        errors: [],
        warnings: [],
        executionTime,
        mode
      };
    }

    // 检查是否包含失败标识
    if (output.includes('❌ Syntax check failed!')) {
      // 解析错误信息
      const lines = output.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 尝试匹配错误格式: file:line:column
        const match = trimmedLine.match(/^(.+):(\d+):(\d+)\s+(.+)$/);
        if (match) {
          const [, file, lineStr, colStr, message] = match;
          
          errors.push({
            file: file.trim(),
            line: parseInt(lineStr),
            column: parseInt(colStr),
            message: message.trim(),
            severity: 'error'
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      executionTime,
      mode
    };
  }

  /**
   * 清理临时文件 - 只清理 lint 相关的文件，不删除整个 .temp 目录
   */
  private async cleanupTempFiles(tempPath: string): Promise<void> {
    try {
      // 只删除我们创建的 sketch.ino 文件，不删除整个目录
      const sketchFilePath = tempPath + '/sketch/sketch.ino';
      
      if (window['path'].isExists(sketchFilePath)) {
        await window['fs'].unlinkSync(sketchFilePath);
        console.log('✅ 清理 lint 临时文件: sketch.ino');
      }
      
      // 注意：不删除 .temp 目录本身，因为可能被其他功能使用
      console.log('✅ lint 临时文件清理完成（保留 .temp 目录结构）');
    } catch (error) {
      console.warn('清理 lint 临时文件失败:', error);
      // 不抛出错误，避免影响主要功能
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    try {
      console.log('🔍 检查 aily-builder 可用性...');
      
      // 检查 window['path'] 是否存在
      if (!window['path']) {
        console.warn('❌ window.path 不存在');
        return false;
      }
      
      // 检查 getAilyBuilderPath 方法
      if (typeof window['path'].getAilyBuilderPath !== 'function') {
        console.warn('❌ window.path.getAilyBuilderPath 方法不存在');
        return false;
      }
      
      const ailyBuilderPath = window['path'].getAilyBuilderPath();
      console.log('- aily-builder 路径:', ailyBuilderPath);
      
      if (!ailyBuilderPath) {
        console.warn('❌ aily-builder 路径为空');
        return false;
      }
      
      // 检查 isExists 方法
      if (typeof window['path'].isExists !== 'function') {
        console.warn('❌ window.path.isExists 方法不存在');
        return false;
      }
      
      const indexJsExists = window['path'].isExists(ailyBuilderPath + '/index.js');
      console.log('- index.js 存在:', indexJsExists);
      
      return indexJsExists;
    } catch (error) {
      console.error('检查 aily-builder 可用性失败:', error);
      return false;
    }
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    available: boolean;
    inProgress: boolean;
    version: string;
  } {
    return {
      available: this.isAvailable(),
      inProgress: this.lintInProgress,
      version: 'aily-builder-lint-simple'
    };
  }
}