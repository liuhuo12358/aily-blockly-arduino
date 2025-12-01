import { injectTodoReminder } from "./todoWriteTool";
import { ConfigService } from '../../../services/config.service';

interface BoardItem {
    name: string;
    nickname: string;
    description: string;
    keywords?: string[];
    brand?: string;
    type?: string;
    [key: string]: any;
}

interface LibraryItem {
    name: string;
    nickname: string;
    description: string;
    keywords: string[];
    core?: string[];
    author?: string;
    compatibility?: {
        core?: string[];
        [key: string]: any;
    };
    [key: string]: any;
}

type SearchItem = BoardItem | LibraryItem;

/**
 * 搜索开发板和库工具 - 专门针对 boards.json 和 libraries.json 的高效搜索
 * 
 * 此工具针对已知的 JSON 格式进行优化搜索，直接返回 name 和 description 字段。
 * 搜索优先级：keyword > description > core > name/nickname
 * 
 * @example
 * // 搜索包含 "esp32" 的开发板
 * searchBoardsLibraries({ query: "esp32", type: "boards", configService })
 * 
 * // 搜索包含 "servo" 的库
 * searchBoardsLibraries({ query: "servo", type: "libraries", configService })
 * 
 * // 同时搜索开发板和库
 * searchBoardsLibraries({ query: "温度传感器", configService })
 */
