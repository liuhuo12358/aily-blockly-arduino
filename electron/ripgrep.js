/**
 * Ripgrep 工具包装器 - 用于高速文件内容搜索
 * 参考 Kode 项目的 ripgrep 实现
 * 
 * 支持两种方式:
 * 1. 使用内置的 ripgrep 二进制文件 (无需用户安装)
 * 2. 使用系统 PATH 中的 ripgrep (如果已安装)
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 查找 ripgrep 可执行文    // 注意: 回到传统模式,在 JavaScript 层手动处理多匹配
    if (contextLines > 0) {
        args.push('-C', contextLines.toString());
    }
    
    // 大小写敏感性 优先级: 1. 内置版本  2. 系统 PATH
 * @returns {string} ripgrep 可执行文件的完整路径
 */
function findRipgrepPath() {
    // 1. 首先尝试使用内置的 ripgrep (推荐方式)
    const bundledRgPath = getBundledRipgrepPath();
    if (bundledRgPath && fs.existsSync(bundledRgPath)) {
        console.log('使用内置 ripgrep:', bundledRgPath);
        return bundledRgPath;
    }
    
    // 2. 如果内置版本不存在，尝试使用系统 PATH 中的 rg
    console.log('内置 ripgrep 不存在，尝试使用系统版本');
    return process.platform === 'win32' ? 'rg.exe' : 'rg';
}

/**
 * 获取内置 ripgrep 的路径
 * 支持多平台多架构
 * @returns {string|null} 内置 ripgrep 的路径，如果不存在则返回 null
 */
function getBundledRipgrepPath() {
    try {
        // ripgrep 二进制文件存放在 electron/vendor/ripgrep 目录
        const vendorRoot = path.join(__dirname, 'vendor', 'ripgrep');
        
        let rgBinary;
        
        if (process.platform === 'win32') {
            // Windows: 根据架构选择对应的二进制文件
            // x64 是最常见的，也可以支持 ia32
            const arch = process.arch === 'ia32' ? 'ia32' : 'x64';
            rgBinary = path.join(vendorRoot, `${arch}-win32`, 'rg.exe');
        } else if (process.platform === 'darwin') {
            // macOS: 支持 x64 和 arm64 (Apple Silicon)
            rgBinary = path.join(vendorRoot, `${process.arch}-darwin`, 'rg');
        } else if (process.platform === 'linux') {
            // Linux: 支持多种架构
            rgBinary = path.join(vendorRoot, `${process.arch}-linux`, 'rg');
        } else {
            console.warn('不支持的平台:', process.platform);
            return null;
        }
        
        return rgBinary;
    } catch (error) {
        console.error('获取内置 ripgrep 路径失败:', error);
        return null;
    }
}

/**
 * 检查 ripgrep 是否可用
 * @returns {Promise<boolean>} ripgrep 是否可用
 */
async function isRipgrepAvailable() {
    return new Promise((resolve) => {
        execFile(
            findRipgrepPath(),
            ['--version'],
            { timeout: 2000 },
            (error) => {
                if (error) {
                    console.warn('Ripgrep 不可用:', error.message);
                    resolve(false);
                } else {
                    resolve(true);
                }
            }
        );
    });
}

/**
 * 使用 ripgrep 搜索文件内容
 * @param {string[]} args - ripgrep 命令行参数
 * @param {string} searchPath - 搜索路径
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{success: boolean, results: string[], error?: string}>}
 */
async function ripgrep(args, searchPath, timeout = 10000) {
    const rgPath = findRipgrepPath();
    
    return new Promise((resolve) => {
        const fullArgs = [...args, searchPath];
        
        console.log(`执行 ripgrep: ${rgPath} ${fullArgs.join(' ')}`);
        
        execFile(
            rgPath,
            fullArgs,
            {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                timeout: timeout,
                encoding: 'utf8'
            },
            (error, stdout, stderr) => {
                if (error) {
                    // 退出码 1 表示未找到匹配项，这是正常情况
                    if (error.code === 1) {
                        resolve({
                            success: true,
                            results: []
                        });
                        return;
                    }
                    
                    // 其他错误
                    console.error('Ripgrep 执行错误:', error);
                    resolve({
                        success: false,
                        results: [],
                        error: error.message || stderr
                    });
                    return;
                }
                
                // 解析输出
                const results = stdout
                    .trim()
                    .split('\n')
                    .filter(line => line.length > 0);
                
                resolve({
                    success: true,
                    results: results
                });
            }
        );
    });
}

