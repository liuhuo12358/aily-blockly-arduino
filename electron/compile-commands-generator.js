const path = require('path');
const fs = require('fs');

/**
 * 为Arduino项目生成compile_commands.json文件
 * 这将帮助clangd更好地理解项目结构和依赖关系
 */
class CompileCommandsGenerator {
  constructor(projectPaths, sdkPaths, librariesPaths) {
    // 确保所有参数都是数组
    this.projectPaths = Array.isArray(projectPaths) ? projectPaths : [projectPaths].filter(Boolean);
    this.sdkPaths = Array.isArray(sdkPaths) ? sdkPaths : [sdkPaths].filter(Boolean);
    this.librariesPaths = Array.isArray(librariesPaths) ? librariesPaths : [librariesPaths].filter(Boolean);
    
    console.log('CompileCommandsGenerator initialized with:');
    console.log('Project paths:', this.projectPaths);
    console.log('SDK paths:', this.sdkPaths);
    console.log('Libraries paths:', this.librariesPaths);
  }

  /**
   * 生成编译命令
   */
  generateCompileCommands() {
    const commands = [];
    
    // 遍历所有项目路径，获取源文件
    for (const projectPath of this.projectPaths) {
      if (!projectPath || !fs.existsSync(projectPath)) {
        console.warn(`Project path does not exist: ${projectPath}`);
        continue;
      }
      
      console.log(`Processing project path: ${projectPath}`);
      const sourceFiles = this.findSourceFiles(projectPath);
      console.log(`Found ${sourceFiles.length} source files in ${projectPath}`);
      
      for (const file of sourceFiles) {
        const command = this.generateCommandForFile(file, projectPath);
        if (command) {
          commands.push(command);
        }
      }
    }
    
    console.log(`Generated ${commands.length} compile commands total`);
    return commands;
  }

  /**
   * 查找项目中的源文件
   */
  findSourceFiles(dir) {
    const files = [];
    const extensions = ['.ino', '.cpp', '.c', '.h', '.hpp'];
    
    const traverse = (currentDir) => {
      try {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item.name);
          
          if (item.isDirectory()) {
            // 跳过隐藏目录和build目录
            if (!item.name.startsWith('.') && item.name !== 'build') {
              traverse(fullPath);
            }
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${currentDir}:`, error.message);
      }
    };
    
    traverse(dir);
    return files;
  }

  /**
   * 为单个文件生成编译命令
   */
  generateCommandForFile(filePath, projectPath) {
    const includes = this.getIncludePaths();
    const defines = this.getDefines();
    
    // 确定编译器
    const compiler = this.getCompiler(filePath);
    
    const command = {
      directory: projectPath, // 使用传入的项目路径
      file: filePath,
      command: this.buildCommandLine(compiler, filePath, includes, defines)
    };
    
    return command;
  }

  /**
   * 获取包含路径
   */
  getIncludePaths() {
    const includes = [];
    
    // 首先添加项目路径（最高优先级）
    includes.push(...this.projectPaths);
    
    // 只添加核心Arduino路径，减少不必要的内部头文件
    for (const sdkPath of this.sdkPaths) {
      if (!sdkPath || !fs.existsSync(sdkPath)) {
        console.warn(`SDK path does not exist: ${sdkPath}`);
        continue;
      }
      
      console.log(`Processing SDK path: ${sdkPath}`);
      
      // 只添加核心Arduino路径
      if (sdkPath.includes('cores')) {
        includes.push(sdkPath);
        
        // 查找variants路径
        const variantsPath = sdkPath.replace(/cores.*$/, 'variants/standard');
        if (fs.existsSync(variantsPath)) {
          includes.push(variantsPath);
        }
      } else {
        // 如果是SDK根目录，只添加必要的核心路径
        const essentialPaths = [
          path.join(sdkPath, 'cores', 'arduino'),
          path.join(sdkPath, 'variants', 'standard')
        ];
        
        for (const essentialPath of essentialPaths) {
          if (fs.existsSync(essentialPath)) {
            includes.push(essentialPath);
          }
        }
      }
    }
    
    // 有选择地添加用户库，避免添加所有系统库
    for (const librariesPath of this.librariesPaths) {
      if (!librariesPath || !fs.existsSync(librariesPath)) {
        console.warn(`Libraries path does not exist: ${librariesPath}`);
        continue;
      }
      
      console.log(`Processing libraries path: ${librariesPath}`);
      this.addSelectiveLibraryIncludes(librariesPath, includes);
    }
    
    // 不添加系统路径，减少内部函数暴露
    // const systemIncludes = this.getSystemIncludes();
    // includes.push(...systemIncludes);
    
    // 去重
    const uniqueIncludes = [...new Set(includes)];
    console.log(`Total include paths (filtered): ${uniqueIncludes.length}`);
    
    return uniqueIncludes;
  }

  /**
   * 有选择地添加库包含路径，避免包含太多内部库
   */
  addSelectiveLibraryIncludes(libPath, includes) {
    try {
      const libraries = fs.readdirSync(libPath, { withFileTypes: true });
      
      // 定义常用的Arduino库白名单
      const commonLibraries = [
        'Servo', 'SoftwareSerial', 'LiquidCrystal', 'SD', 'Ethernet', 'WiFi',
        'SPI', 'Wire', 'EEPROM', 'Stepper', 'WiFi101', 'WiFiNINA',
        'Adafruit_Sensor', 'DHT', 'OneWire', 'DallasTemperature',
        'NewPing', 'IRremote', 'FastLED', 'AccelStepper'
      ];
      
      for (const lib of libraries) {
        if (lib.isDirectory()) {
          const libDir = path.join(libPath, lib.name);
          
          // 只包含白名单中的库或者用户自定义库（不以内部前缀开头）
          const isCommonLib = commonLibraries.some(commonLib => 
            lib.name.toLowerCase().includes(commonLib.toLowerCase())
          );
          const isUserLib = !lib.name.startsWith('__') && 
                           !lib.name.startsWith('_') && 
                           !lib.name.includes('internal');
          
          if (isCommonLib || isUserLib) {
            includes.push(libDir);
            
            // 检查src子目录
            const srcDir = path.join(libDir, 'src');
            if (fs.existsSync(srcDir)) {
              includes.push(srcDir);
              
              // 只添加一级子目录，避免深层内部目录
              this.addSubDirectories(srcDir, includes, 1);
            }
            
            // 检查utility子目录
            const utilityDir = path.join(libDir, 'utility');
            if (fs.existsSync(utilityDir)) {
              includes.push(utilityDir);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read libraries directory ${libPath}:`, error.message);
    }
  }

