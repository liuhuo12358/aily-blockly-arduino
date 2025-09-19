import { Injectable } from '@angular/core';
import { CmdOutput, CmdService } from '../../../services/cmd.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NoticeService } from '../../../services/notice.service';
import { ProjectService } from '../../../services/project.service';
import { LogService } from '../../../services/log.service';
import { NpmService } from '../../../services/npm.service';
import { ConfigService } from '../../../services/config.service';
import { ActionState } from '../../../services/ui.service';
import { ActionService } from '../../../services/action.service';
import { arduinoGenerator } from '../components/blockly/generators/arduino/arduino';

import { BlocklyService as BlocklyService } from './blockly.service';
import { _ProjectService } from './project.service';

import { getDefaultBuildPath } from '../../../utils/builder.utils';

// 库缓存信息接口
interface LibraryCacheInfo {
  timestamp: number;
  hasHeaderFiles: boolean;
  directories: string[];
  targetNames: string[];
}

// 库处理结果接口
interface LibraryProcessResult {
  targetNames: string[];
  success: boolean;
  error?: string;
}

// 复制操作信息接口
interface CopyOperation {
  source: string;
  target: string;
  type: 'library' | 'directory';
}

@Injectable()
export class _BuilderService {

  constructor(
    private cmdService: CmdService,
    private message: NzMessageService,
    private noticeService: NoticeService,
    private logService: LogService,
    private npmService: NpmService,
    private configService: ConfigService,
    private actionService: ActionService,
    private projectService: ProjectService,
    private _projectService: _ProjectService,
    private blocklyService: BlocklyService,
  ) { }

  private buildInProgress = false;
  private streamId: string | null = null;
  private buildCompleted = false;
  private isErrored = false; // 标识是否为错误状态
  private buildStartTime: number = 0; // 编译开始时间

  // 库缓存机制
  private libraryCache = new Map<string, LibraryCacheInfo>();

  currentProjectPath = "";
  lastCode = "";
  passed = false;
  cancelled = false;
  boardType = "";
  sdkPath = "";
  toolsPath = "";
  compilerPath = "";
  boardJson: any = null;
  buildPath = "";
  
  private initialized = false; // 防止重复初始化

  init() {
    if (this.initialized) {
      console.warn('_BuilderService 已经初始化过了，跳过重复初始化');
      return;
    }
    
    this.initialized = true;
    this.actionService.listen('compile-begin', (action) => {
      console.log('>>>>> 收到编译请求: ', action);
      this.build().then(result => {
        console.log("build success: ", result);
      }).catch(msg => {
        if (msg?.state === 'warn') {
          console.log("build warn: ", msg);
        }
      });
    }, 'builder-compile-begin');
    this.actionService.listen('compile-cancel', (action) => {
      this.cancel();
    }, 'builder-compile-cancel');
  }

  destroy() {
    this.actionService.unlisten('builder-compile-begin');
    this.actionService.unlisten('builder-compile-cancel');
    this.initialized = false; // 重置初始化状态
    // 清理库缓存
    this.libraryCache.clear();
  }

  // 添加这个错误处理方法
  private handleCompileError(errorMessage: string) {
    console.error("handle errror: ", errorMessage);
    // 计算编译耗时
    const buildEndTime = Date.now();
    const buildDuration = this.buildStartTime > 0 ? ((buildEndTime - this.buildStartTime) / 1000).toFixed(2) : '0.00';
    console.log(`编译错误，耗时: ${buildDuration} 秒`);

    this.noticeService.update({
      title: "编译失败",
      text: `${errorMessage} (耗时: ${buildDuration}s)`,
      detail: errorMessage,
      state: 'error',
      setTimeout: 600000
    });

    this.passed = false;
    this.isErrored = true;
    this.buildInProgress = false;
  }