/**
 * 搜索包含指定模式的文件
 * @param {Object} params - 搜索参数
 * @param {string} params.pattern - 搜索模式（正则表达式）
 * @param {string} params.path - 搜索路径
 * @param {string} [params.include] - 文件包含模式 (glob)
 * @param {boolean} [params.isRegex=true] - 是否为正则表达式
 * @param {number} [params.maxResults=100] - 最大结果数
 * @param {boolean} [params.ignoreCase=true] - 是否忽略大小写
 * @returns {Promise<{success: boolean, numFiles: number, filenames: string[], durationMs: number, error?: string}>}
 */
async function searchFiles(params) {
    const {
        pattern,
        path: searchPath,
        include,
        isRegex = true,
        maxResults = 100,
        ignoreCase = true
    } = params;
    
    const startTime = Date.now();
    
    // 构建 ripgrep 参数
    const args = [
        '-l',  // 只列出包含匹配项的文件名
        '--no-heading',  // 不显示文件名作为标题
        '--no-line-number',  // 不显示行号
        '--color=never',  // 不使用颜色
        '--max-count=1',  // 每个文件只需要一个匹配即可
    ];
    
    // 大小写敏感性
    if (ignoreCase) {
        args.push('-i');
    }
    
    // 正则表达式模式
    if (!isRegex) {
        args.push('-F');  // 固定字符串搜索（非正则）
    }
    
    // 文件包含模式
    if (include) {
        args.push('--glob', include);
    }
    
    // 限制结果数
    args.push('--max-filesize', '10M');  // 跳过大于 10MB 的文件
    
    // 添加搜索模式
    args.push(pattern);
    
    // 执行搜索
    const result = await ripgrep(args, searchPath);
    
    const durationMs = Date.now() - startTime;
    
    if (!result.success) {
        return {
            success: false,
            numFiles: 0,
            filenames: [],
            durationMs: durationMs,
            error: result.error
        };
    }
    
    // 限制结果数量
    const filenames = result.results.slice(0, maxResults);
    
    return {
        success: true,
        numFiles: filenames.length,
        filenames: filenames,
        durationMs: durationMs
    };
}

/**
 * 列出目录中的所有内容文件（遵守 .gitignore 等忽略规则）
 * @param {string} searchPath - 搜索路径
 * @param {number} limit - 最大文件数
 * @returns {Promise<{success: boolean, files: string[]}>}
 */
async function listAllContentFiles(searchPath, limit = 1000) {
    // 使用 ripgrep 搜索任意字符，匹配所有非空文件
    // ripgrep 会自动处理 .gitignore 等忽略文件
    const result = await ripgrep(
        ['-l', '--max-count=1', '.'],
        searchPath
    );
    
    if (!result.success) {
        return {
            success: false,
            files: []
        };
    }
    
    return {
        success: true,
        files: result.results.slice(0, limit)
    };
}

/**
 * 搜索文件内容并返回匹配的行
 * @param {Object} params - 搜索参数
 * @param {string} params.pattern - 搜索模式
 * @param {string} params.path - 搜索路径
 * @param {string} [params.include] - 文件包含模式 (glob)
 * @param {boolean} [params.isRegex=true] - 是否为正则表达式
 * @param {number} [params.maxResults=100] - 最大结果数
 * @param {boolean} [params.ignoreCase=true] - 是否忽略大小写
 * @param {number} [params.contextLines=0] - 显示上下文行数
 * @param {number} [params.maxLineLength=500] - 每行最大长度(字符数)
 * @returns {Promise<{success: boolean, matches: Array<{file: string, line: number, content: string}>, durationMs: number}>}
 */