export const searchBoardsLibrariesTool = {
    name: 'search_boards_libraries',
    description: `专门用于搜索开发板(boards.json)和库(libraries.json)的高效工具。

**功能特点：**
- ✅ 支持多关键词搜索（数组或逗号分隔字符串）
- ✅ 支持模糊匹配
- ✅ 忽略大小写
- ✅ 智能分词（自动分割逗号、空格分隔的关键词）
- ✅ 按匹配度排序

**使用场景：**
1. 查找特定功能的库（如"温度传感器"、"舵机"、"OLED"）
2. 查找支持特定芯片的开发板（如"esp32"、"arduino"）
3. 查找作者或品牌相关的硬件（如"adafruit"、"seeed"）
4. 同时搜索多个关键词（如"esp32, wifi"或["temperature", "sensor"]）

**注意：**
- 返回结果默认限制在前50条最相关匹配
- 使用此工具而非通用grep工具可以获得更精确、更快速的结果
- 多关键词搜索时，匹配任一关键词即可返回结果（OR逻辑）`,
    
    parameters: {
        type: 'object',
        properties: {
            query: {
                oneOf: [
                    {
                        type: 'string',
                        description: '搜索关键词，支持中英文。可以是单个关键词或逗号/空格分隔的多个关键词。例如：esp32, "温度传感器, 湿度", "servo OLED"'
                    },
                    {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: '搜索关键词数组。例如：["esp32", "wifi"], ["temperature", "sensor"]'
                    }
                ],
                description: '搜索关键词。支持字符串（单个或逗号/空格分隔）或字符串数组。忽略大小写，支持模糊匹配。'
            },
            type: {
                type: 'string',
                enum: ['boards', 'libraries', 'both'],
                description: '搜索类型：boards(仅开发板), libraries(仅库), both(同时搜索)。默认为 both'
            },
            maxResults: {
                type: 'number',
                description: '最大返回结果数，默认50'
            }
        },
        required: ['query']
    },
    
    handler: async (
        params: { 
            query: string | string[]; 
            type?: 'boards' | 'libraries' | 'both';
            maxResults?: number;
        },
        configService: ConfigService
    ) => {
        const { query, type = 'both', maxResults = 50 } = params;
        
        // 处理查询参数 - 支持字符串、数组、逗号分隔、空格分隔
        let queryList: string[] = [];
        
        if (!query) {
            const toolResult = {
                is_error: true,
                content: '搜索关键词不能为空'
            };
            return injectTodoReminder(toolResult, 'search_boards_libraries');
        }
        
        if (typeof query === 'string') {
            const trimmed = query.trim();
            if (trimmed.length === 0) {
                const toolResult = {
                    is_error: true,
                    content: '搜索关键词不能为空'
                };
                return injectTodoReminder(toolResult, 'search_boards_libraries');
            }
            
            // 尝试解析 JSON 数组字符串
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        queryList = parsed.map(q => String(q).trim()).filter(q => q);
                    }
                } catch {
                    // JSON 解析失败，当作普通字符串处理
                }
            }
            
            // 如果不是数组或解析失败，按分隔符拆分
            if (queryList.length === 0) {
                // 先按逗号分割，再按空格分割
                queryList = trimmed.split(/[,，]/).flatMap(part => 
                    part.trim().split(/\s+/)
                ).filter(q => q);
            }
        } else if (Array.isArray(query)) {
            queryList = query.map(q => String(q).trim()).filter(q => q);
        }
        
        if (queryList.length === 0) {
            const toolResult = {
                is_error: true,
                content: '搜索关键词不能为空'
            };
            return injectTodoReminder(toolResult, 'search_boards_libraries');
        }
        
        // 转换为小写用于匹配
        const queryListLower = queryList.map(q => q.toLowerCase());

        let results: Array<{
            source: 'board' | 'library';
            name: string;
            nickname: string;
            description: string;
            score: number;
            matchedFields: string[];
            matchedQueries: string[];
        }> = [];

        try {
            // 搜索开发板 - 直接从 ConfigService 获取
            if (type === 'boards' || type === 'both') {
                const boardsData = configService.boardList as BoardItem[];
                if (boardsData && boardsData.length > 0) {
                    results.push(...searchInArray(boardsData, queryListLower, 'board'));
                }
            }

            // 搜索库 - 直接从 ConfigService 获取
            if (type === 'libraries' || type === 'both') {
                const librariesData = configService.libraryList as LibraryItem[];
                if (librariesData && librariesData.length > 0) {
                    results.push(...searchInArray(librariesData, queryListLower, 'library'));
                }
            }

            // 按分数排序并限制结果数
            results.sort((a, b) => b.score - a.score);
            results = results.slice(0, maxResults);

            if (results.length === 0) {
                const queryDisplay = queryList.join(', ');
                const toolResult = {
                    is_error: false,
                    content: `未找到与 "${queryDisplay}" 匹配的结果\n\n搜索范围: ${type === 'both' ? '开发板和库' : type === 'boards' ? '开发板' : '库'}\n建议：尝试使用更通用的关键词或检查拼写`
                };
                return injectTodoReminder(toolResult, 'search_boards_libraries');
            }

            // 格式化输出
            const queryDisplay = queryList.join(', ');
            let resultContent = `找到 ${results.length} 个匹配项（关键词: "${queryDisplay}"）\n`;
            resultContent += `搜索范围: ${type === 'both' ? '开发板和库' : type === 'boards' ? '开发板' : '库'}\n\n`;

            results.forEach((item, index) => {
                // const sourceLabel = item.source === 'board' ? '📟 开发板' : '📦 库';
                // resultContent += `━━━ [${index + 1}] ${sourceLabel} ━━━\n`;
                resultContent += `[${index + 1}]\n`;
                resultContent += `名称: ${item.name}\n`;
                if (item.nickname && item.nickname !== item.name) {
                    resultContent += `别名: ${item.nickname}\n`;
                }
                resultContent += `描述: ${item.description}\n`;
                // resultContent += `匹配字段: ${item.matchedFields.join(', ')}\n`;
                // resultContent += `匹配度: ${item.score}\n\n`;
            });

            const toolResult = {
                is_error: false,
                content: resultContent,
                metadata: {
                    totalMatches: results.length,
                    query: queryList,
                    searchType: type,
                    results: results.map(r => ({
                        source: r.source,
                        name: r.name,
                        nickname: r.nickname,
                        description: r.description,
                        matchedQueries: r.matchedQueries
                    }))
                }
            };
            return injectTodoReminder(toolResult, 'search_boards_libraries');

        } catch (error) {
            const toolResult = {
                is_error: true,
                content: `搜索失败: ${error instanceof Error ? error.message : String(error)}`
            };
            return injectTodoReminder(toolResult, 'search_boards_libraries');
        }
    }
};

