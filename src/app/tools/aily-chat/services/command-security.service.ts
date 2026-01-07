/**
 * Aily Blockly 命令安全验证器
 * 实现命令白名单/黑名单和危险命令检测
 * 
 * @see docs/aily-security-guidelines.md
 */

// ==================== 类型定义 ====================

export interface CommandCheckResult {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason?: string;
    riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
    category?: 'safe' | 'confirm' | 'blocked';
}

export interface CommandExecutionLimits {
    timeout: number;              // 执行超时（毫秒）
    maxOutputSize: number;        // 输出大小限制（字节）
    requireProjectContext: boolean; // 必须在项目目录内执行
    allowSubshell: boolean;       // 是否允许创建子 shell
}

// ==================== 常量配置 ====================

/**
 * 命令执行限制配置
 */
export const COMMAND_EXECUTION_LIMITS: CommandExecutionLimits = {
    timeout: 300000,              // 5分钟
    maxOutputSize: 1048576,       // 1MB
    requireProjectContext: true,
    allowSubshell: false
};

/**
 * 安全命令（自动允许）
 */
export const SAFE_COMMANDS: string[] = [
    // 编译和构建相关 - Arduino
    'arduino-cli',
    'pio',
    'platformio',
    
    // 文件操作（只读）
    'ls',
    'dir',
    'cat',
    'type',
    'head',
    'tail',
    'more',
    'less',
    'pwd',
    'cd',
    'find',
    'locate',
    'which',
    'where',
    'whereis',
    'file',
    'stat',
    'wc',
    'du',
    'df',
    
    // Git 只读操作
    'git status',
    'git log',
    'git diff',
    'git branch',
    'git remote',
    'git show',
    'git ls-files',
    'git rev-parse',
    'git describe',
    'git tag --list',
    'git stash list',
    'git config --list',
    'git config --get',
    
    // 版本查询
    'node --version',
    'node -v',
    'npm --version',
    'npm -v',
    'npx --version',
    'python --version',
    'python -V',
    'python3 --version',
    'pip --version',
    'pip3 --version',
    'java --version',
    'java -version',
    'javac --version',
    'go version',
    'rustc --version',
    'cargo --version',
    'gcc --version',
    'g++ --version',
    'clang --version',
    'make --version',
    'cmake --version',
    
    // npm 只读操作
    'npm list',
    'npm ls',
    'npm outdated',
    'npm view',
    'npm info',
    'npm search',
    'npm audit',
    'npm config list',
    'npm config get',
    
    // 环境信息
    'env',
    'printenv',
    'echo',
    'date',
    'whoami',
    'hostname',
    'uname',
    
    // 文本处理（只读）
    'grep',
    'awk',
    'sed',  // 只用于查看，不用于修改
    'sort',
    'uniq',
    'cut',
    'tr',
    'diff',
    'comm',
];

/**
 * 需要确认的命令
 */
export const CONFIRM_COMMANDS: string[] = [
    // Git 修改操作
    'git add',
    'git commit',
    'git push',
    'git pull',
    'git merge',
    'git rebase',
    'git reset',
    'git checkout',
    'git switch',
    'git restore',
    'git cherry-pick',
    'git revert',
    'git stash',
    'git clean',
    'git fetch',
    'git clone',
    'git init',
    
    // npm 修改操作
    'npm install',
    'npm i',
    'npm uninstall',
    'npm remove',
    'npm update',
    'npm upgrade',
    'npm link',
    'npm publish',
    'npm unpublish',
    'npm deprecate',
    'npm run',
    'npm exec',
    'npm start',
    'npm test',
    'npm build',
    'npx',
    
    // pip 操作
    'pip install',
    'pip uninstall',
    'pip3 install',
    'pip3 uninstall',
    
    // 文件操作（可能有风险）
    'rm',
    'del',
    'rmdir',
    'rd',
    'mv',
    'move',
    'cp',
    'copy',
    'xcopy',
    'robocopy',
    'mkdir',
    'md',
    'touch',
    
    // 网络操作
    'curl',
    'wget',
    'fetch',
    'http',
    'ssh',
    'scp',
    'rsync',
    'ftp',
    'sftp',
    
    // 压缩/解压
    'zip',
    'unzip',
    'tar',
    'gzip',
    'gunzip',
    '7z',
    'rar',
    
    // 进程管理
    'kill',
    'killall',
    'pkill',
    'taskkill',
    
    // 服务和守护进程
    'service',
    'systemctl',
    'launchctl',
];