async function searchContent(params) {
    const {
        pattern,
        path: searchPath,
        include,
        isRegex = true,
        maxResults = 100,
        ignoreCase = true,
        contextLines = 0,
        maxLineLength = 500
    } = params;
    
    const startTime = Date.now();
    
    // 构建 ripgrep 参数 - 回到简单模式,在 JS 层手动处理多匹配
    const args = [
        '--no-heading',      // 不显示文件名作为标题
        '--line-number',     // 显示行号
        '--color=never',     // 不使用颜色
        '--max-count', Math.min(maxResults, 1000).toString(),  // 每个文件最多匹配数
        // 关键: 让 ripgrep 返回完整的超长行,不要跳过
        '--max-columns', '0',  // 0 表示不限制列数
    ];
    
    // 注意: --vimgrep 不支持 contextLines (上下文行)
    // 如果需要上下文,应该使用传统的 --no-heading --line-number 模式
    if (contextLines > 0) {
        console.warn(`[searchContent] --vimgrep 模式不支持 contextLines,已忽略`);
    }
    
    // 大小写敏感性
    if (ignoreCase) {
        args.push('-i');
    }
    
    // 正则表达式模式
    if (!isRegex) {
        args.push('-F');
    }
    
    // 文件包含模式
    if (include) {
        args.push('--glob', include);
    }
    
    // 限制文件大小
    args.push('--max-filesize', '10M');
    
    // 添加搜索模式
    args.push(pattern);
    
    // 执行搜索
    const result = await ripgrep(args, searchPath);
    
    const durationMs = Date.now() - startTime;
    
    if (!result.success) {
        return {
            success: false,
            matches: [],
            durationMs: durationMs,
            error: result.error
        };
    }
    
    // 解析输出: 格式为 "文件名:行号:内容"
    const matches = [];
    let currentFile = null;
    
    console.log(`[searchContent] 原始结果行数: ${result.results.length}`);
    console.log(`[searchContent] 前3行示例:`, result.results.slice(0, 3).map(r => r.substring(0, 150)));
    console.log(`[searchContent] maxLineLength: ${maxLineLength}`);
    
    for (const line of result.results) {
        if (!line) continue;
        
        // ripgrep 输出格式: filepath:linenum:content
        // Windows下可能是 C:\path\file:123:content 或 .\file:123:content
        // 使用更灵活的正则: 匹配到第一个 :数字: 模式
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
            let [, file, lineNum, content] = match;
            
            console.log(`[searchContent] 原始内容长度: ${content.length} 字符 (行${lineNum})`);
            
            // 🆕 新策略: 在 JavaScript 层手动查找所有匹配,生成多个记录
            const expandedMatches = expandMatches(content, pattern, file, parseInt(lineNum, 10), maxLineLength, isRegex);
            
            console.log(`[searchContent] 展开为 ${expandedMatches.length} 个匹配`);
            
            // 添加所有展开的匹配
            for (const expandedMatch of expandedMatches) {
                matches.push(expandedMatch);
                if (matches.length >= maxResults) {
                    break;
                }
            }
            
            if (matches.length >= maxResults) {
                break;
            }
        } else {
            console.warn(`[searchContent] 无法解析行: ${line.substring(0, 100)}`);
        }
    }
    
    console.log(`[searchContent] 成功解析 ${matches.length} 个匹配`);
    
    return {
        success: true,
        matches: matches,
        numMatches: matches.length,
        durationMs: durationMs,
        _debug: {
            maxLineLength: maxLineLength,
            pattern: pattern,
            rawResultLines: result.results.length
        }
    };
}

/**
 * 在 JavaScript 层手动展开单行中的多个匹配
 * @param {string} content - 完整行内容
 * @param {string} pattern - 搜索模式
 * @param {string} file - 文件路径
 * @param {number} lineNum - 行号
 * @param {number} maxLineLength - 最大行长度
 * @param {boolean} isRegex - 是否是正则表达式
 * @returns {Array} 匹配记录数组
 */
