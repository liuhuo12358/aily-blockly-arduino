const path = require('path');
const fs = require('fs');

/**
 * 为Arduino项目生成compile_commands.json文件
 * 这将帮助clangd更好地理解项目结构和依赖关系
 */
class CompileCommandsGenerator {
  constructor(projectPath, sdkPath, librariesPath) {
    this.projectPath = projectPath;
    this.sdkPath = sdkPath;
    this.librariesPath = librariesPath;
  }

  /**
   * 生成编译命令
   */
  generateCompileCommands() {
    const commands = [];
    
    // 获取项目中的所有源文件
    const sourceFiles = this.findSourceFiles(this.projectPath);
    
    for (const file of sourceFiles) {
      const command = this.generateCommandForFile(file);
      if (command) {
        commands.push(command);
      }
    }
    
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
  generateCommandForFile(filePath) {
    const includes = this.getIncludePaths();
    const defines = this.getDefines();
    
    // 确定编译器
    const compiler = this.getCompiler(filePath);
    
    const command = {
      directory: this.projectPath,
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
    
    // Arduino核心库路径
    if (this.sdkPath && fs.existsSync(this.sdkPath)) {
      // 检查是否是直接的cores/arduino路径
      if (this.sdkPath.includes('cores')) {
        includes.push(this.sdkPath);
        
        // 查找variants路径
        const variantsPath = this.sdkPath.replace(/cores.*$/, 'variants/standard');
        if (fs.existsSync(variantsPath)) {
          includes.push(variantsPath);
        }
      } else {
        // 如果是SDK根目录，添加子目录
        const possiblePaths = [
          path.join(this.sdkPath, 'cores', 'arduino'),
          path.join(this.sdkPath, 'variants', 'standard'),
          path.join(this.sdkPath, 'variants', 'mega'),
          path.join(this.sdkPath, 'variants', 'micro'),
          path.join(this.sdkPath, 'variants', 'leonardo')
        ];
        
        for (const possiblePath of possiblePaths) {
          if (fs.existsSync(possiblePath)) {
            includes.push(possiblePath);
          }
        }
      }
      
      // 查找其他核心目录
      try {
        const sdkRoot = this.sdkPath.includes('cores') ? 
          this.sdkPath.split('cores')[0] : this.sdkPath;
        const coresDir = path.join(sdkRoot, 'cores');
        
        if (fs.existsSync(coresDir)) {
          const cores = fs.readdirSync(coresDir, { withFileTypes: true });
          for (const core of cores) {
            if (core.isDirectory()) {
              const corePath = path.join(coresDir, core.name);
              if (!includes.includes(corePath)) {
                includes.push(corePath);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to scan cores directory:', error.message);
      }
    }
    
    // 库文件路径
    if (this.librariesPath && fs.existsSync(this.librariesPath)) {
      this.addLibraryIncludes(this.librariesPath, includes);
    }
    
    // 添加常见的系统include路径
    const systemIncludes = this.getSystemIncludes();
    includes.push(...systemIncludes);
    
    // 项目本地头文件（放在最后，优先级最高）
    includes.push(this.projectPath);
    
    // 去重
    return [...new Set(includes)];
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
  saveToFile() {
    const commands = this.generateCompileCommands();
    const tempDir = path.join(this.projectPath, '.temp');
    const outputPath = path.join(tempDir, 'compile_commands.json');
    
    try {
      // 确保.temp目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, JSON.stringify(commands, null, 2));
      console.log(`Generated compile_commands.json with ${commands.length} entries`);
      return outputPath;
    } catch (error) {
      console.error('Failed to save compile_commands.json:', error);
      throw error;
    }
  }
}

module.exports = CompileCommandsGenerator;