  /**
   * 添加库包含路径
   */
  addLibraryIncludes(libPath, includes) {
    try {
      const libraries = fs.readdirSync(libPath, { withFileTypes: true });
      
      for (const lib of libraries) {
        if (lib.isDirectory()) {
          const libDir = path.join(libPath, lib.name);
          includes.push(libDir);
          
          // 检查src子目录
          const srcDir = path.join(libDir, 'src');
          if (fs.existsSync(srcDir)) {
            includes.push(srcDir);
            
            // 递归添加src下的子目录
            this.addSubDirectories(srcDir, includes);
          }
          
          // 检查utility子目录
          const utilityDir = path.join(libDir, 'utility');
          if (fs.existsSync(utilityDir)) {
            includes.push(utilityDir);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read libraries directory ${libPath}:`, error.message);
    }
  }

  /**
   * 递归添加子目录
   */
  addSubDirectories(dir, includes, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return;
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory()) {
          const subDir = path.join(dir, item.name);
          includes.push(subDir);
          this.addSubDirectories(subDir, includes, maxDepth, currentDepth + 1);
        }
      }
    } catch (error) {
      // 忽略无法访问的目录
    }
  }

  /**
   * 获取系统包含路径
   */
  getSystemIncludes() {
    const includes = [];
    
    // 常见的Arduino系统路径
    const commonPaths = [
      // AVR toolchain 路径
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Arduino15\\packages\\arduino\\tools\\avr-gcc\\*\\avr\\include',
      'C:\\Program Files (x86)\\Arduino\\hardware\\tools\\avr\\avr\\include',
      'C:\\Program Files\\Arduino\\hardware\\tools\\avr\\avr\\include',
      
      // 标准C库路径
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Arduino15\\packages\\arduino\\tools\\avr-gcc\\*\\lib\\gcc\\avr\\*\\include',
      'C:\\Program Files (x86)\\Arduino\\hardware\\tools\\avr\\lib\\gcc\\avr\\*\\include',
      'C:\\Program Files\\Arduino\\hardware\\tools\\avr\\lib\\gcc\\avr\\*\\include'
    ];
    
    // 这里暂时不添加系统路径，因为需要动态解析
    // 在实际应用中可以根据检测到的工具链路径来添加
    
    return includes;
  }

  /**
   * 获取预定义宏
   */
  getDefines() {
    return [
      'ARDUINO=10819',
      'ARDUINO_AVR_UNO',
      'ARDUINO_ARCH_AVR',
      '__AVR__',
      '__AVR_ATmega328P__',
      'F_CPU=16000000L',
      '__PROG_TYPES_COMPAT__',
      '__AVR_LIBC_VERSION__=20800UL',
      'ARDUINO_MAIN',
      // 添加一些常用的Arduino宏
      'TWI_FREQ=100000L',
      'BUFFER_LENGTH=32',
      'SERIAL_BUFFER_SIZE=64'
    ];
  }

  /**
   * 根据文件类型选择编译器
   */
  getCompiler(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.c':
        return 'avr-gcc';
      case '.cpp':
      case '.ino':
        return 'avr-g++';
      default:
        return 'avr-g++'; // 默认使用C++编译器
    }
  }

  /**
   * 构建命令行
   */
  buildCommandLine(compiler, filePath, includes, defines) {
    const args = [compiler];
    
    // 添加包含路径
    for (const include of includes) {
      args.push(`-I"${include}"`);
    }
    
    // 添加预定义宏
    for (const define of defines) {
      args.push(`-D${define}`);
    }
    
    // 添加编译选项
    args.push(
      '-c',
      '-g',
      '-Os',
      '-w',
      '-std=gnu++11',
      '-fpermissive',
      '-fno-exceptions',
      '-ffunction-sections',
      '-fdata-sections',
      '-fno-threadsafe-statics',
      '-Wno-error=narrowing',
      '-MMD',
      '-mmcu=atmega328p'
    );
    
    // 添加源文件
    args.push(`"${filePath}"`);
    
    return args.join(' ');
  }

  /**
   * 保存编译命令到文件
   */
  saveToFile(outputProjectPath = null) {
    const commands = this.generateCompileCommands();
    
    // 使用指定的输出路径，或者第一个项目路径作为默认输出位置
    const targetProjectPath = outputProjectPath || this.projectPaths[0];
    
    if (!targetProjectPath) {
      throw new Error('No valid project path available for output');
    }
    
    const tempDir = path.join(targetProjectPath, '.temp');
    const outputPath = path.join(tempDir, 'compile_commands.json');
    
    try {
      // 确保.temp目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, JSON.stringify(commands, null, 2));
      console.log(`Generated compile_commands.json with ${commands.length} entries at: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Failed to save compile_commands.json:', error);
      throw error;
    }
  }
}

module.exports = CompileCommandsGenerator;