function expandMatches(content, pattern, file, lineNum, maxLineLength, isRegex) {
    console.log(`[expandMatches] 开始处理: 文件=${file}, 行=${lineNum}, 内容长度=${content.length}`);
    
    const matches = [];
    
    // 第一步: 尝试 JSON 格式化(如果适用)
    let processedContent = content;
    let isFormatted = false;
    
    if (file.toLowerCase().endsWith('.json') && content.length > maxLineLength) {
        try {
            const jsonObj = JSON.parse(content);
            processedContent = JSON.stringify(jsonObj, null, 2);
            isFormatted = true;
            console.log(`[expandMatches] ✅ JSON 格式化成功: 原始=${content.length}, 格式化=${processedContent.length}`);
        } catch (e) {
            console.log(`[expandMatches] ⚠️ JSON 解析失败,使用原始内容: ${e.message}`);
        }
    }
    
    // 第二步: 查找所有匹配位置
    const matchPositions = findAllMatches(processedContent, pattern, isRegex);
    console.log(`[expandMatches] 找到 ${matchPositions.length} 个匹配位置: [${matchPositions.slice(0, 5).join(', ')}${matchPositions.length > 5 ? '...' : ''}]`);
    
    // 第三步: 为每个匹配位置生成截取内容
    if (matchPositions.length === 0) {
        // 没有找到匹配,可能是ripgrep的模式匹配与JS的不同,返回一个默认记录
        console.log(`[expandMatches] ⚠️ 未找到匹配,返回开头内容`);
        const truncatedContent = processedContent.length > maxLineLength 
            ? processedContent.substring(0, maxLineLength) + '\n... (后续内容省略)'
            : processedContent;
            
        matches.push({
            file: file,
            line: lineNum,
            column: 1,
            content: truncatedContent
        });
    } else {
        // 为每个匹配位置生成独立记录
        for (let i = 0; i < matchPositions.length; i++) {
            const position = matchPositions[i];
            const truncatedContent = extractAroundPosition(processedContent, position, maxLineLength);
            
            matches.push({
                file: file,
                line: lineNum,
                column: isFormatted ? mapFormattedPosition(content, processedContent, position) : position + 1, // 列号从1开始
                content: truncatedContent
            });
            
            console.log(`[expandMatches] 匹配 #${i + 1}: 位置=${position}, 截取长度=${truncatedContent.length}`);
        }
    }
    
    console.log(`[expandMatches] 生成 ${matches.length} 个匹配记录`);
    return matches;
}

/**
 * 查找内容中所有匹配的位置
 * @param {string} content - 内容
 * @param {string} pattern - 搜索模式
 * @param {boolean} isRegex - 是否是正则表达式
 * @returns {Array<number>} 匹配位置数组
 */