  async build(): Promise<ActionState> {
    console.log(">>> 开始编译")
    return new Promise<ActionState>(async (resolve, reject) => {
      try {
        if (this.buildInProgress) {
          this.message.warning("编译正在进行中，请稍后再试");
          reject({ state: 'warn', text: '编译中，请稍后' });
          return;
        }

        if (this.npmService.isInstalling) {
          this.message.warning("相关依赖正在安装中，请稍后再试");
          reject({ state: 'warn', text: '依赖安装中，请稍后' });
          return;
        }

        this.noticeService.update({
          title: "编译准备中",
          text: "首次编译可能会等待较长时间",
          state: 'doing',
          progress: 0,
          setTimeout: 0,
          stop: () => {
            this.cancel();
          }
        });

        this.currentProjectPath = this.projectService.currentProjectPath;
        const tempPath = this.currentProjectPath + '/.temp';
        const sketchPath = tempPath + '/sketch';
        const sketchFilePath = sketchPath + '/sketch.ino';
        const librariesPath = tempPath + '/libraries';

        this.buildCompleted = false;
        this.buildInProgress = true;
        this.streamId = "";
        this.isErrored = false; // 重置错误状态
        this.cancelled = false; // 重置取消状态
        this.buildStartTime = Date.now(); // 记录编译开始时间

        // 创建临时文件夹
        if (!window['path'].isExists(tempPath)) {
          await this.cmdService.runAsync(`New-Item -Path "${tempPath}" -ItemType Directory -Force`);
        }
        if (!window['path'].isExists(sketchPath)) {
          await this.cmdService.runAsync(`New-Item -Path "${sketchPath}" -ItemType Directory -Force`);
        }
        if (!window['path'].isExists(librariesPath)) {
          await this.cmdService.runAsync(`New-Item -Path "${librariesPath}" -ItemType Directory -Force`);
        }

        // 生成sketch文件
        const code = arduinoGenerator.workspaceToCode(this.blocklyService.workspace);
        this.lastCode = code;
        await window['fs'].writeFileSync(sketchFilePath, code);

        // 加载项目package.json
        const packageJson = await this.projectService.getPackageJson();
        const dependencies = packageJson.dependencies || {};

        const libsPath = []
        Object.entries(dependencies).forEach(([key, version]) => {
          if (key.startsWith('@aily-project/lib-') && !key.startsWith('@aily-project/lib-core')) {
            libsPath.push(key)
          }
        });

        // 获取板子信息(board.json)
        const boardJson = await this.projectService.getBoardJson();

        if (!boardJson) {
          this.handleCompileError('未找到板子信息(board.json)');
          throw new Error('未找到板子信息(board.json)');
        }

        this.boardJson = boardJson;

        // 解压libraries到临时文件夹，使用并行处理优化性能
        console.log(`开始处理 ${libsPath.length} 个库文件`);
        const copiedLibraries = await this.processLibrariesParallel(libsPath, librariesPath);

        // 检查和清理libraries文件夹
        // 输出已复制的库文件夹名称
        console.log(`已复制的库文件夹: ${copiedLibraries.join(', ')}`);

        // 获取libraries文件夹中的所有文件夹
        let existingFolders: string[] = [];

        if (window['fs'].existsSync(librariesPath)) {
          const librariesItems = window['fs'].readDirSync(librariesPath);
          existingFolders = librariesItems
            .filter(item => window['fs'].isDirectory(`${librariesPath}/${item.name || item}`))
            .map(item => item.name || item);

          console.log(`libraries文件夹中现有文件夹: ${existingFolders.join(', ')}`);

          // 直接清理不在copiedLibraries列表中的文件夹
          if (existingFolders.length > 0) {
            console.log('开始清理未使用的库文件夹');

            for (const folder of existingFolders) {
              // 检查文件夹是否在已复制的列表中
              const shouldKeep = copiedLibraries.some(copiedLib => {
                return folder === copiedLib || folder.startsWith(copiedLib);
              });

              if (!shouldKeep) {
                const folderToDelete = `${librariesPath}/${folder}`;
                console.log(`删除未使用的库文件夹: ${folder}`);
                try {
                  await this.cmdService.runAsync(`Remove-Item -Path "${folderToDelete}" -Recurse -Force`);
                } catch (error) {
                  console.warn(`删除文件夹 ${folder} 失败:`, error);
                }
              }
            }
          }
        }

        // 获取编译器、sdk、tool的名称和版本
        let compiler = ""
        let sdk = ""

        const boardDependencies = (await this.projectService.getBoardPackageJson()).boardDependencies || {};

        Object.entries(boardDependencies).forEach(([key, version]) => {
          if (key.startsWith('@aily-project/compiler-')) {
            compiler = key.replace(/^@aily-project\/compiler-/, '') + '@' + version;
          } else if (key.startsWith('@aily-project/sdk-')) {
            sdk = key.replace(/^@aily-project\/sdk-/, '') + '_' + version;
          }
        });

        if (!compiler || !sdk) {
          this.handleCompileError('未找到编译器或SDK信息');
          throw new Error('未找到编译器或SDK信息');
        }

        // 组合编译器、sdk、tools的路径
        this.compilerPath = await window["env"].get('AILY_COMPILERS_PATH') + `/${compiler}`;
        this.sdkPath = await window["env"].get('AILY_SDK_PATH') + `/${sdk}`;
        this.toolsPath = await window["env"].get('AILY_TOOLS_PATH');

        // 获取使用的编译器
        // const compilerTool = boardJson.compilerTool || 'aily-builder';

        // 获取编译命令
        let compilerParam = boardJson.compilerParam;
        if (!compilerParam) {
          this.handleCompileError('未找到编译命令(compilerParam)');
          throw new Error('未找到编译命令(compilerParam)');
        }

        let compilerParamList = compilerParam.split(' ');

        // 找到 -b 或 --board 参数后面的 fqbn 值，并从参数列表中移除
        for (let i = 0; i < compilerParamList.length; i++) {
          if (compilerParamList[i] === '-b' || compilerParamList[i] === '--board') {
            // 下一个参数就是 fqbn 值
            if (i + 1 < compilerParamList.length) {
              let fqbn = compilerParamList[i + 1];
              // 如果 fqbn 以 aily: 开头，需要替换 sdk 部分
              // const parts = fqbn.split(':');
              // if (parts.length > 2) { // 确保至少有3部分 (aily:avr:mega)
              //   if (compilerTool !== 'aily-builder') {
              //     parts[0] = "aily"
              //     parts[1] = sdk;
              //     fqbn = parts.join(':');
              //   }
              // }
              this.boardType = fqbn;

              // 从参数列表中移除 -b/--board 和 fqbn 参数
              compilerParamList.splice(i, 2); // 移除当前位置的两个元素

              break;
            }
          }

          if (compilerParamList[i] === '-v' || compilerParamList[i] === '--verbose') {
            // 移除 -v 或 --verbose 参数
            compilerParamList.splice(i, 1);
            i--; // 调整索引以继续检查当前位置
          }
        }

        console.log("boardType: ", this.boardType);

        compilerParam = compilerParamList.join(' ');

        // 获取和解析项目编译参数
        let buildProperties = '';
        try {
          const projectConfig = await this.projectService.getProjectConfig();
          if (projectConfig) {
            const buildPropertyParams: string[] = [];

            // 遍历配置对象，解析编译参数
            Object.values(projectConfig).forEach((configSection: any) => {
              if (configSection && typeof configSection === 'object') {
                // 遍历每个配置段（如 build、upload 等）
                Object.entries(configSection).forEach(([sectionKey, sectionValue]: [string, any]) => {
                  // 排除upload等非编译相关的配置段
                  if (sectionKey == 'upload') return;
                  if (sectionValue && typeof sectionValue === 'object') {
                    // 遍历具体的配置项
                    Object.entries(sectionValue).forEach(([key, value]: [string, any]) => {
                      buildPropertyParams.push(`--build-property ${sectionKey}.${key}=${value}`);
                    });
                  }
                });
              }
            });

            buildProperties = buildPropertyParams.join(' ');
            if (buildProperties) {
              buildProperties = ' ' + buildProperties; // 在前面添加空格
            }
          }
        } catch (error) {
          console.warn('获取项目配置失败:', error);
        }

        // 将buildProperties添加到compilerParam中
        compilerParam += buildProperties;

        let compileCommandParts = [];

        // buildPath
        this.buildPath = await getDefaultBuildPath(sketchFilePath);

        compileCommandParts = [
          "node",
          `"${window['path'].getAilyBuilderPath()}/index.js"`,
          `${compilerParam}`,
          `"${sketchFilePath}"`,
          '--jobs', '4',
          '--board', `"${this.boardType}"`,
          '--libraries-path', `"${librariesPath}"`,
          '--sdk-path', `"${this.sdkPath}"`,
          '--tools-path', `"${this.toolsPath}"`
        ];

        // 检查复制compilerPath下的所有文件夹到toolsPath中
        await this.syncCompilerToolsToToolsPath();
        const compileCommand = compileCommandParts.join(' ');

        const title = `编译 ${boardJson.name}`;
        const completeTitle = `编译完成`;

        let lastProgress = 0;
        let lastBuildText = '';
        let bufferData = '';
        let completeLines = '';
        let lastStdErr = '';
        let isBuildText = false;
        let outputComplete = false;
        let flashInfo = '';
        let ramInfo = '';
        let lastLogLines: string[] = [];

        this.buildStartTime = Date.now(); // 记录编译开始时间

        this.cmdService.run(compileCommand, null, false).subscribe({
          next: (output: CmdOutput) => {
            console.log('编译命令输出:', output);
            this.streamId = output.streamId;

            if (!this.isErrored && output.type == 'stderr') {
              if (output.data) {
                lastStdErr = output.data.trim();
              }
            }

            if (output.data) {
              const data = output.data;
              if (data.includes('\r\n') || data.includes('\n') || data.includes('\r')) {
                // 分割成行，同时处理所有三种换行符情况
                const lines = (bufferData + data).split(/\r\n|\n|\r/);
                // 最后一个可能不完整的行保留为新的bufferData
                bufferData = lines.pop() || '';
                // 处理完整的行
                // completeLines = lines.join('\n');
                // this.logService.update({"detail": completeLines});

                lines.forEach((line: string) => {
                  // 处理每一行输出
                  let trimmedLine = line.trim();

                  if (!trimmedLine) return; // 如果行为空，则跳过处理

                  // const cleanLine = line.replace(/\[\d+(;\d+)*m/g, '');
                  // this.logService.update({ "detail": line });

                  // 检查是否有错误信息
                  if (/error:|error during build:|failed|fatal/i.test(trimmedLine)) {
                    console.error("检测到编译错误:", trimmedLine);
                    // 提取更有用的错误信息，避免过长
                    // const errorMatch = trimmedLine.match(/error:(.+?)($|(\s+at\s+))/i);
                    // const errorText = errorMatch ? errorMatch[1].trim() : trimmedLine;
                    // this.handleCompileError(errorText);
                    this.isErrored = true;
                    return;
                  }

                  if (output.type === 'stderr') {
                    return; // 如果是stderr输出，则不处理
                  }

                  // if (this.isErrored) {
                  //   // this.logService.update({ "detail": line, "state": "error" });
                  //   return;
                  // }

                  // 提取构建文本
                  if (trimmedLine.startsWith('BuildText:')) {
                    const lineContent = trimmedLine.replace('BuildText:', '').trim();
                    const buildText = lineContent.split(/[\n\r]/)[0];
                    lastBuildText = buildText;
                    isBuildText = true;
                  } else {
                    isBuildText = false;
                  }

                  // 提取Output file路径
                  // if (trimmedLine.includes('Output File:')) {
                  //   const outputFileMatch = trimmedLine.match(/Output File:\s*(.+)$/);
                  //   if (outputFileMatch) {
                  //     this.outputFilePath = outputFileMatch[1].trim();
                  //     console.log('提取到Output file路径:', this.outputFilePath);
                  //   }
                  // }

                  // 提取进度信息
                  const progressInfo = trimmedLine.trim();
                  let progressValue = 0;
                  let isProgress = false;

                  // Match patterns like [========================================          ] 80%
                  const barProgressMatch = progressInfo.match(/\[.*?\]\s*(\d+)%/);
                  // Match patterns like [99/101] for fraction-based progress
                  const fractionProgressMatch = progressInfo.match(/\[(\d+)\/(\d+)\]/);

                  if (barProgressMatch) {
                    try {
                      progressValue = parseInt(barProgressMatch[1], 10);
                    } catch (error) {
                      progressValue = 0;
                      console.warn('进度解析错误:', error);
                    } finally {
                      isProgress = true;
                    }
                  } else if (fractionProgressMatch) {
                    try {
                      const current = parseInt(fractionProgressMatch[1], 10);
                      const total = parseInt(fractionProgressMatch[2], 10);
                      progressValue = Math.round((current / total) * 100);
                    } catch (error) {
                      progressValue = 0;
                      console.warn('分数进度解析错误:', error);
                    } finally {
                      isProgress = true;
                    }
                  }

                  if (progressValue > lastProgress) {
                    // console.log("progress: ", lastProgress);
                    lastProgress = progressValue;
                    this.noticeService.update({
                      title: title,
                      text: lastBuildText,
                      state: 'doing',
                      progress: lastProgress,
                      setTimeout: 0,
                      stop: () => {
                        this.cancel();
                      }
                    });
                  }

                  // 进度为100%时标记完成
                  if (lastProgress === 100) {
                    this.buildCompleted = true;
                  }

                  if (!isProgress && !isBuildText) {
                    // 如果不是进度信息，则直接更新日志
                    // 判断是否包含:Global variables use 9 bytes (0%) of dynamic memory, leaving 2039 bytes for local variables. Maximum is 2048 bytes.
                    if (trimmedLine.includes('Global variables use')) {
                      outputComplete = true;
                      this.logService.update({ "detail": trimmedLine, "state": "done" });
                    } else {
                      if (!outputComplete) {
                        this.logService.update({ "detail": trimmedLine, "state": "doing" });
                      }
                    }

                    // 收集最后的几行日志用于提取固件信息
                    lastLogLines.push(trimmedLine);
                    if (lastLogLines.length > 30) {
                      lastLogLines.shift(); // 保持最后30行
                    }
                  }
                });
              } else {
                // 没有换行符，直接追加
                bufferData += data;
              }
            } else {
              bufferData += '';
            }
          },
          error: (error: any) => {
            console.error('编译过程中发生错误:', error);
            this.handleCompileError(error.message);
            reject({ state: 'error', text: error.message });
          },
          complete: () => {
            console.log('编译命令执行完成');
            if (this.isErrored) {
              console.error('编译过程中发生错误，编译未完成');
              // 计算编译耗时
              const buildEndTime = Date.now();
              const buildDuration = ((buildEndTime - this.buildStartTime) / 1000).toFixed(2);
              console.log(`编译失败，耗时: ${buildDuration} 秒`);

              this.noticeService.update({
                title: "编译失败",
                text: `编译失败 (耗时: ${buildDuration}s)`,
                detail: lastStdErr,
                state: 'error',
                setTimeout: 600000
              });
              // this.logService.update({ title: "编译失败", detail: lastStdErr, state: 'error' });
              this.buildInProgress = false;
              this.passed = false;
              // 终止Arduino CLI进程

              reject({ state: 'error', text: `编译失败 (耗时: ${buildDuration}s)` });
            } else if (this.buildCompleted) {
              console.log('编译命令执行完成');
              // 计算编译耗时
              const buildEndTime = Date.now();
              const buildDuration = ((buildEndTime - this.buildStartTime) / 1000).toFixed(2);
              console.log(`编译耗时: ${buildDuration} 秒`);

              // 提取flash和ram信息
              const displayText = this.extractFirmwareInfo(lastLogLines);
              const displayTextWithTime = `${displayText} (耗时: ${buildDuration}s)`;
              this.noticeService.update({ title: completeTitle, text: displayTextWithTime, state: 'done', setTimeout: 600000 });
              this.buildInProgress = false;
              this.passed = true;
              resolve({ state: 'done', text: `编译完成 (耗时: ${buildDuration}s)` });
            } else if (this.cancelled) {
              console.warn("编译中断")
              // 计算编译耗时
              const buildEndTime = Date.now();
              const buildDuration = ((buildEndTime - this.buildStartTime) / 1000).toFixed(2);
              console.log(`编译已取消，耗时: ${buildDuration} 秒`);

              this.noticeService.update({
                title: "编译已取消",
                text: `编译已取消 (耗时: ${buildDuration}s)`,
                state: 'warn',
                setTimeout: 55000
              });
              this.buildInProgress = false;
              this.passed = false;
              // 终止Arduino CLI进程

              reject({ state: 'warn', text: `编译已取消 (耗时: ${buildDuration}s)` });
            } else {
              console.warn('编译命令未完成，可能是由于超时或其他原因');
              // 计算编译耗时
              const buildEndTime = Date.now();
              const buildDuration = ((buildEndTime - this.buildStartTime) / 1000).toFixed(2);
              console.log(`编译未完成，耗时: ${buildDuration} 秒`);

              this.noticeService.update({
                title: "编译失败",
                text: `${lastStdErr.slice(0, 30) + "..." || '编译未完成'} (耗时: ${buildDuration}s)`,
                detail: lastStdErr,
                state: 'error',
                setTimeout: 600000
              });
              this.buildInProgress = false;
              this.passed = false;
              // 终止Arduino CLI进程

              reject({ state: 'warn', text: `编译未完成 (耗时: ${buildDuration}s)` });
            }
          }
        })
      } catch (error) {
        console.error('编译过程中发生错误:', error);
        this.handleCompileError(error.message);
        reject({ state: 'error', text: error.message });
      }
    });
  }