/**
 * 在数组中搜索匹配项 - 支持多关键词搜索
 * 采用智能匹配策略：优先精确词匹配，其次才是模糊匹配
 */
function searchInArray(
    items: SearchItem[], 
    queryList: string[], 
    source: 'board' | 'library'
): Array<{
    source: 'board' | 'library';
    name: string;
    nickname: string;
    description: string;
    score: number;
    matchedFields: string[];
    matchedQueries: string[];
}> {
    const results: Array<{
        source: 'board' | 'library';
        name: string;
        nickname: string;
        description: string;
        score: number;
        matchedFields: string[];
        matchedQueries: string[];
    }> = [];

    for (const item of items) {
        let totalScore = 0;
        const matchedFields: string[] = [];
        const matchedQueries: string[] = [];

        // 对每个查询关键词进行匹配
        for (const query of queryList) {
            let queryScore = 0;
            let queryMatched = false;

            // 1. 优先匹配 keywords（权重: 10）
            if ('keywords' in item && item.keywords) {
                const keywords = Array.isArray(item.keywords) ? item.keywords : [];
                for (const keyword of keywords) {
                    const keywordLower = keyword.toLowerCase();
                    // 精确词匹配
                    if (keywordLower === query) {
                        queryScore += 15; // 精确匹配权重更高
                        queryMatched = true;
                    } 
                    // 单词边界匹配（如 "ai" 匹配 "ai-project" 但不匹配 "aily"）
                    else if (matchesWordBoundary(keywordLower, query)) {
                        queryScore += 12;
                        queryMatched = true;
                    }
                    // 模糊匹配（部分包含）
                    else if (keywordLower.includes(query)) {
                        queryScore += 8;
                        queryMatched = true;
                    }
                    
                    if (queryMatched && !matchedFields.includes('keywords')) {
                        matchedFields.push('keywords');
                    }
                }
            }

            // 2. 匹配 description（权重: 5）
            if (item.description) {
                const descLower = item.description.toLowerCase();
                if (descLower === query) {
                    queryScore += 10;
                    queryMatched = true;
                } else if (matchesWordBoundary(descLower, query)) {
                    queryScore += 7;
                    queryMatched = true;
                } else if (descLower.includes(query)) {
                    queryScore += 4;
                    queryMatched = true;
                }
                
                if (queryMatched && !matchedFields.includes('description')) {
                    matchedFields.push('description');
                }
            }

            // 3. 匹配 core（仅库，权重: 3）
            if (source === 'library' && 'compatibility' in item && item.compatibility?.core) {
                const cores = item.compatibility.core;
                for (const core of cores) {
                    const coreLower = core.toLowerCase();
                    if (coreLower === query) {
                        queryScore += 8;
                        queryMatched = true;
                    } else if (matchesWordBoundary(coreLower, query)) {
                        queryScore += 5;
                        queryMatched = true;
                    } else if (coreLower.includes(query)) {
                        queryScore += 2;
                        queryMatched = true;
                    }
                }
                
                if (queryMatched && !matchedFields.includes('core')) {
                    matchedFields.push('core');
                }
            }

            // 4. 匹配 name/nickname（权重: 2）
            // 注意：对于包含 @aily-project 的项目名称，避免模糊匹配
            if (item.name) {
                const nameLower = item.name.toLowerCase();
                // 标记是否为 aily-project 项目
                const isAilyProject = nameLower.includes('@aily-project');
                
                if (nameLower === query) {
                    queryScore += 20; // 完全匹配名称，权重最高
                    queryMatched = true;
                } else if (matchesWordBoundary(nameLower, query)) {
                    queryScore += 10;
                    queryMatched = true;
                } else if (!isAilyProject && nameLower.includes(query)) {
                    // 只对非 @aily-project 项目使用模糊匹配
                    queryScore += 3;
                    queryMatched = true;
                }
                
                if (queryMatched && !matchedFields.includes('name')) {
                    matchedFields.push('name');
                }
            }
            
            if (item.nickname) {
                const nicknameLower = item.nickname.toLowerCase();
                if (nicknameLower === query) {
                    queryScore += 18;
                    queryMatched = true;
                } else if (matchesWordBoundary(nicknameLower, query)) {
                    queryScore += 9;
                    queryMatched = true;
                } else if (nicknameLower.includes(query)) {
                    queryScore += 3;
                    queryMatched = true;
                }
                
                if (queryMatched && !matchedFields.includes('nickname')) {
                    matchedFields.push('nickname');
                }
            }

            // 5. 匹配 brand/author（权重: 1）
            // 特别处理：避免 @aily-project 这种项目标识被误匹配
            if ('brand' in item && item.brand) {
                const brandLower = item.brand.toLowerCase();
                // 避免将"aily"当作品牌名
                const isFrameworkName = brandLower.includes('aily') || brandLower.includes('@');
                
                if (brandLower === query) {
                    queryScore += 6;
                    queryMatched = true;
                } else if (matchesWordBoundary(brandLower, query)) {
                    queryScore += 4;
                    queryMatched = true;
                } else if (!isFrameworkName && brandLower.includes(query)) {
                    // 只对真正的品牌使用模糊匹配，避免框架名污染
                    queryScore += 1;
                    queryMatched = true;
                }
                
                if (queryMatched && !matchedFields.includes('brand')) {
                    matchedFields.push('brand');
                }
            }
            
            if ('author' in item && item.author) {
                const authorLower = item.author.toLowerCase();
                // 避免将框架名作为作者名
                const isFrameworkName = authorLower.includes('aily') || authorLower.includes('@');
                
                if (authorLower === query) {
                    queryScore += 6;
                    queryMatched = true;
                } else if (matchesWordBoundary(authorLower, query)) {
                    queryScore += 4;
                    queryMatched = true;
                } else if (!isFrameworkName && authorLower.includes(query)) {
                    // 只对真正的作者名使用模糊匹配
                    queryScore += 1;
                    queryMatched = true;
                }
                
                if (queryMatched && !matchedFields.includes('author')) {
                    matchedFields.push('author');
                }
            }

            // 如果该关键词有匹配，累加分数
            if (queryMatched) {
                totalScore += queryScore;
                matchedQueries.push(query);
            }
        }

        // 如果有任何匹配（OR逻辑），添加到结果
        if (totalScore > 0) {
            results.push({
                source,
                name: item.name,
                nickname: item.nickname || '',
                description: item.description,
                score: totalScore,
                matchedFields,
                matchedQueries
            });
        }
    }

    return results;
}

/**
 * 单词边界匹配 - 检查query是否作为独立单词出现在text中
 * 例如：matchesWordBoundary("ai-project", "ai") -> true
 *       matchesWordBoundary("aily", "ai") -> false
 *       matchesWordBoundary("@aily-project", "ai") -> false
 */
function matchesWordBoundary(text: string, query: string): boolean {
    // 分隔符：空格、-、_、/、@、:、.、,、;、(、)、[、]、{、}、中文标点等
    const delimiters = /[\s\-_\/@:.,;()\[\]{}，。！？；：、""''【】《》（）]/;
    
    // 查找query在text中的所有位置
    let index = 0;
    while ((index = text.indexOf(query, index)) !== -1) {
        // 检查query前面是否是单词边界或字符串开始
        const beforeOk = index === 0 || delimiters.test(text[index - 1]);
        
        // 检查query后面是否是单词边界或字符串结束
        const afterIndex = index + query.length;
        const afterOk = afterIndex === text.length || delimiters.test(text[afterIndex]);
        
        // 如果前后都满足边界条件，则匹配
        if (beforeOk && afterOk) {
            return true;
        }
        
        index++;
    }
    
    return false;
}