function findAllMatches(content, pattern, isRegex) {
    const positions = [];
    
    try {
        if (isRegex) {
            // 正则表达式模式
            const regex = new RegExp(pattern, 'gi'); // 全局匹配,不区分大小写
            let match;
            while ((match = regex.exec(content)) !== null) {
                positions.push(match.index);
                // 防止无限循环(零宽度匹配)
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        } else {
            // 固定字符串模式
            const searchText = pattern.toLowerCase();
            const contentLower = content.toLowerCase();
            let index = 0;
            
            while ((index = contentLower.indexOf(searchText, index)) !== -1) {
                positions.push(index);
                index += pattern.length; // 移动到下一个可能的位置
            }
        }
    } catch (e) {
        console.warn(`[findAllMatches] 搜索失败: ${e.message}`);
    }
    
    return positions;
}

/**
 * 映射格式化后的位置到原始内容位置(粗略估算)
 * @param {string} original - 原始内容
 * @param {string} formatted - 格式化内容
 * @param {number} formattedPos - 格式化内容中的位置
 * @returns {number} 原始内容中的大概位置
 */
function mapFormattedPosition(original, formatted, formattedPos) {
    // 简单的线性映射(不够精确,但够用)
    const ratio = original.length / formatted.length;
    return Math.round(formattedPos * ratio) + 1; // 列号从1开始
}

/**
 * 在指定列号位置智能截取内容
 * @param {string} content - 内容(可能是原始或格式化后的)
 * @param {string} pattern - 搜索模式
 * @param {number} columnHint - 列号提示(原始内容中的匹配位置)
 * @param {number} maxLength - 最大长度
 * @param {boolean} isFormatted - 内容是否已格式化
 * @returns {string} 截断后的内容
 */
function smartTruncateAtColumn(content, pattern, columnHint, maxLength, isFormatted) {
    console.log(`[smartTruncateAtColumn] 列号=${columnHint}, 内容长度=${content.length}, 已格式化=${isFormatted}`);
    
    // 如果内容本身不长,直接返回
    if (content.length <= maxLength) {
        console.log(`[smartTruncateAtColumn] 内容不长,直接返回`);
        return content;
    }
    
    // 策略 1: 如果是格式化后的内容,先找到匹配位置
    if (isFormatted) {
        console.log(`[smartTruncateAtColumn] 格式化内容,查找匹配位置...`);
        const matchPos = findMatchPosition(content, pattern);
        if (matchPos >= 0) {
            const extracted = extractAroundPosition(content, matchPos, maxLength);
            console.log(`[smartTruncateAtColumn] ✅ 在格式化内容中找到匹配, 位置=${matchPos}, 结果长度=${extracted.length}`);
            return extracted;
        }
        console.log(`[smartTruncateAtColumn] ⚠️ 格式化内容中未找到匹配,使用列号提示`);
    }
    
    // 策略 2: 使用列号作为位置提示
    // 对于格式化内容,列号可能不准确,但仍可作为参考
    if (columnHint >= 0 && columnHint < content.length) {
        console.log(`[smartTruncateAtColumn] 使用列号 ${columnHint} 作为中心点`);
        const extracted = extractAroundPosition(content, columnHint, maxLength);
        console.log(`[smartTruncateAtColumn] ✅ 基于列号截取, 结果长度=${extracted.length}`);
        return extracted;
    }
    
    // 策略 3: 兜底 - 返回开头
    console.log(`[smartTruncateAtColumn] ⚠️ 兜底: 返回开头 ${maxLength} 字符`);
    return content.substring(0, maxLength) + '\n... (后续内容省略)';
}

/**
 * @deprecated 已被 smartTruncateAtColumn 替代,保留用于向后兼容
 * 智能截断内容:根据文件类型和匹配位置优化显示
 * @param {string} content - 原始内容
 * @param {string} pattern - 搜索模式
 * @param {number} maxLength - 最大长度
 * @param {string} filePath - 文件路径(用于判断类型)
 * @returns {string} 截断后的内容
 */
function smartTruncate(content, pattern, maxLength, filePath) {
    console.log(`[smartTruncate] 开始处理: 文件=${filePath}, 原长度=${content.length}, 限制=${maxLength}`);
    
    // 策略 1: 尝试 JSON 格式化
    if (filePath.toLowerCase().endsWith('.json')) {
        console.log('[smartTruncate] 检测到 JSON 文件,尝试解析...');
        try {
            const jsonObj = JSON.parse(content);
            const formatted = JSON.stringify(jsonObj, null, 2); // 格式化 JSON
            console.log(`[smartTruncate] JSON 解析成功,格式化后长度: ${formatted.length}`);
            
            // 如果格式化后仍然太长,找到匹配位置截取
            if (formatted.length > maxLength) {
                console.log('[smartTruncate] 格式化后仍然超长,查找匹配位置...');
                const matchPos = findMatchPosition(formatted, pattern);
                console.log(`[smartTruncate] 匹配位置: ${matchPos}`);
                
                if (matchPos >= 0) {
                    const extracted = extractAroundPosition(formatted, matchPos, maxLength);
                    console.log(`[smartTruncate] ✅ JSON格式化后截取成功: 匹配位置=${matchPos}, 结果长度=${extracted.length}`);
                    return extracted;
                }
                // 找不到匹配位置,返回开头
                console.log(`[smartTruncate] ⚠️ 未找到匹配位置,返回格式化开头`);
                return formatted.substring(0, maxLength) + '\n... (JSON已格式化,后续内容省略)';
            }
            
            // 格式化后长度合适,直接返回
            console.log(`[smartTruncate] ✅ JSON格式化成功且长度合适, 长度=${formatted.length}`);
            return formatted;
        } catch (e) {
            console.log(`[smartTruncate] ⚠️ JSON解析失败,使用文本模式: ${e.message}`);
            // JSON 解析失败,继续使用文本策略
        }
    }
    
    // 策略 2: 普通文本 - 找到匹配位置,返回周围上下文
    console.log('[smartTruncate] 使用文本模式,查找匹配位置...');
    const matchPos = findMatchPosition(content, pattern);
    console.log(`[smartTruncate] 文本模式匹配位置: ${matchPos}`);
    
    if (matchPos >= 0) {
        const extracted = extractAroundPosition(content, matchPos, maxLength);
        console.log(`[smartTruncate] ✅ 文本模式截取成功: 匹配位置=${matchPos}, 结果长度=${extracted.length}`);
        return extracted;
    }
    
    // 策略 3: 兜底 - 返回开头
    console.log(`[smartTruncate] ⚠️ 兜底策略: 返回前 ${maxLength} 字符`);
    return content.substring(0, maxLength) + '... (后续内容省略)';
}

/**
 * 查找匹配位置(不区分大小写)
 * @param {string} content - 内容
 * @param {string} pattern - 搜索模式
 * @returns {number} 匹配位置,未找到返回 -1
 */
function findMatchPosition(content, pattern) {
    console.log(`[findMatchPosition] 搜索模式: "${pattern}"`);
    
    try {
        // 尝试正则匹配
        const regex = new RegExp(pattern, 'i'); // 不区分大小写
        const match = content.match(regex);
        if (match && match.index !== undefined) {
            console.log(`[findMatchPosition] ✅ 正则匹配成功,位置: ${match.index}, 匹配内容: "${match[0]}"`);
            return match.index;
        }
        console.log('[findMatchPosition] 正则匹配未找到结果');
    } catch (e) {
        console.log(`[findMatchPosition] 正则匹配失败: ${e.message}, 使用文本搜索`);
        // 正则失败,使用简单文本搜索
    }
    
    // 简单文本搜索(不区分大小写)
    const position = content.toLowerCase().indexOf(pattern.toLowerCase());
    if (position >= 0) {
        console.log(`[findMatchPosition] ✅ 文本搜索成功,位置: ${position}`);
    } else {
        console.log(`[findMatchPosition] ❌ 文本搜索失败,未找到 "${pattern}"`);
    }
    return position;
}

/**
 * 提取指定位置周围的内容
 * @param {string} content - 内容
 * @param {number} position - 匹配位置
 * @param {number} maxLength - 最大长度
 * @returns {string} 提取的内容
 */
function extractAroundPosition(content, position, maxLength) {
    // 计算前后分配:匹配位置居中
    const beforeLength = Math.floor(maxLength / 2);
    const afterLength = maxLength - beforeLength;
    
    let start = Math.max(0, position - beforeLength);
    let end = Math.min(content.length, position + afterLength);
    
    // 如果起始位置太后,调整为从头开始
    if (start > 0 && end - start < maxLength) {
        start = Math.max(0, end - maxLength);
    }
    
    // 如果结束位置太前,调整为到结尾
    if (end < content.length && end - start < maxLength) {
        end = Math.min(content.length, start + maxLength);
    }
    
    let result = '';
    if (start > 0) {
        result += '... ';
    }
    result += content.substring(start, end);
    if (end < content.length) {
        result += ' ...';
    }
    
    return result;
}

module.exports = {
    isRipgrepAvailable,
    ripgrep,
    searchFiles,
    listAllContentFiles,
    searchContent,
    findRipgrepPath
};