/**
 * 禁止的命令模式（正则表达式）
 */
export const BLOCKED_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string; riskLevel: 'high' | 'critical' }> = [
    // 系统级危险操作 - 递归删除根目录
    { 
        pattern: /rm\s+(-[rRf]+\s+)*[/\\](\s|$)/,
        reason: '禁止删除根目录',
        riskLevel: 'critical'
    },
    {
        pattern: /rm\s+(-[rRf]+\s+)*~(\s|$)/,
        reason: '禁止删除用户主目录',
        riskLevel: 'critical'
    },
    {
        pattern: /rm\s+(-[rRf]+\s+)*\/\*(\s|$)/,
        reason: '禁止使用通配符删除根目录',
        riskLevel: 'critical'
    },
    {
        pattern: /rm\s+-rf\s+\*(\s|$)/,
        reason: '禁止使用危险的 rm -rf * 命令',
        riskLevel: 'critical'
    },
    
    // Windows 格式化命令
    {
        pattern: /\bformat\s+[A-Za-z]:/i,
        reason: '禁止执行磁盘格式化命令',
        riskLevel: 'critical'
    },
    
    // 磁盘操作
    {
        pattern: /\bfdisk\b/i,
        reason: '禁止执行磁盘分区命令',
        riskLevel: 'critical'
    },
    {
        pattern: /\bdd\s+if=/i,
        reason: '禁止执行 dd 命令（可能导致数据丢失）',
        riskLevel: 'critical'
    },
    {
        pattern: /\bmkfs\b/i,
        reason: '禁止执行文件系统创建命令',
        riskLevel: 'critical'
    },
    
    // Fork 炸弹
    {
        pattern: /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/,
        reason: '检测到 Fork 炸弹攻击',
        riskLevel: 'critical'
    },
    {
        pattern: /\$\(.*\)\s*\|\s*\$\(/,
        reason: '检测到潜在的递归命令',
        riskLevel: 'high'
    },
    
    // 权限提升操作
    {
        pattern: /\bsudo\s+rm\s+-rf/i,
        reason: '禁止使用 sudo 执行危险删除',
        riskLevel: 'critical'
    },
    {
        pattern: /\bchmod\s+777\s+\//i,
        reason: '禁止修改根目录权限',
        riskLevel: 'critical'
    },
    {
        pattern: /\bchown\s+root/i,
        reason: '禁止更改文件所有者为 root',
        riskLevel: 'high'
    },
    {
        pattern: /\bchmod\s+-R\s+777/i,
        reason: '禁止递归设置 777 权限',
        riskLevel: 'high'
    },
    
    // 系统关键操作
    {
        pattern: /\bshutdown\b/i,
        reason: '禁止执行关机命令',
        riskLevel: 'critical'
    },
    {
        pattern: /\breboot\b/i,
        reason: '禁止执行重启命令',
        riskLevel: 'critical'
    },
    {
        pattern: /\bhalt\b/i,
        reason: '禁止执行停机命令',
        riskLevel: 'critical'
    },
    {
        pattern: /\bpoweroff\b/i,
        reason: '禁止执行关机命令',
        riskLevel: 'critical'
    },
    {
        pattern: /\binit\s+[06]\b/,
        reason: '禁止更改系统运行级别',
        riskLevel: 'critical'
    },
    
    // 远程代码执行风险
    {
        pattern: /curl\s+.*\|\s*(ba)?sh/i,
        reason: '禁止通过管道执行远程脚本',
        riskLevel: 'critical'
    },
    {
        pattern: /wget\s+.*\|\s*(ba)?sh/i,
        reason: '禁止通过管道执行远程脚本',
        riskLevel: 'critical'
    },
    {
        pattern: /curl\s+.*\|\s*python/i,
        reason: '禁止通过管道执行远程 Python 脚本',
        riskLevel: 'critical'
    },
    {
        pattern: /\beval\s*\(/i,
        reason: '禁止使用 eval 执行动态代码',
        riskLevel: 'high'
    },
    
    // 危险的 Windows 命令
    {
        pattern: /\bdel\s+\/[sS]\s+\/[qQ]\s+[A-Za-z]:\\/i,
        reason: '禁止递归静默删除磁盘内容',
        riskLevel: 'critical'
    },
    {
        pattern: /\brd\s+\/[sS]\s+\/[qQ]\s+[A-Za-z]:\\/i,
        reason: '禁止递归静默删除目录',
        riskLevel: 'critical'
    },
    
    // 注册表操作 (Windows)
    {
        pattern: /\breg\s+(delete|add)\s+HKLM/i,
        reason: '禁止修改系统注册表',
        riskLevel: 'high'
    },
    
    // 环境破坏
    {
        pattern: />\s*\/dev\/sda/i,
        reason: '禁止写入磁盘设备',
        riskLevel: 'critical'
    },
    {
        pattern: />\s*\/dev\/null.*2>&1.*</i,
        reason: '检测到可能的输入重定向攻击',
        riskLevel: 'high'
    },
    
    // 密码/凭证相关
    {
        pattern: /passwd|chpasswd|shadow/i,
        reason: '禁止操作密码相关文件',
        riskLevel: 'high'
    },
    
    // 反弹 Shell
    {
        pattern: /nc\s+-[el]/i,
        reason: '检测到潜在的反弹 Shell',
        riskLevel: 'critical'
    },
    {
        pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/i,
        reason: '检测到反弹 Shell 攻击',
        riskLevel: 'critical'
    },
    {
        pattern: /python.*socket.*connect/i,
        reason: '检测到潜在的网络攻击代码',
        riskLevel: 'high'
    },
];

/**
 * 完全禁止的命令（简单字符串匹配）
 */
export const BLOCKED_COMMANDS: string[] = [
    // 直接的危险命令
    'rm -rf /',
    'rm -rf ~',
    'rm -rf /*',
    'rm -rf *',
    'rm -rf .',
    'del /s /q c:\\',
    'rd /s /q c:\\',
    'format c:',
    ':(){:|:&};:',
    
    // 系统操作
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init 0',
    'init 6',
    
    // 危险的权限操作
    'chmod -R 777 /',
    'chmod 777 /',
    'chown -R root /',
];

// ==================== 命令检查函数 ====================

/**
 * 规范化命令字符串
 */
function normalizeCommand(command: string): string {
    return command
        .trim()
        .replace(/\s+/g, ' ')  // 合并多个空格
        .toLowerCase();
}

/**
 * 检查命令是否在安全列表中
 */
function isSafeCommand(command: string): boolean {
    const normalized = normalizeCommand(command);
    
    for (const safe of SAFE_COMMANDS) {
        const normalizedSafe = safe.toLowerCase();
        // 精确匹配或作为命令前缀
        if (normalized === normalizedSafe || 
            normalized.startsWith(normalizedSafe + ' ') ||
            normalized.startsWith(normalizedSafe + '\t')) {
            return true;
        }
    }
    
    return false;
}

/**
 * 检查命令是否需要确认
 */
function requiresConfirmation(command: string): boolean {
    const normalized = normalizeCommand(command);
    
    for (const confirm of CONFIRM_COMMANDS) {
        const normalizedConfirm = confirm.toLowerCase();
        if (normalized === normalizedConfirm ||
            normalized.startsWith(normalizedConfirm + ' ') ||
            normalized.startsWith(normalizedConfirm + '\t')) {
            return true;
        }
    }
    
    return false;
}

/**
 * 检查命令是否被阻止（简单匹配）
 */
function isBlockedCommand(command: string): { blocked: boolean; reason?: string } {
    const normalized = normalizeCommand(command);
    
    for (const blocked of BLOCKED_COMMANDS) {
        if (normalized.includes(blocked.toLowerCase())) {
            return {
                blocked: true,
                reason: `禁止执行危险命令: ${blocked}`
            };
        }
    }
    
    return { blocked: false };
}

/**
 * 检查命令是否匹配危险模式
 */
function matchesBlockedPattern(command: string): { matched: boolean; reason?: string; riskLevel?: 'high' | 'critical' } {
    const normalized = command.trim();
    
    for (const { pattern, reason, riskLevel } of BLOCKED_COMMAND_PATTERNS) {
        if (pattern.test(normalized)) {
            return { matched: true, reason, riskLevel };
        }
    }
    
    return { matched: false };
}

/**
 * 检查命令是否尝试创建子 shell
 */
function hasSubshellCreation(command: string): boolean {
    const subshellPatterns = [
        /\bsh\s+-c\b/i,
        /\bbash\s+-c\b/i,
        /\bzsh\s+-c\b/i,
        /\bpowershell\s+-[Cc]ommand\b/i,
        /\bpwsh\s+-[Cc]ommand\b/i,
        /\bcmd\s+\/[Cc]\b/i,
        /\$\(.*\)/,  // 命令替换
        /`[^`]+`/,   // 反引号命令替换
    ];
    
    return subshellPatterns.some(pattern => pattern.test(command));
}

/**
 * 检查命令中是否包含危险的重定向
 */
function hasDangerousRedirection(command: string): { dangerous: boolean; reason?: string } {
    const dangerousPatterns = [
        { pattern: />\s*\/etc\//, reason: '禁止写入系统配置目录' },
        { pattern: />\s*\/usr\//, reason: '禁止写入系统目录' },
        { pattern: />\s*\/bin\//, reason: '禁止写入系统二进制目录' },
        { pattern: />\s*\/sbin\//, reason: '禁止写入系统二进制目录' },
        { pattern: />\s*C:\\Windows\\/i, reason: '禁止写入 Windows 系统目录' },
        { pattern: />\s*C:\\Program Files/i, reason: '禁止写入程序目录' },
    ];
    
    for (const { pattern, reason } of dangerousPatterns) {
        if (pattern.test(command)) {
            return { dangerous: true, reason };
        }
    }
    
    return { dangerous: false };
}

// ==================== 主验证函数 ====================

/**
 * 验证命令是否可以执行
 * @param command 要执行的命令
 * @param allowSubshell 是否允许子 shell（默认 false）
 * @returns 命令检查结果
 */
export function validateCommand(command: string, allowSubshell: boolean = false): CommandCheckResult {
    if (!command || command.trim() === '') {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: '命令不能为空',
            riskLevel: 'safe',
            category: 'blocked'
        };
    }
    
    const trimmedCommand = command.trim();
    
    // 1. 检查是否被完全禁止
    const blockedCheck = isBlockedCommand(trimmedCommand);
    if (blockedCheck.blocked) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: blockedCheck.reason,
            riskLevel: 'critical',
            category: 'blocked'
        };
    }
    
    // 2. 检查是否匹配危险模式
    const patternCheck = matchesBlockedPattern(trimmedCommand);
    if (patternCheck.matched) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: patternCheck.reason,
            riskLevel: patternCheck.riskLevel,
            category: 'blocked'
        };
    }
    
    // 3. 检查子 shell
    if (!allowSubshell && hasSubshellCreation(trimmedCommand)) {
        if (!COMMAND_EXECUTION_LIMITS.allowSubshell) {
            return {
                allowed: false,
                requiresConfirmation: true,
                reason: '检测到子 shell 创建，需要额外确认',
                riskLevel: 'medium',
                category: 'confirm'
            };
        }
    }
    
    // 4. 检查危险重定向
    const redirectionCheck = hasDangerousRedirection(trimmedCommand);
    if (redirectionCheck.dangerous) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: redirectionCheck.reason,
            riskLevel: 'high',
            category: 'blocked'
        };
    }
    
    // 5. 检查是否为安全命令
    if (isSafeCommand(trimmedCommand)) {
        return {
            allowed: true,
            requiresConfirmation: false,
            riskLevel: 'safe',
            category: 'safe'
        };
    }
    
    // 6. 检查是否需要确认
    if (requiresConfirmation(trimmedCommand)) {
        return {
            allowed: true,
            requiresConfirmation: true,
            reason: '此命令需要用户确认后执行',
            riskLevel: 'low',
            category: 'confirm'
        };
    }
    
    // 7. 默认：允许但需要确认（未知命令）
    return {
        allowed: true,
        requiresConfirmation: true,
        reason: '未知命令，需要用户确认',
        riskLevel: 'medium',
        category: 'confirm'
    };
}

/**
 * 验证工作目录是否安全
 */
export function validateWorkingDirectory(cwd: string, projectRootPath: string): CommandCheckResult {
    if (!cwd) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: '必须指定工作目录',
            riskLevel: 'medium',
            category: 'blocked'
        };
    }
    
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase();
    const normalizedRoot = projectRootPath.replace(/\\/g, '/').toLowerCase();
    
    // 检查是否在项目目录内
    if (!normalizedCwd.startsWith(normalizedRoot)) {
        // 检查是否在允许的其他目录
        const appDataPath = window['path']?.getAppDataPath?.()?.replace(/\\/g, '/').toLowerCase();
        if (appDataPath && normalizedCwd.startsWith(appDataPath)) {
            return { allowed: true, requiresConfirmation: false, category: 'safe' };
        }
        
        return {
            allowed: false,
            requiresConfirmation: true,
            reason: '工作目录不在项目范围内，需要确认',
            riskLevel: 'medium',
            category: 'confirm'
        };
    }
    
    return { allowed: true, requiresConfirmation: false, category: 'safe' };
}

/**
 * 获取命令的风险等级描述
 */
export function getRiskLevelDescription(riskLevel: string): string {
    switch (riskLevel) {
        case 'safe':
            return '安全 - 该命令是只读操作或已知安全命令';
        case 'low':
            return '低风险 - 该命令可能修改文件系统';
        case 'medium':
            return '中等风险 - 该命令可能产生较大影响';
        case 'high':
            return '高风险 - 该命令可能导致数据丢失或安全问题';
        case 'critical':
            return '严重风险 - 该命令可能导致系统损坏或数据丢失';
        default:
            return '未知风险';
    }
}

/**
 * 判断命令是否需要超时限制
 */
export function shouldApplyTimeout(command: string): boolean {
    const noTimeoutCommands = [
        'npm run dev',
        'npm run serve',
        'npm start',
        'yarn dev',
        'yarn serve',
        'yarn start',
        'python -m http.server',
        'live-server',
        'webpack-dev-server',
        'nodemon',
    ];
    
    const normalized = normalizeCommand(command);
    return !noTimeoutCommands.some(cmd => normalized.includes(cmd.toLowerCase()));
}

// ==================== 导出 ====================

export const CommandSecurity = {
    validateCommand,
    validateWorkingDirectory,
    isSafeCommand,
    requiresConfirmation,
    isBlockedCommand,
    matchesBlockedPattern,
    hasSubshellCreation,
    hasDangerousRedirection,
    getRiskLevelDescription,
    shouldApplyTimeout,
    COMMAND_EXECUTION_LIMITS,
    SAFE_COMMANDS,
    CONFIRM_COMMANDS,
    BLOCKED_COMMANDS,
    BLOCKED_COMMAND_PATTERNS,
};

export default CommandSecurity;