  /**
   * 从编译日志中提取固件信息
   * @param logLines 编译日志行数组
   * @returns 格式化的固件使用情况文本
   */
  private extractFirmwareInfo(logLines: string[]): string {
    // console.log("logLines: ", logLines);
    const logText = logLines.join(' ');
    // 提取flash信息：Sketch uses 2706878 bytes (86%) of program storage space. Maximum is 3145728 bytes.
    const flashMatch = logText.match(/Sketch uses (\d+) bytes \((\d+)%\) of program storage space\.\s*Maximum is (\d+) bytes/);
    // 提取ram信息：Global variables use 47628 bytes (14%) of dynamic memory, leaving 280052 bytes for local variables. Maximum is 327680 bytes.
    const ramMatch = logText.match(/Global variables use (\d+) bytes \((\d+)%\) of dynamic memory.*?Maximum is (\d+) bytes/);

    if (flashMatch && ramMatch) {
      const flashUsed = flashMatch[1];
      const flashPercent = flashMatch[2];
      const flashMax = flashMatch[3];

      const ramUsed = ramMatch[1];
      const ramPercent = ramMatch[2];
      const ramMax = ramMatch[3];

      return `Flash use ${flashPercent}%   Ram use ${ramPercent}%`;
    }

    return "编译完成";
  }

