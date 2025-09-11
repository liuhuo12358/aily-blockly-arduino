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
      includes.push(path.join(this.sdkPath, 'cores', 'arduino'));
      includes.push(path.join(this.sdkPath, 'variants', 'standard'));
      
      // 查找其他核心目录
      const coresDir = path.join(this.sdkPath, 'cores');
      if (fs.existsSync(coresDir)) {
        const cores = fs.readdirSync(coresDir, { withFileTypes: true });
        for (const core of cores) {
          if (core.isDirectory()) {
            includes.push(path.join(coresDir, core.name));
          }
        }
      }
    }
    
    // 库文件路径
    if (this.librariesPath && fs.existsSync(this.librariesPath)) {
      this.addLibraryIncludes(this.librariesPath, includes);
    }
    
    // 项目本地头文件
    includes.push(this.projectPath);
    
    return includes;
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
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read libraries directory ${libPath}:`, error.message);
    }
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
      'F_CPU=16000000L'
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
