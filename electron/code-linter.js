const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

/**
 * 代码检查器 - Electron 主进程实现
 */
class CodeLinterElectron {
  constructor() {
    this.tempFileCounter = 0;
  }

  /**
   * 创建临时文件
   */
  async createTempFile(content, extension) {
    const tempDir = os.tmpdir();
    const fileName = `aily_lint_${Date.now()}_${++this.tempFileCounter}${extension}`;
    const filePath = path.join(tempDir, fileName);
    
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * 删除临时文件
   */
  async deleteTempFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('Failed to delete temp file:', filePath, error.message);
    }
  }

  /**
   * 执行命令行工具
   */
  async executeCommand(command, args, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      // 设置超时
      const timer = setTimeout(() => {
        isTimedOut = true;
        process.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      // 收集输出
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 处理进程结束
      process.on('close', (exitCode) => {
        clearTimeout(timer);
        if (!isTimedOut) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode || 0
          });
        }
      });

      // 处理错误
      process.on('error', (error) => {
        clearTimeout(timer);
        if (!isTimedOut) {
          reject(new Error(`Failed to execute command: ${error.message}`));
        }
      });
    });
  }

  /**
   * 检查工具是否可用
   */
  async checkToolAvailability(tool) {
    try {
      const result = await this.executeCommand(tool, ['--version'], 1000);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      tmpdir: os.tmpdir(),
      version: process.version
    };
  }

  /**
   * 查找 Arduino 安装路径
   */
  async findArduinoPath() {
    const possiblePaths = {
      win32: [
        'C:\\Program Files\\Arduino',
        'C:\\Program Files (x86)\\Arduino',
        path.join(os.homedir(), 'AppData', 'Local', 'Arduino15'),
        path.join(os.homedir(), 'Documents', 'ArduinoData'),
        'C:\\tools\\arduino',
        'D:\\arduino'
      ],
      darwin: [
        '/Applications/Arduino.app/Contents/Java',
        path.join(os.homedir(), 'Library', 'Arduino15'),
        '/usr/local/arduino',
        path.join(os.homedir(), 'Applications', 'Arduino.app', 'Contents', 'Java')
      ],
      linux: [
        '/usr/share/arduino',
        '/opt/arduino',
        path.join(os.homedir(), '.arduino15'),
        '/snap/arduino/current',
        '/usr/local/arduino'
      ]
    };

    const platform = os.platform();
    const paths = possiblePaths[platform] || possiblePaths.linux;

    for (const arduinoPath of paths) {
      try {
        await fs.access(arduinoPath);
        return arduinoPath;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * 根据开发板类型构建包含路径
   */
  async getBoardSpecificIncludes(board = 'esp32', customCorePath = null, thirdPartyLibs = [], projectPath = null) {
    const includes = [];
    
    // 优先检查是否为aily-project项目
    if (projectPath) {
      try {
        const ailyConfig = await this.loadAilyProjectConfig(projectPath);
        if (ailyConfig.isAilyProject) {
          console.log('检测到aily-project项目，使用项目特定配置');
          includes.push(...ailyConfig.coreIncludes);
          includes.push(...ailyConfig.thirdPartyIncludes);
          return includes.filter(path => this.pathExists(path));
        }
      } catch (error) {
        console.warn('加载aily-project配置失败，回退到标准配置:', error.message);
      }
    }
    
    // 如果提供了自定义核心库路径，直接使用
    if (customCorePath) {
      try {
        await fs.access(customCorePath);
        includes.push(customCorePath);
        console.log('使用自定义核心库路径:', customCorePath);
      } catch (error) {
        console.warn('自定义核心库路径无效:', customCorePath);
      }
    } else {
      // 自动检测Arduino路径
      const arduinoPath = await this.findArduinoPath();
      if (arduinoPath) {
        const boardIncludes = await this.getDefaultBoardIncludes(arduinoPath, board);
        includes.push(...boardIncludes);
      }
    }

    // 添加第三方库路径
    if (thirdPartyLibs && thirdPartyLibs.length > 0) {
      for (const libPath of thirdPartyLibs) {
        try {
          await fs.access(libPath);
          includes.push(libPath);
          console.log('添加第三方库路径:', libPath);
        } catch (error) {
          console.warn('第三方库路径无效:', libPath);
        }
      }
    }

    return includes;
  }

  /**
   * 加载aily-project项目配置
   * @param {string} projectPath 项目路径
   * @returns {Promise<object>} 项目配置信息
   */
  async loadAilyProjectConfig(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      // 检查package.json是否存在
      if (!this.pathExists(packageJsonPath)) {
        console.log(`Package.json 不存在: ${packageJsonPath}`);
        return { isAilyProject: false };
      }

      const packageData = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      console.log('成功读取package.json');
      
      // 检查是否为aily-project项目
      const dependencies = packageData.dependencies || {};
      const boardDeps = Object.keys(dependencies).filter(dep => 
        dep.startsWith('@aily-project/board-')
      );

      console.log('找到开发板依赖:', boardDeps);

      if (boardDeps.length === 0) {
        console.log('未找到aily-project开发板依赖');
        return { isAilyProject: false };
      }

      // 解析开发板和版本信息
      const boardConfig = this.parseAilyBoardConfig(boardDeps, dependencies);
      console.log('解析的开发板配置:', boardConfig);
      
      // 构建SDK路径
      const sdkPath = this.getAilySdkPath();
      console.log('SDK基础路径:', sdkPath);
      
      const coreIncludes = await this.buildAilyCoreIncludes(boardConfig, sdkPath);
      
      // 检测第三方库路径
      const thirdPartyIncludes = await this.buildAilyThirdPartyIncludes(projectPath);

      // 解析编译器配置
      let compilerConfig = null;
      if (boardConfig.length > 0) {
        compilerConfig = await this.parseCompilerConfig(projectPath, boardConfig[0].boardType);
        console.log('编译器配置:', compilerConfig);
      }

      return {
        isAilyProject: true,
        boardConfig,
        coreIncludes,
        thirdPartyIncludes,
        compilerConfig,
        projectPath
      };

    } catch (error) {
      console.error('加载aily-project配置失败:', error);
      return { isAilyProject: false };
    }
  }

  /**
   * 解析aily-project开发板配置
   */
  parseAilyBoardConfig(boardDeps, dependencies) {
    const configs = [];
    
    for (const dep of boardDeps) {
      const version = dependencies[dep];
      // 例如: @aily-project/board-esp32 -> esp32
      const boardType = dep.replace('@aily-project/board-', '');
      // 去掉版本前缀符号
      const cleanVersion = version.replace(/[\^~]/, '');
      
      configs.push({
        boardType,
        version: cleanVersion,
        sdkName: `${boardType}_${cleanVersion}` // esp32_3.3.1
      });
    }
    
    return configs;
  }

  /**
   * 解析开发板的编译器配置
   * @param {string} projectPath - 项目路径
   * @param {string} boardType - 开发板类型 (esp32, esp8266等)
   * @returns {Promise<Object|null>} 编译器配置信息
   */
  async parseCompilerConfig(projectPath, boardType) {
    try {
      // 读取开发板的package.json文件
      const boardPkgPath = path.join(projectPath, 'node_modules', '@aily-project', `board-${boardType}`, 'package.json');
      
      if (!this.pathExists(boardPkgPath)) {
        console.warn(`开发板配置文件不存在: ${boardPkgPath}`);
        return null;
      }

      const boardPkgContent = await fs.readFile(boardPkgPath, 'utf8');
      const boardPkg = JSON.parse(boardPkgContent);
      
      if (!boardPkg.boardDependencies) {
        console.warn(`开发板 ${boardType} 没有配置 boardDependencies`);
        return null;
      }

      // 查找编译器依赖
      const compilerDeps = {};
      for (const [dep, version] of Object.entries(boardPkg.boardDependencies)) {
        if (dep.includes('compiler-')) {
          compilerDeps[dep] = version;
        }
      }

      if (Object.keys(compilerDeps).length === 0) {
        console.warn(`开发板 ${boardType} 没有配置编译器依赖`);
        return null;
      }

      // 解析编译器路径
      const compilerConfigs = [];
      for (const [compilerDep, version] of Object.entries(compilerDeps)) {
        // 例如: @aily-project/compiler-esp-x32 -> esp-x32
        const compilerType = compilerDep.replace('@aily-project/compiler-', '');
        const cleanVersion = version.replace(/[\^~]/, '');
        
        // 构建编译器路径
        const userHome = os.homedir();
        const compilerPath = path.join(userHome, 'AppData', 'Local', 'aily-project', 'compiler', `${compilerType}@${cleanVersion}`);
        
        // 根据开发板类型确定编译器可执行文件名
        let gccExecutable = null;
        if (boardType === 'esp32') {
          gccExecutable = 'xtensa-esp32-elf-gcc.exe';
        } else if (boardType === 'esp8266') {
          gccExecutable = 'xtensa-lx106-elf-gcc.exe';
        } else if (boardType.startsWith('esp32s')) {
          gccExecutable = `xtensa-${boardType}-elf-gcc.exe`;
        } else {
          // 通用gcc名称猜测
          gccExecutable = 'gcc.exe';
        }
        
        const gccPath = path.join(compilerPath, 'bin', gccExecutable);
        
        compilerConfigs.push({
          type: compilerType,
          version: cleanVersion,
          path: compilerPath,
          gccPath: gccPath,
          executable: gccExecutable,
          exists: this.pathExists(gccPath)
        });
      }

      return compilerConfigs.length > 0 ? compilerConfigs[0] : null; // 返回第一个找到的编译器
      
    } catch (error) {
      console.error(`解析编译器配置失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取aily-project SDK路径
   */
  getAilySdkPath() {
    const userHome = os.homedir();
    return path.join(userHome, 'AppData', 'Local', 'aily-project', 'sdk');
  }

  /**
   * 构建aily-project核心库包含路径
   */
  async buildAilyCoreIncludes(boardConfigs, sdkPath) {
    const includes = [];
    
    for (const config of boardConfigs) {
      const sdkDir = path.join(sdkPath, config.sdkName);
      
      if (!this.pathExists(sdkDir)) {
        console.warn(`SDK路径不存在: ${sdkDir}`);
        continue;
      }

      // 根据开发板类型添加对应的包含路径
      const coreIncludes = await this.getAilyBoardIncludes(sdkDir, config.boardType);
      includes.push(...coreIncludes);
      
      console.log(`添加${config.boardType} ${config.version}核心库路径: ${coreIncludes.length}个`);
    }
    
    return includes;
  }

  /**
   * 获取aily-project开发板特定包含路径
   */
  async getAilyBoardIncludes(sdkDir, boardType) {
    const includes = [];
    
    try {
      // 通用路径结构
      const commonPaths = [
        path.join(sdkDir, 'cores'),
        path.join(sdkDir, 'libraries'),
        path.join(sdkDir, 'variants'),
        path.join(sdkDir, 'tools', 'sdk', 'include')
      ];

      // 开发板特定路径
      const boardSpecificPaths = {
        'esp32': [
          path.join(sdkDir, 'tools', 'sdk', 'esp32', 'include'),
          path.join(sdkDir, 'cores', 'esp32'),
          path.join(sdkDir, 'libraries', 'WiFi', 'src'),
          path.join(sdkDir, 'libraries', 'BluetoothSerial', 'src')
        ],
        'esp8266': [
          path.join(sdkDir, 'tools', 'sdk', 'include'),
          path.join(sdkDir, 'cores', 'esp8266'),
          path.join(sdkDir, 'libraries', 'ESP8266WiFi', 'src')
        ],
        'avr': [
          path.join(sdkDir, 'cores', 'arduino'),
          path.join(sdkDir, 'variants', 'standard')
        ]
      };

      // 添加通用路径
      for (const includePath of commonPaths) {
        if (this.pathExists(includePath)) {
          includes.push(includePath);
        }
      }

      // 添加开发板特定路径
      const specificPaths = boardSpecificPaths[boardType] || [];
      for (const includePath of specificPaths) {
        if (this.pathExists(includePath)) {
          includes.push(includePath);
        }
      }

      return includes;

    } catch (error) {
      console.error(`获取${boardType}包含路径失败:`, error);
      return [];
    }
  }

  /**
   * 构建aily-project第三方库包含路径
   */
  async buildAilyThirdPartyIncludes(projectPath) {
    const includes = [];
    const tempDir = path.join(projectPath, '.temp', 'libraries');
    
    if (!this.pathExists(tempDir)) {
      console.log('项目.temp/libraries目录不存在');
      return includes;
    }

    try {
      const libraryDirs = await fs.readdir(tempDir);
      
      for (const libDir of libraryDirs) {
        const libPath = path.join(tempDir, libDir);
        const stat = await fs.stat(libPath);
        
        if (stat.isDirectory()) {
          includes.push(libPath);
          
          // 检查是否有src子目录
          const srcPath = path.join(libPath, 'src');
          if (this.pathExists(srcPath)) {
            includes.push(srcPath);
          }
        }
      }
      
      console.log(`找到${includes.length}个第三方库路径`);
      return includes;

    } catch (error) {
      console.error('扫描第三方库目录失败:', error);
      return [];
    }
  }

  /**
   * 检查路径是否存在（同步版本）
   */
  pathExists(filePath) {
    try {
      return fsSync.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * 获取默认开发板包含路径
   */
  async getDefaultBoardIncludes(arduinoPath, board) {
    const includes = [];
    
    const boardConfigs = {
      esp32: {
        cores: ['packages/esp32/hardware/esp32/*/cores/esp32'],
        libraries: [
          'packages/esp32/hardware/esp32/*/libraries',
          'packages/esp32/hardware/esp32/*/tools/sdk/esp32/include',
          'libraries'
        ],
        variants: ['packages/esp32/hardware/esp32/*/variants/esp32']
      },
      esp8266: {
        cores: ['packages/esp8266/hardware/esp8266/*/cores/esp8266'],
        libraries: [
          'packages/esp8266/hardware/esp8266/*/libraries',
          'packages/esp8266/hardware/esp8266/*/tools/sdk/include',
          'libraries'
        ],
        variants: ['packages/esp8266/hardware/esp8266/*/variants/nodemcu']
      },
      arduino_uno: {
        cores: ['hardware/arduino/avr/cores/arduino'],
        libraries: [
          'hardware/arduino/avr/libraries',
          'libraries'
        ],
        variants: ['hardware/arduino/avr/variants/standard']
      },
      arduino_nano: {
        cores: ['hardware/arduino/avr/cores/arduino'],
        libraries: [
          'hardware/arduino/avr/libraries',
          'libraries'
        ],
        variants: ['hardware/arduino/avr/variants/eightanaloginputs']
      },
      arduino_mega: {
        cores: ['hardware/arduino/avr/cores/arduino'],
        libraries: [
          'hardware/arduino/avr/libraries',
          'libraries'
        ],
        variants: ['hardware/arduino/avr/variants/mega']
      }
    };

    const config = boardConfigs[board] || boardConfigs.esp32;
    
    // 添加核心库路径
    for (const corePath of config.cores) {
      const expandedPaths = await this.expandGlob(path.join(arduinoPath, corePath));
      includes.push(...expandedPaths);
    }

    // 添加库路径
    for (const libPath of config.libraries) {
      const expandedPaths = await this.expandGlob(path.join(arduinoPath, libPath));
      includes.push(...expandedPaths);
    }

    // 添加变体路径
    for (const variantPath of config.variants) {
      const expandedPaths = await this.expandGlob(path.join(arduinoPath, variantPath));
      includes.push(...expandedPaths);
    }

    return includes;
  }

  /**
   * 根据开发板获取默认宏定义
   */
  getBoardDefines(board = 'esp32') {
    const boardDefines = {
      esp32: [
        'ARDUINO=10819',
        'ESP32',
        'ARDUINO_ARCH_ESP32',
        'ESP32_DEV',
        'ARDUINO_RUNNING_CORE=1',
        'ARDUINO_EVENT_RUNNING_CORE=1'
      ],
      esp8266: [
        'ARDUINO=10819',
        'ESP8266',
        'ARDUINO_ARCH_ESP8266',
        'ARDUINO_ESP8266_NODEMCU',
        'F_CPU=80000000L'
      ],
      arduino_uno: [
        'ARDUINO=10819',
        'ARDUINO_AVR_UNO',
        'ARDUINO_ARCH_AVR',
        'F_CPU=16000000L',
        '__AVR_ATmega328P__'
      ],
      arduino_nano: [
        'ARDUINO=10819',
        'ARDUINO_AVR_NANO',
        'ARDUINO_ARCH_AVR',
        'F_CPU=16000000L',
        '__AVR_ATmega328P__'
      ],
      arduino_mega: [
        'ARDUINO=10819',
        'ARDUINO_AVR_MEGA2560',
        'ARDUINO_ARCH_AVR',
        'F_CPU=16000000L',
        '__AVR_ATmega2560__'
      ]
    };

    return boardDefines[board] || boardDefines.esp32;
  }

  /**
   * 简单的 glob 展开
   */
  async expandGlob(pattern) {
    const parts = pattern.split('*');
    if (parts.length !== 2) return [pattern];

    const [prefix, suffix] = parts;
    const dir = path.dirname(prefix);
    
    try {
      const entries = await fs.readdir(dir);
      const matches = [];
      
      for (const entry of entries) {
        const fullPath = path.join(prefix, entry, suffix);
        try {
          await fs.access(fullPath);
          matches.push(fullPath);
        } catch {
          // 不匹配，跳过
        }
      }
      
      return matches;
    } catch {
      return [];
    }
  }

  /**
   * 获取Arduino包含路径 (向后兼容方法)
   * @param {string} board 开发板类型
   * @returns {Promise<string[]>} 包含路径列表
   */
  async getArduinoIncludes(board = 'esp32') {
    return await this.getDefaultBoardIncludes(board);
  }

  /**
   * 获取默认编译器路径
   */
  getCompilerPaths() {
    const platform = os.platform();
    
    const compilers = {
      win32: {
        gcc: 'gcc.exe',
        gpp: 'g++.exe',
        clang: 'clang.exe',
        clangpp: 'clang++.exe'
      },
      default: {
        gcc: 'gcc',
        gpp: 'g++',
        clang: 'clang',
        clangpp: 'clang++'
      }
    };

    return compilers[platform] || compilers.default;
  }

  /**
   * 代码检查主方法
   * @param {string} code 要检查的代码
   * @param {object} options 检查选项
   * @returns {Promise<object>} 检查结果
   */
  async lintCode(code, options = {}) {
    const startTime = Date.now();
    
    try {
      // 默认选项
      const defaultOptions = {
        language: 'cpp',
        enableWarnings: true,
        strictMode: false,
        timeout: 5000
      };
      
      const lintOptions = { ...defaultOptions, ...options };
      
      let result;
      
      switch (lintOptions.language) {
        case 'cpp':
        case 'arduino':
          result = await this.lintCppCode(code, lintOptions);
          break;
        case 'javascript':
          result = await this.lintJavaScriptCode(code, lintOptions);
          break;
        default:
          throw new Error(`Unsupported language: ${lintOptions.language}`);
      }
      
      result.duration = Date.now() - startTime;
      return result;
      
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          line: 1,
          column: 1,
          message: `Linting failed: ${error.message}`,
          severity: 'error',
          source: 'linter-error'
        }],
        warnings: [],
        duration: Date.now() - startTime,
        language: options.language || 'unknown',
        toolUsed: 'error-fallback'
      };
    }
  }

  /**
   * C++/Arduino 代码检查
   */
  async lintCppCode(code, options) {
    const startTime = Date.now();
    const tempFile = await this.createTempFile(code, '.cpp');
    
    try {
      // 对于Arduino代码，使用快速语法检查方法
      if (options.language === 'arduino') {
        return await this.quickArduinoSyntaxCheck(code, options, startTime);
      }
      
      // 对于普通C++代码，使用传统方法
      const args = await this.buildCppLintArgs(tempFile, options);
      let compiler = 'g++';
      
      const result = await this.executeCommand(compiler, args, options.timeout || 5000);
      return this.parseCppOutput(result, options.language || 'cpp', startTime);
      
    } finally {
      await this.deleteTempFile(tempFile);
    }
  }

  /**
   * 快速Arduino语法检查
   * 使用预处理和简化检查，避免复杂的ESP-IDF依赖
   */
  async quickArduinoSyntaxCheck(code, options, startTime) {
    try {
      console.log('🚀 开始快速Arduino语法检查...');
      
      // 1. 预处理代码 - 移除有问题的 include，添加基本声明
      const preprocessedCode = this.preprocessArduinoCode(code);
      
      // 2. 创建临时文件
      const tempFile = await this.createTempFile(preprocessedCode, '.cpp');
      
      try {
        // 3. 构建简单的编译参数
        const args = this.buildQuickSyntaxArgs(tempFile, options);
        
        // 4. 确定编译器（优先检测可用的编译器）
        let compiler = await this.findAvailableCompiler(options);
        
        if (!compiler) {
          console.warn('⚠️ 未找到可用的C++编译器');
          return {
            isValid: false,
            errors: [{
              line: 1,
              column: 1,
              message: '未找到可用的C++编译器。请安装 MinGW-w64、Visual Studio Build Tools 或配置 aily-project 编译器。',
              severity: 'error',
              source: 'compiler-detection'
            }],
            warnings: [],
            duration: Date.now() - startTime,
            language: options.language || 'arduino',
            toolUsed: 'compiler-detection'
          };
        }
        
        console.log(`使用编译器: ${compiler}`);
        
        // 5. 执行语法检查
        let result;
        if (compiler.endsWith('.bat')) {
          // 对于批处理文件，使用cmd来执行
          result = await this.executeCommand('cmd', ['/c', compiler, ...args], options.timeout || 3000);
        } else {
          // 对于普通可执行文件，直接执行
          result = await this.executeCommand(compiler, args, options.timeout || 3000);
        }
        
        console.log('✅ 语法检查完成:', {
          exitCode: result.exitCode,
          hasErrors: result.stderr.length > 0
        });
        
        // 6. 解析结果
        return this.parseCppOutput(result, options.language || 'arduino', startTime);
        
      } finally {
        await this.deleteTempFile(tempFile);
      }
      
    } catch (error) {
      console.error('❌ 快速语法检查失败:', error);
      return {
        isValid: false,
        errors: [{
          line: 1,
          column: 1,
          message: `Syntax check failed: ${error.message}`,
          severity: 'error',
          source: 'quick-check'
        }],
        warnings: [],
        duration: Date.now() - startTime,
        language: options.language || 'arduino',
        toolUsed: 'quick-check'
      };
    }
  }

  /**
   * 获取内置编译器路径
   */
  getBuiltinCompilerPath() {
    const toolsDir = path.join(__dirname, '..', 'tools', 'mingw-w64', 'bin');
    return {
      gcc: path.join(toolsDir, 'gcc.exe.bat'),
      gpp: path.join(toolsDir, 'g++.exe.bat')
    };
  }

  /**
   * 检查内置编译器是否可用
   */
  async checkBuiltinCompiler() {
    const compilerPaths = this.getBuiltinCompilerPath();
    
    try {
      // 先检查文件是否存在
      await fs.access(compilerPaths.gcc);
      
      // 然后测试是否能执行 (使用cmd调用批处理文件)
      const result = await this.executeCommand('cmd', ['/c', compilerPaths.gcc, '--version'], 3000);
      
      if (result.exitCode === 0) {
        console.log('✅ 内置编译器可用:', compilerPaths.gcc);
        return compilerPaths.gcc;
      } else {
        console.log('❌ 内置编译器测试失败:', result.stderr);
        return null;
      }
    } catch (error) {
      console.log('❌ 内置编译器不可用:', error.message);
      return null;
    }
  }

  /**
   * 查找可用的编译器
   */
  async findAvailableCompiler(options) {
    // 1. 首先尝试内置编译器
    try {
      const builtinCompiler = await this.checkBuiltinCompiler();
      if (builtinCompiler) {
        return builtinCompiler;
      }
    } catch (error) {
      console.warn('内置编译器检测失败:', error.message);
    }
    
    // 2. 尝试 aily-project 编译器
    if (options.projectPath) {
      try {
        const projectConfig = await this.loadAilyProjectConfig(options.projectPath);
        if (projectConfig.compilerConfig && projectConfig.compilerConfig.exists) {
          const gccPath = projectConfig.compilerConfig.gccPath;
          console.log(`检测到 aily-project 编译器: ${gccPath}`);
          
          // 验证编译器是否真的可用
          try {
            await this.executeCommand(gccPath, ['--version'], 1000);
            return gccPath;
          } catch (error) {
            console.warn('aily-project 编译器验证失败:', error.message);
          }
        }
      } catch (error) {
        console.warn('获取项目编译器失败:', error.message);
      }
    }
    
    // 3. 尝试常见的系统编译器
    const compilers = ['g++', 'gcc', 'clang++', 'clang'];
    
    for (const compiler of compilers) {
      try {
        await this.executeCommand(compiler, ['--version'], 1000);
        console.log(`找到系统编译器: ${compiler}`);
        return compiler;
      } catch (error) {
        // 继续尝试下一个编译器
      }
    }
    
    // 3. 尝试 Visual Studio 编译器 (Windows)
    if (process.platform === 'win32') {
      const vsCompilers = [
        'cl.exe',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\cl.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\cl.exe'
      ];
      
      for (const compiler of vsCompilers) {
        try {
          await this.executeCommand(compiler, [], 1000);
          console.log(`找到 Visual Studio 编译器: ${compiler}`);
          return compiler;
        } catch (error) {
          // 继续尝试下一个编译器
        }
      }
    }
    
    return null;
  }

  /**
   * 预处理Arduino代码
   * 移除复杂的include，添加基本的Arduino声明
   */
  preprocessArduinoCode(code) {
    // 移除有问题的 #include 行
    let processedCode = code
      .replace(/#include\s*<Arduino\.h>/g, '// Arduino.h replaced for quick syntax check')
      .replace(/#include\s*<WiFi\.h>/g, '// WiFi.h replaced for quick syntax check')
      .replace(/#include\s*<([^>]+)\.h>/g, '// $1.h replaced for quick syntax check');
    
    // 在代码前添加基本的Arduino环境声明
    const basicDeclarations = `
// ===============================================
// 基本Arduino环境声明 (用于快速语法检查)
// ===============================================

// 基本数据类型
typedef unsigned char uint8_t;
typedef unsigned short uint16_t;
typedef unsigned int uint32_t;
typedef unsigned long long uint64_t;
typedef uint8_t byte;

// Arduino常量
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

// 基本Arduino函数
extern "C" {
  void pinMode(uint8_t pin, uint8_t mode);
  void digitalWrite(uint8_t pin, uint8_t val);
  int digitalRead(uint8_t pin);
  void delay(unsigned long ms);
  void delayMicroseconds(unsigned int us);
  unsigned long millis(void);
  unsigned long micros(void);
  int analogRead(uint8_t pin);
  void analogWrite(uint8_t pin, int val);
}

// String类简化声明
class String {
public:
  String(const char* str = "");
  String(int value);
  String(float value);
  const char* c_str() const;
  int length() const;
};

// Serial类简化声明
class HardwareSerial {
public:
  void begin(unsigned long baud);
  void print(const char* str);
  void print(int value);
  void print(float value);
  void println(const char* str);
  void println(int value);
  void println(float value);
  void println();
  int available();
  int read();
};
extern HardwareSerial Serial;

// 常用传感器类的简化声明
class DHT {
public:
  DHT(uint8_t pin, uint8_t type);
  void begin();
  float readTemperature();
  float readHumidity();
};

// 常用库类的简化声明
template<typename T>
class BlinkerNumber {
public:
  BlinkerNumber(const char* name);
  void print(T value);
};

// 常用WiFi类的简化声明
class WiFiClass {
public:
  void begin(const char* ssid, const char* password);
  int status();
};
extern WiFiClass WiFi;

// ===============================================
// 用户代码开始
// ===============================================

${processedCode}
    `;
    
    return basicDeclarations;
  }

  /**
   * 构建快速语法检查参数
   */
  buildQuickSyntaxArgs(tempFile, options) {
    const args = [
      '-fsyntax-only',   // 只检查语法，不编译
      '-xc++',           // 强制使用C++模式
      '-std=c++11',      // Arduino兼容的C++标准
      '-w'               // 禁用大部分警告，专注于错误
    ];
    
    // 添加基本的Arduino宏定义
    args.push('-DARDUINO=10819');
    args.push('-DESP32');
    
    // 如果启用警告，添加关键的警告检查
    if (options.enableWarnings) {
      args.push('-Wunused-variable');   // 检测未使用变量
      args.push('-Wuninitialized');     // 检测未初始化变量
      args.push('-Wimplicit-function-declaration'); // 检测未声明函数
    }
    
    args.push(tempFile);
    return args;
  }

  /**
   * JavaScript 代码检查
   */
  async lintJavaScriptCode(code, options) {
    const tempFile = await this.createTempFile(code, '.js');
    
    try {
      const args = ['-c', tempFile];
      const result = await this.executeCommand('node', args, options.timeout || 3000);
      
      return this.parseJavaScriptOutput(result, 'javascript');
    } finally {
      await this.deleteTempFile(tempFile);
    }
  }

  /**
   * 构建 C++ 编译器参数
   */
  async buildCppLintArgs(tempFile, options) {
    const args = ['-fsyntax-only']; // 只检查语法，不编译

    // 添加警告标志
    if (options.enableWarnings !== false) {
      args.push('-Wall', '-Wextra');
      if (options.strictMode) {
        args.push('-Wpedantic', '-Werror');
      }
    }

    // C++ 标准
    args.push(`-std=${options.std || 'c++17'}`);

    // Arduino 特定配置
    if (options.language === 'arduino') {
      const board = options.board || 'esp32';
      
      // 获取开发板特定的宏定义
      try {
        const boardDefines = this.getBoardDefines(board);
        boardDefines.forEach(define => {
          args.push(`-D${define}`);
        });
      } catch (error) {
        console.warn('Failed to get board defines:', error);
        // 回退到默认ESP32定义
        args.push(
          '-DARDUINO=10819',
          '-DESP32',
          '-DARDUINO_ARCH_ESP32'
        );
      }

      // 获取包含路径
      if (options.autoDetectPaths !== false) {
        try {
          let includePaths = [];
          
          if (options.projectPath) {
            // 检查是否为aily-project项目
            const projectConfig = await this.loadAilyProjectConfig(options.projectPath);
            if (projectConfig.isAilyProject) {
              console.log('检测到aily-project项目，使用项目特定配置');
              includePaths = [
                ...(projectConfig.coreIncludes || []),
                ...(projectConfig.thirdPartyIncludes || [])
              ];
            }
          }
          
          if (includePaths.length === 0) {
            // 使用默认路径
            includePaths = await this.getBoardSpecificIncludes(
              board,
              options.coreLibraryPath,
              options.thirdPartyLibraries || [],
              options.projectPath
            );
          }
          
          // 添加包含路径参数
          includePaths.forEach(includePath => {
            args.push(`-I${includePath}`);
          });
          
          console.log(`添加了 ${includePaths.length} 个包含路径`);
        } catch (error) {
          console.warn('Failed to get include paths:', error);
        }
      }
    }

    // 自定义包含路径
    if (options.includes && Array.isArray(options.includes)) {
      options.includes.forEach(include => {
        args.push(`-I${include}`);
      });
    }

    // 自定义宏定义
    if (options.defines && Array.isArray(options.defines)) {
      options.defines.forEach(define => {
        args.push(`-D${define}`);
      });
    }

    args.push(tempFile);
    return args;
  }

  /**
   * 解析 C++ 编译器输出
   */
  parseCppOutput(result, language, startTime = Date.now()) {
    const errors = [];
    const warnings = [];
    
    // 检查是否是命令不存在的错误
    if (result.stderr && result.stderr.includes('不是内部或外部命令')) {
      errors.push({
        line: 1,
        column: 1,
        message: '编译器不可用：系统中未找到C++编译器。请安装 MinGW-w64、Visual Studio Build Tools 或配置 aily-project 编译器环境。',
        severity: 'error',
        source: 'compiler-missing'
      });
      
      return {
        isValid: false,
        errors,
        warnings: [],
        duration: Date.now() - startTime,
        language,
        toolUsed: 'compiler-missing'
      };
    }
    
    // 检查是否有其他系统级错误
    if (result.stderr && (
      result.stderr.includes('command not found') ||
      result.stderr.includes('not recognized') ||
      result.stderr.includes('No such file or directory')
    )) {
      errors.push({
        line: 1,
        column: 1,
        message: `编译器执行失败: ${result.stderr.trim()}`,
        severity: 'error',
        source: 'compiler-error'
      });
      
      return {
        isValid: false,
        errors,
        warnings: [],
        duration: Date.now() - startTime,
        language,
        toolUsed: 'compiler-error'
      };
    }
    
    if (result.stderr) {
      const lines = result.stderr.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          const parsed = this.parseCppErrorLine(line);
          if (parsed) {
            if (parsed.severity === 'error') {
              errors.push(parsed);
            } else if (parsed.severity === 'warning') {
              warnings.push(parsed);
            }
          }
        }
      }
    }
    
    return {
      isValid: result.exitCode === 0 && errors.length === 0,
      errors,
      warnings,
      duration: Date.now() - startTime,
      language,
      toolUsed: 'gcc'
    };
  }

  /**
   * 解析 C++ 错误行
   */
  parseCppErrorLine(line) {
    // 匹配格式: file:line:column: severity: message
    // 支持 error, warning, note, fatal error 等
    const regex = /^(.+):(\d+):(\d+):\s+(error|warning|note|fatal error):\s+(.+)$/;
    const match = line.match(regex);
    
    if (match) {
      const severity = match[4];
      return {
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        message: match[5].trim(),
        severity: severity.includes('error') ? 'error' : severity === 'warning' ? 'warning' : 'info',
        source: 'gcc'
      };
    }
    
    return null;
  }

  /**
   * 解析 JavaScript 输出
   */
  parseJavaScriptOutput(result, language) {
    const errors = [];
    
    if (result.exitCode !== 0 && result.stderr) {
      // Node.js 语法错误解析
      const lines = result.stderr.split('\n');
      for (const line of lines) {
        if (line.includes('SyntaxError')) {
          errors.push({
            line: 1,
            column: 1,
            message: line.trim(),
            severity: 'error',
            source: 'node'
          });
        }
      }
    }
    
    return {
      isValid: result.exitCode === 0,
      errors,
      warnings: [],
      language,
      toolUsed: 'node'
    };
  }
}

// 创建实例并导出方法
const codeLinterInstance = new CodeLinterElectron();

module.exports = {
  CodeLinterElectron,
  
  // 导出实例方法以便直接调用
  lintCode: (code, options) => codeLinterInstance.lintCode(code, options),
  quickArduinoSyntaxCheck: (code, options, startTime) => codeLinterInstance.quickArduinoSyntaxCheck(code, options, startTime),
  getBoardDefines: (board) => codeLinterInstance.getBoardDefines(board),
  getDefaultBoardIncludes: (board) => codeLinterInstance.getDefaultBoardIncludes(board),
  getBoardSpecificIncludes: (board, customCorePath, thirdPartyLibs, projectPath) => 
    codeLinterInstance.getBoardSpecificIncludes(board, customCorePath, thirdPartyLibs, projectPath),
  loadAilyProjectConfig: (projectPath) => codeLinterInstance.loadAilyProjectConfig(projectPath),
  getArduinoIncludes: (board) => codeLinterInstance.getArduinoIncludes(board),
  createTempFile: (content, extension) => codeLinterInstance.createTempFile(content, extension),
  deleteTempFile: (filePath) => codeLinterInstance.deleteTempFile(filePath),
  executeCommand: (command, args, timeout) => codeLinterInstance.executeCommand(command, args, timeout),
  checkToolAvailability: (tool) => codeLinterInstance.checkToolAvailability(tool),
  getSystemInfo: () => codeLinterInstance.getSystemInfo(),
  findArduinoPath: () => codeLinterInstance.findArduinoPath(),
  getCompilerPaths: () => codeLinterInstance.getCompilerPaths()
};