  /**
   * 检查库缓存是否有效
   * @param lib 库名称
   * @param sourcePath 源码路径
   * @returns 缓存是否有效
   */
  private isLibraryCacheValid(lib: string, sourcePath: string): boolean {
    const cached = this.libraryCache.get(lib);
    if (!cached) return false;
    
    try {
      if (!window['fs'].existsSync(sourcePath)) return false;
      const stat = window['fs'].statSync(sourcePath);
      return stat.mtime.getTime() <= cached.timestamp;
    } catch {
      return false;
    }
  }

  /**
   * 准备库源码路径，处理解压和嵌套src目录
   * @param lib 库名称
   * @returns 准备好的源码路径，失败返回null
   */
  private async prepareLibrarySource(lib: string): Promise<string | null> {
    let sourcePath = `${this.currentProjectPath}/node_modules/${lib}/src`;
    
    // 检查缓存
    if (this.isLibraryCacheValid(lib, sourcePath)) {
      console.log(`库 ${lib} 使用缓存信息`);
      return sourcePath;
    }
    
    // 如果没有src文件夹，尝试解压
    if (!window['path'].isExists(sourcePath)) {
      const sourceZipPath = `${this.currentProjectPath}/node_modules/${lib}/src.7z`;
      if (!window['path'].isExists(sourceZipPath)) {
        return null;
      }
      
      try {
        await this.cmdService.runAsync(`7za x "${sourceZipPath}" -o"${sourcePath}" -y`);
      } catch (error) {
        console.error(`解压库 ${lib} 失败:`, error);
        return null;
      }
    }

    // 处理嵌套src目录
    sourcePath = this.resolveNestedSrcPath(sourcePath);
    return sourcePath;
  }

