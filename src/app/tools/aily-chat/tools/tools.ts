export const toolParamNames = [
    "command"
] as const;

export type ToolParamName = (typeof toolParamNames)[number];

// export interface ToolUse {
//     type: "tool_use"
//     name: ToolName
// }

export interface ToolUseResult {
    is_error: boolean;
    content: string;
}

export const TOOLS = [
    {
        name: 'create_project',
        description: `创建一个新项目，返回项目路径。需要提供开发板信息，包含名称、昵称和版本号。`,
        input_schema: {
            type: 'object',
            properties: {
                board: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: '板子名称' },
                        nickname: { type: 'string', description: '板子昵称' },
                        version: { type: 'string', description: '版本号' }
                    },
                    description: '开发板信息'
                },
            },
            required: ['board']
        }
    },
    {
        name: 'execute_command',
        description: `执行系统CLI命令。用于执行系统操作或运行特定命令来完成用户任务中的任何步骤。支持命令链，优先使用相对命令和路径以保持终端一致性。`,
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: '执行的命令' },
                cwd: { type: 'string', description: '工作目录，可选' }
            },
            required: ['command']
        }
    },
    {
        name: "get_context",
        description: `获取当前的环境上下文信息，包括项目路径、当前平台、系统环境等。可以指定获取特定类型的上下文信息。`,
        input_schema: {
            type: 'object',
            properties: {
                info_type: {
                    type: 'string',
                    description: '要获取的上下文信息类型',
                    enum: ['all', 'project', 'platform', 'system'],
                    default: 'all'
                }
            },
            required: ['info_type']
        }
    },
    {
        name: "list_directory",
        description: `列出指定目录的内容，包括文件和文件夹信息。返回每个项目的名称、类型、大小和修改时间。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要列出内容的目录路径'
                }
            },
            required: ['path']
        }
    },
    {
        name: "read_file",
        description: `读取指定文件的内容。支持文本文件的读取，可指定编码格式。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要读取的文件路径'
                },
                encoding: {
                    type: 'string',
                    description: '文件编码格式',
                    default: 'utf-8'
                }
            },
            required: ['path']
        }
    },
    {
        name: "create_file",
        description: `创建新文件并写入内容。如果目录不存在会自动创建。可选择是否覆盖已存在的文件。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要创建的文件路径'
                },
                content: {
                    type: 'string',
                    description: '文件内容',
                    default: ''
                },
                encoding: {
                    type: 'string',
                    description: '文件编码格式',
                    default: 'utf-8'
                },
                overwrite: {
                    type: 'boolean',
                    description: '是否覆盖已存在的文件',
                    default: false
                }
            },
            required: ['path']
        }
    },
    {
        name: "create_folder",
        description: `创建新文件夹。支持递归创建多级目录。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要创建的文件夹路径'
                },
                recursive: {
                    type: 'boolean',
                    description: '是否递归创建父目录',
                    default: true
                }
            },
            required: ['path']
        }
    },
    {
        name: "edit_file",
        description: `编辑已存在的文件内容。可选择当文件不存在时是否创建新文件。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要编辑的文件路径'
                },
                content: {
                    type: 'string',
                    description: '新的文件内容'
                },
                encoding: {
                    type: 'string',
                    description: '文件编码格式',
                    default: 'utf-8'
                },
                createIfNotExists: {
                    type: 'boolean',
                    description: '如果文件不存在是否创建',
                    default: false
                }
            },
            required: ['path', 'content']
        }
    },
    {
        name: "delete_file",
        description: `删除指定文件。可选择是否在删除前创建备份。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要删除的文件路径'
                },
                createBackup: {
                    type: 'boolean',
                    description: '删除前是否创建备份',
                    default: true
                }
            },
            required: ['path']
        }
    },
    {
        name: "delete_folder",
        description: `删除指定文件夹及其内容。可选择是否在删除前创建备份。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要删除的文件夹路径'
                },
                createBackup: {
                    type: 'boolean',
                    description: '删除前是否创建备份',
                    default: true
                },
                recursive: {
                    type: 'boolean',
                    description: '是否递归删除',
                    default: true
                }
            },
            required: ['path']
        }
    },
    {
        name: "check_exists",
        description: `检查指定路径的文件或文件夹是否存在，返回详细信息包括类型、大小、修改时间等。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要检查的路径'
                },
                type: {
                    type: 'string',
                    description: '期望的类型：file(文件)、folder(文件夹)或any(任意类型)',
                    enum: ['file', 'folder', 'any'],
                    default: 'any'
                }
            },
            required: ['path']
        }
    },
    {
        name: "get_directory_tree",
        description: `获取指定目录的树状结构，可控制遍历深度和是否包含文件。适合了解项目结构。`,
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: '要获取树状结构的目录路径'
                },
                maxDepth: {
                    type: 'number',
                    description: '最大遍历深度',
                    default: 3
                },
                includeFiles: {
                    type: 'boolean',
                    description: '是否包含文件（false时只显示文件夹）',
                    default: true
                }
            },
            required: ['path']
        }
    },
    {
        name: "fetch",
        description: `获取网络上的信息和资源，支持HTTP/HTTPS请求，能够处理大文件下载。支持多种请求方法和响应类型。`,
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: '要请求的URL地址'
                },
                method: {
                    type: 'string',
                    description: 'HTTP请求方法',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    default: 'GET'
                },
                headers: {
                    type: 'object',
                    description: '请求头（键值对）'
                },
                body: {
                    description: '请求体'
                },
                timeout: {
                    type: 'number',
                    description: '请求超时时间（毫秒）',
                    default: 30000
                },
                maxSize: {
                    type: 'number',
                    description: '最大文件大小（字节）',
                    default: 52428800
                },
                responseType: {
                    type: 'string',
                    description: '响应类型',
                    enum: ['text', 'json', 'blob', 'arraybuffer'],
                    default: 'text'
                }
            },
            required: ['url']
        }
    },
    {
        name: "reload_abi_json",
        description: `重新加载 project.abi 数据到 Blockly 工作区。可以从文件加载或直接提供 JSON 数据。适用于需要刷新 Blockly 块数据的场景。`,
        input_schema: {
            type: 'object',
            properties: {
                projectPath: {
                    type: 'string',
                    description: '项目路径，如果不提供将使用当前项目路径'
                },
                jsonData: {
                    type: 'object',
                    description: '直接提供.abi文件的内容'
                }
            },
            required: []
        }
    },
    {
        name: "edit_abi_file",
        description: `编辑ABI文件工具。支持多种编辑模式：1) 替换整个文件内容（默认）；2) 在指定行插入内容；3) 替换指定行或行范围；4) 追加到文件末尾。自动查找当前路径下的.abi文件，如果不存在会自动创建。`,
        input_schema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: '要写入的内容。替换模式下必须是有效的JSON格式；插入/替换模式下可以是任意文本内容'
                },
                insertLine: {
                    type: 'number',
                    description: '插入行号（从1开始）。指定此参数时会在该行插入内容'
                },
                replaceStartLine: {
                    type: 'number',
                    description: '替换起始行号（从1开始）。指定此参数时会替换指定行的内容'
                },
                replaceEndLine: {
                    type: 'number',
                    description: '替换结束行号（从1开始）。与replaceStartLine配合使用，可替换多行内容。如不指定则只替换起始行'
                },
                replaceMode: {
                    type: 'boolean',
                    description: '是否替换整个文件内容。true=替换整个文件（默认），false=执行其他操作（插入、替换行、追加）',
                    default: true
                }
            },
            required: ['content']
        }
    },
    {
        name: "smart_block_tool",
        description: `智能块操作工具。创建、配置和操作Blockly工作区中的块。支持创建各种类型的块，配置字段值和输入连接，自动处理位置和变量创建。可以创建独立块（如全局变量、函数定义）或连接到父级块。`,
        input_schema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: '块类型，如 logic_boolean、controls_if、math_number 等'
                },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X坐标' },
                        y: { type: 'number', description: 'Y坐标' }
                    },
                    description: '块在工作区中的位置'
                },
                fields: {
                    type: 'object',
                    description: '块的字段配置，如布尔值、数字值、变量名等'
                },
                inputs: {
                    type: 'object',
                    description: '块的输入配置，连接其他块'
                },
                parentConnection: {
                    type: 'object',
                    properties: {
                        blockId: { type: 'string', description: '父块ID' },
                        connectionType: { type: 'string', description: '连接类型' },
                        inputName: { type: 'string', description: '输入名称' }
                    },
                    description: '父块连接配置（可选）。不提供时创建独立块，适用于全局变量、函数定义等顶级代码块'
                },
                createVariables: {
                    type: 'boolean',
                    description: '是否自动创建所需变量',
                    default: true
                }
            },
            required: ['type']
        }
    },
    {
        name: "connect_blocks_tool",
        description: `块连接工具。连接两个Blockly块，支持三种连接类型：next（顺序连接）、input（输入连接）、statement（语句连接）。自动处理连接验证和错误检查，智能识别块类型并自动选择最佳连接方式。`,
        input_schema: {
            type: 'object',
            properties: {
                sourceBlock: {
                    type: 'string',
                    description: '输出块ID（提供连接的块）'
                },
                targetBlock: {
                    type: 'string', 
                    description: '接收块ID（接收连接的块）'
                },
                connectionType: {
                    type: 'string',
                    enum: ['next', 'input', 'statement'],
                    description: '连接类型：next=顺序连接，input=输入连接，statement=语句连接（推荐，支持指定inputName，用于事件处理块和容器块）'
                },
                inputName: {
                    type: 'string',
                    description: '输入名称（input和statement连接类型时可指定具体连接点，不指定时系统会自动检测最佳连接点）'
                }
            },
            required: ['sourceBlock', 'targetBlock', 'connectionType']
        }
    },
    {
        name: "create_code_structure_tool", 
        description: `动态结构创建工具。使用动态结构处理器创建任意复杂的代码块结构，支持自定义块组合和连接规则。`,
        input_schema: {
            type: 'object',
            properties: {
                structure: {
                    type: 'string',
                    description: '结构名称（任意字符串，用于日志和元数据）'
                },
                config: {
                    type: 'object',
                    properties: {
                        structureDefinition: {
                            type: 'object',
                            properties: {
                                rootBlock: {
                                    type: 'object',
                                    description: '根块配置'
                                },
                                additionalBlocks: {
                                    type: 'array',
                                    items: { type: 'object' },
                                    description: '附加块配置数组'
                                },
                                connectionRules: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            source: { type: 'string', description: '输出块引用' },
                                            target: { type: 'string', description: '接收块引用' },
                                            inputName: { type: 'string', description: '接收块的输入名称' },
                                            connectionType: { 
                                                type: 'string', 
                                                enum: ['next', 'input', 'statement'],
                                                description: '连接类型' 
                                            }
                                        },
                                        required: ['source', 'target']
                                    },
                                    description: '块连接规则'
                                }
                            },
                            required: ['rootBlock'],
                            description: '动态结构定义'
                        }
                    },
                    required: ['structureDefinition'],
                    description: '结构配置'
                },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X坐标' },
                        y: { type: 'number', description: 'Y坐标' }
                    },
                    description: '结构在工作区中的位置'
                },
                insertPosition: {
                    type: 'string',
                    enum: ['workspace', 'after', 'before', 'input', 'statement', 'append'],
                    description: '插入位置：workspace=独立放置，after=目标块后，before=目标块前，input=目标块输入，statement=statement连接（用于hat块），append=追加到工作区'
                },
                targetBlock: {
                    type: 'string',
                    description: '目标块ID（当insertPosition不是workspace时必需）'
                },
                targetInput: {
                    type: 'string',
                    description: '目标输入名（当insertPosition是input时必需）'
                }
            },
            required: ['structure']
        }
    },
    {
        name: "configure_block_tool",
        description: `块配置工具。修改现有块的属性，包括字段值、输入连接、样式等。支持批量配置和属性验证。`,
        input_schema: {
            type: 'object',
            properties: {
                blockId: {
                    type: 'string',
                    description: '要配置的块ID'
                },
                fields: {
                    type: 'object',
                    description: '要更新的字段值'
                },
                inputs: {
                    type: 'object', 
                    description: '要更新的输入连接'
                },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X坐标' },
                        y: { type: 'number', description: 'Y坐标' }
                    },
                    description: '新位置'
                },
                style: {
                    type: 'object',
                    description: '块的样式配置'
                }
            },
            required: ['blockId']
        }
    },
    {
        name: "variable_manager_tool",
        description: `变量管理工具。创建、删除、重命名工作区中的变量。支持不同类型的变量和作用域管理。`,
        input_schema: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['create', 'delete', 'rename', 'list'],
                    description: '操作类型：create=创建，delete=删除，rename=重命名，list=列出所有变量'
                },
                variableName: {
                    type: 'string',
                    description: '变量名（create、delete、rename时必需）'
                },
                newName: {
                    type: 'string',
                    description: '新变量名（rename时必需）'
                },
                variableType: {
                    type: 'string',
                    description: '变量类型，如String、Number、Boolean等',
                    default: 'String'
                }
            },
            required: ['operation']
        }
    },
    {
        name: "find_block_tool",
        description: `块查找工具。在工作区中查找特定的块，支持多种查找条件：块类型、字段值、位置等。返回匹配的块信息。`,
        input_schema: {
            type: 'object', 
            properties: {
                criteria: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', description: '块类型' },
                        fields: { type: 'object', description: '字段值匹配' },
                        position: { 
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                                tolerance: { type: 'number', description: '位置容差' }
                            },
                            description: '位置匹配'
                        },
                        connected: { type: 'boolean', description: '是否已连接' }
                    },
                    description: '查找条件'
                },
                limit: {
                    type: 'number',
                    description: '返回结果数量限制',
                    default: 10
                },
                includeMetadata: {
                    type: 'boolean',
                    description: '是否包含详细元数据',
                    default: false
                }
            },
            required: ['criteria']
        }
    },
    {
        name: "delete_block_tool",
        description: `块删除工具。通过块ID删除工作区中的指定块。支持两种删除模式：普通删除（只删除指定块，保留连接的块）和级联删除（删除整个块树，包括所有连接的子块）。`,
        input_schema: {
            type: 'object',
            properties: {
                blockId: {
                    type: 'string',
                    description: '要删除的块的ID'
                },
                cascade: {
                    type: 'boolean',
                    description: '是否级联删除连接的块。false=只删除指定块，true=删除整个块树',
                    default: false
                }
            },
            required: ['blockId']
        }
    },
    {
        name: "get_workspace_overview_tool",
        description: `工作区全览分析工具。提供工作区的完整分析，包括结构分析、代码生成、复杂度评估、连接关系和树状结构展示。支持多种输出格式：JSON、Markdown、详细报告和控制台输出。`,
        input_schema: {
            type: 'object',
            properties: {
                outputFormat: {
                    type: 'string',
                    enum: ['json', 'markdown', 'detailed', 'console'],
                    description: '输出格式',
                    default: 'console'
                },
                includeCode: {
                    type: 'boolean',
                    description: '是否包含生成的C++代码',
                    default: true
                },
                includeStructure: {
                    type: 'boolean',
                    description: '是否包含结构分析',
                    default: true
                },
                includeConnections: {
                    type: 'boolean',
                    description: '是否包含连接关系分析',
                    default: true
                },
                includeComplexity: {
                    type: 'boolean',
                    description: '是否包含复杂度分析',
                    default: true
                },
                maxDepth: {
                    type: 'number',
                    description: '树状结构的最大深度',
                    default: 10
                },
                showDetails: {
                    type: 'boolean',
                    description: '是否显示详细信息',
                    default: false
                }
            },
            required: []
        }
    }
]