  /**
   * 解析嵌套的src目录结构
   * @param sourcePath 原始源码路径
   * @returns 解析后的源码路径
   */
  private resolveNestedSrcPath(sourcePath: string): string {
    if (!window['fs'].existsSync(sourcePath)) {
      return sourcePath;
    }
    
    try {
      const srcContents = window['fs'].readDirSync(sourcePath);
      if (srcContents.length === 1) {
        const firstItem = srcContents[0];
        const itemName = typeof firstItem === 'object' && firstItem !== null ? firstItem.name : firstItem;

        if (itemName === 'src' && window['fs'].isDirectory(`${sourcePath}/${itemName}`)) {
          console.log(`检测到嵌套src目录，使用 ${sourcePath}/src 作为源路径`);
          return `${sourcePath}/src`;
        }
      }
    } catch (error) {
      console.warn(`解析嵌套src路径失败:`, error);
    }
    
    return sourcePath;
  }

  /**
   * 检查目录下是否包含头文件
   * @param sourcePath 源码路径
   * @returns 是否包含头文件
   */
  private async checkForHeaderFiles(sourcePath: string): Promise<boolean> {
    if (!window['fs'].existsSync(sourcePath)) {
      return false;
    }
    
    try {
      const files = window['fs'].readDirSync(sourcePath, { withFileTypes: true });
      return Array.isArray(files) && files.some(file => {
        if (typeof file === 'object' && file !== null && file.name) {
          return file.name.toString().endsWith('.h');
        }
        return typeof file === 'string' && file.endsWith('.h');
      });
    } catch (error) {
      console.warn(`检查头文件失败:`, error);
      return false;
    }
  }

  /**
   * 收集复制操作，用于批量执行
   * @param operations 复制操作数组
   * @returns 批量执行的Promise
   */
  private async executeBatchCopyOperations(operations: CopyOperation[]): Promise<void> {
    if (operations.length === 0) return;
    
    // 分组删除和复制操作
    const deleteCommands: string[] = [];
    const copyCommands: string[] = [];
    
    for (const op of operations) {
      // 如果目标已存在且是开发模式，添加删除命令
      if (window['path'].isExists(op.target) && (this.configService.data.devmode || false)) {
        deleteCommands.push(`Remove-Item -Path "${op.target}" -Recurse -Force`);
      }
      copyCommands.push(`Copy-Item -Path "${op.source}" -Destination "${op.target}" -Recurse -Force`);
    }
    
    try {
      // 先执行删除操作
      if (deleteCommands.length > 0) {
        const deleteScript = deleteCommands.join('; ');
        await this.cmdService.runAsync(deleteScript);
      }
      
      // 再执行复制操作
      if (copyCommands.length > 0) {
        const copyScript = copyCommands.join('; ');
        await this.cmdService.runAsync(copyScript);
      }
    } catch (error) {
      console.error('批量文件操作失败:', error);
      throw error;
    }
  }

  /**
   * 处理包含头文件的库
   * @param lib 库名称
   * @param sourcePath 源码路径
   * @param librariesPath 目标库路径
   * @returns 处理结果
   */
  private async processLibraryWithHeaders(lib: string, sourcePath: string, librariesPath: string): Promise<LibraryProcessResult> {
    try {
      console.log(`库 ${lib} 包含头文件`);
      const targetName = lib.split('@aily-project/')[1];
      const targetPath = `${librariesPath}/${targetName}`;

      let shouldCopy = true;
      if (window['path'].isExists(targetPath)) {
        if (this.configService.data.devmode || false) {
          await this.cmdService.runAsync(`Remove-Item -Path "${targetPath}" -Recurse -Force`);
        } else {
          console.log(`库 ${lib} 目标路径已存在，跳过复制但保留记录`);
          shouldCopy = false;
        }
      }

      if (shouldCopy) {
        await this.cmdService.runAsync(`Copy-Item -Path "${sourcePath}" -Destination "${targetPath}" -Recurse -Force`);
      }

      // 更新缓存
      this.libraryCache.set(lib, {
        timestamp: Date.now(),
        hasHeaderFiles: true,
        directories: [],
        targetNames: [targetName]
      });

      return {
        targetNames: [targetName],
        success: true
      };
    } catch (error) {
      console.error(`处理库 ${lib} 失败:`, error);
      return {
        targetNames: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 处理不包含头文件的库，逐个复制目录
   * @param lib 库名称
   * @param sourcePath 源码路径
   * @param librariesPath 目标库路径
   * @returns 处理结果
   */
  private async processLibraryDirectories(lib: string, sourcePath: string, librariesPath: string): Promise<LibraryProcessResult> {
    try {
      console.log(`库 ${lib} 不包含头文件，逐个复制目录`);
      const targetNames: string[] = [];
      const copyOperations: CopyOperation[] = [];

      if (!window['fs'].existsSync(sourcePath)) {
        return { targetNames: [], success: true };
      }

      const items = window['fs'].readDirSync(sourcePath);

      for (const item of items) {
        const itemName = typeof item === 'object' && item !== null ? item.name : item;
        const fullSourcePath = `${sourcePath}/${itemName}`;

        if (window['fs'].isDirectory(fullSourcePath)) {
          const targetPath = `${librariesPath}/${itemName}`;

          let shouldCopy = true;
          if (window['path'].isExists(targetPath)) {
            if (this.configService.data.devmode || false) {
              // 删除操作将在批量操作中处理
            } else {
              console.log(`目录 ${itemName} 已存在，跳过复制但保留记录`);
              shouldCopy = false;
            }
          }

          if (shouldCopy) {
            copyOperations.push({
              source: fullSourcePath,
              target: targetPath,
              type: 'directory'
            });
          }
          targetNames.push(itemName);
        }
      }

      // 批量执行复制操作
      await this.executeBatchCopyOperations(copyOperations);

      // 更新缓存
      this.libraryCache.set(lib, {
        timestamp: Date.now(),
        hasHeaderFiles: false,
        directories: targetNames,
        targetNames: targetNames
      });

      return {
        targetNames: targetNames,
        success: true
      };
    } catch (error) {
      console.error(`处理库目录 ${lib} 失败:`, error);
      return {
        targetNames: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 处理单个库
   * @param lib 库名称
   * @param librariesPath 目标库路径
   * @returns 处理结果
   */
  private async processLibrary(lib: string, librariesPath: string): Promise<LibraryProcessResult> {
    try {
      // 检查缓存
      const cachedInfo = this.libraryCache.get(lib);
      if (cachedInfo && this.isLibraryCacheValid(lib, `${this.currentProjectPath}/node_modules/${lib}/src`)) {
        console.log(`库 ${lib} 使用缓存结果`);
        return {
          targetNames: cachedInfo.targetNames,
          success: true
        };
      }

      // 准备源码路径
      const sourcePath = await this.prepareLibrarySource(lib);
      if (!sourcePath) {
        console.warn(`库 ${lib} 源码准备失败`);
        return { targetNames: [], success: true };
      }

      // 检查是否包含头文件
      const hasHeaderFiles = await this.checkForHeaderFiles(sourcePath);

      if (hasHeaderFiles) {
        return await this.processLibraryWithHeaders(lib, sourcePath, librariesPath);
      } else {
        return await this.processLibraryDirectories(lib, sourcePath, librariesPath);
      }
    } catch (error) {
      console.error(`处理库 ${lib} 失败:`, error);
      return {
        targetNames: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 并行处理所有库
   * @param libsPath 库列表
   * @param librariesPath 目标库路径
   * @returns 已复制的库名称列表
   */
  private async processLibrariesParallel(libsPath: string[], librariesPath: string): Promise<string[]> {
    console.log(`开始并行处理 ${libsPath.length} 个库`);
    
    try {
      // 并行处理所有库
      const libraryTasks = libsPath.map(lib => this.processLibrary(lib, librariesPath));
      const results = await Promise.all(libraryTasks);

      // 收集所有成功处理的库名称
      const copiedLibraries: string[] = [];
      const errors: string[] = [];

      results.forEach((result, index) => {
        if (result.success) {
          copiedLibraries.push(...result.targetNames);
        } else {
          errors.push(`库 ${libsPath[index]}: ${result.error}`);
        }
      });

      if (errors.length > 0) {
        console.warn('以下库处理失败:', errors);
      }

      console.log(`并行处理完成，成功处理 ${copiedLibraries.length} 个库目录`);
      return copiedLibraries;
    } catch (error) {
      console.error('并行处理库失败:', error);
      throw error;
    }
  }

  /**
   * 检查并复制compilerPath目录到toolsPath中
   * 确保toolsPath包含完整的编译器目录
   */
  private async syncCompilerToolsToToolsPath(): Promise<void> {
    try {
      // 检查compilerPath是否存在
      if (!window['path'].isExists(this.compilerPath)) {
        console.warn(`编译器路径不存在: ${this.compilerPath}`);
        return;
      }

      // 检查toolsPath是否存在，如果不存在则创建
      if (!window['path'].isExists(this.toolsPath)) {
        console.log(`创建工具路径: ${this.toolsPath}`);
        await this.cmdService.runAsync(`New-Item -Path "${this.toolsPath}" -ItemType Directory -Force`);
      }

      // 获取编译器目录名称（例如：从 /path/to/compiler@1.0.0 中提取 compiler@1.0.0）
      const compilerDirName = this.compilerPath.split(/[/\\]/).pop();
      if (!compilerDirName) {
        console.warn('无法获取编译器目录名称');
        return;
      }

      const targetCompilerPath = `${this.toolsPath}/${compilerDirName}`;

      console.log(`检查编译器目录是否存在: ${targetCompilerPath}`);

      // 检查目标路径是否已存在编译器目录
      if (window['path'].isExists(targetCompilerPath)) {
        console.log(`编译器目录已存在于工具路径中: ${compilerDirName}`);
        return;
      }

      console.log(`开始复制编译器目录: ${this.compilerPath} -> ${targetCompilerPath}`);

      // 复制整个编译器目录到工具路径
      try {
        await this.cmdService.runAsync(`Copy-Item -Path "${this.compilerPath}" -Destination "${this.toolsPath}" -Recurse -Force`);
        console.log(`成功复制编译器目录: ${compilerDirName}`);
      } catch (error) {
        console.error(`复制编译器目录失败:`, error);
        throw error;
      }

      console.log('编译器目录同步完成');
    } catch (error) {
      console.error('同步编译器目录失败:', error);
      throw error;
    }
  }

  /**
   * 取消当前编译过程
   */
  cancel() {
    this.cancelled = true;
    this.cmdService.kill(this.streamId || '');
  }

  // /**
  //  * 获取输出文件路径
  //  * @returns 编译生成的输出文件完整路径
  //  */
  // getOutputFilePath(): string {
  //   return this.outputFilePath;
  // }
}
