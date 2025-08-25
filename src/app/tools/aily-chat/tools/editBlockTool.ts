import { ToolUseResult } from "./tools";

/**
 * Blockly 可视化编程助手 - 高级块编辑工具
 * 提供简化的 Blockly 块操作接口，避免复杂的 ABI JSON 生成
 */

// =============================================================================
// 类型定义
// =============================================================================

interface Position {
  x?: number;
  y?: number;
}

interface BlockReference {
  id?: string;
  type?: string;
  position?: 'first' | 'last' | 'selected';
}

interface FieldConfig {
  [fieldName: string]: any;
}

interface InputConfig {
  [inputName: string]: {
    block?: BlockConfig;
    shadow?: BlockConfig;
    connection?: 'value' | 'statement';
  };
}

interface BlockConfig {
  type: string;
  fields?: FieldConfig;
  inputs?: InputConfig;
  position?: Position;
  id?: string;
}

interface ConnectionConfig {
  blockId: string;
  connectionType: 'next' | 'input';
  inputName?: string;
}

interface VariableConfig {
  name: string;
  type: 'int' | 'float' | 'string' | 'bool';
  scope: 'global' | 'local';
  initialValue?: any;
  autoDefine?: boolean;
}

// =============================================================================
// 主要工具函数
// =============================================================================

/**
 * 1. 智能块创建工具
 */
interface SmartBlockArgs {
  type: string;
  position?: Position;
  fields?: FieldConfig;
  inputs?: InputConfig;
  parentConnection?: ConnectionConfig;
  createVariables?: boolean;
}

interface SmartBlockResult extends ToolUseResult {
  metadata?: {
    blockId: string;
    blockType: string;
    position: Position;
    variablesCreated?: string[];
  };
}

export async function smartBlockTool(
  toolArgs: SmartBlockArgs
): Promise<SmartBlockResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🚀 smartBlockTool 开始执行');
  console.log('📦 接收到的参数:', JSON.stringify(toolArgs, null, 2));

  try {
    let { type, position, fields, inputs, parentConnection, createVariables = true } = toolArgs;

    // 🔧 参数修复和转换
    console.log('� 开始参数修复和转换...');
    
    // 修复 position 参数
    if (typeof position === 'string') {
      console.log(`⚠️ position 是字符串 "${position}"，尝试解析...`);
      try {
        // 尝试解析为 JSON 对象
        if ((position as string).trim().startsWith('{')) {
          position = JSON.parse(position as string);
          console.log(`✅ position JSON 解析成功: ${JSON.stringify(position)}`);
        }
        // 尝试解析为逗号分隔的坐标
        else if ((position as string).includes(',')) {
          const [x, y] = (position as string).split(',').map(v => parseInt(v.trim()) || 0);
          position = { x, y };
          console.log(`✅ position 坐标解析成功: ${JSON.stringify(position)}`);
        } 
        // 默认位置
        else {
          position = { x: 0, y: 0 };
          console.log(`✅ position 设为默认值: ${JSON.stringify(position)}`);
        }
      } catch (error) {
        console.error(`❌ position 解析失败: ${(error as Error).message}`);
        position = { x: 0, y: 0 };
        console.log(`✅ position 设为默认值: ${JSON.stringify(position)}`);
      }
    }

    // 修复 fields 参数
    if (typeof fields === 'string') {
      console.log(`⚠️ fields 是字符串 "${fields}"，尝试解析...`);
      try {
        if ((fields as string).trim()) {
          fields = JSON.parse(fields as string);
          console.log(`✅ fields 修复为: ${JSON.stringify(fields)}`);
        } else {
          fields = null;
          console.log(`✅ fields 设为 null`);
        }
      } catch (error) {
        console.error(`❌ fields 解析失败: ${(error as Error).message}`);
        fields = null;
      }
    }

    // 修复 inputs 参数
    if (typeof inputs === 'string') {
      console.log(`⚠️ inputs 是字符串 "${inputs}"，尝试解析...`);
      try {
        if ((inputs as string).trim() && inputs !== '{}') {
          inputs = JSON.parse(inputs as string);
          console.log(`✅ inputs JSON 解析成功: ${JSON.stringify(inputs)}`);
        } else {
          inputs = null;
          console.log(`✅ inputs 设为 null`);
        }
      } catch (error) {
        console.error(`❌ inputs 解析失败: ${(error as Error).message}`);
        inputs = null;
      }
    }

    // 🔄 转换简化的 inputs 格式为标准格式
    if (inputs && typeof inputs === 'object') {
      console.log('🔄 检查并转换 inputs 格式...');
      const convertedInputs: InputConfig = {};
      let hasConversions = false;

      for (const [inputName, inputConfig] of Object.entries(inputs)) {
        console.log(`🔍 检查输入 "${inputName}":`, JSON.stringify(inputConfig));
        
        // 检查是否是简化格式: { type: "xxx", value: "yyy" }
        if (inputConfig && 
            typeof inputConfig === 'object' && 
            'type' in inputConfig && 
            'value' in inputConfig &&
            !('block' in inputConfig) && 
            !('shadow' in inputConfig)) {
          
          console.log(`⚙️ 发现简化格式，进行转换: ${inputName}`);
          
          // 根据块类型确定字段名
          const blockType = (inputConfig as any).type;
          const blockValue = (inputConfig as any).value;
          let fieldName = 'TEXT'; // 默认字段名
          
          // 根据不同的块类型设置正确的字段名
          switch (blockType) {
            case 'text':
              fieldName = 'TEXT';
              break;
            case 'math_number':
              fieldName = 'NUM';
              break;
            case 'logic_boolean':
              fieldName = 'BOOL';
              break;
            case 'variables_get':
              fieldName = 'VAR';
              break;
            default:
              // 对于其他类型，尝试常见的字段名
              fieldName = 'TEXT';
              console.log(`⚠️ 未知块类型 "${blockType}"，使用默认字段名 "TEXT"`);
          }
          
          // 转换为标准格式
          convertedInputs[inputName] = {
            block: {
              type: blockType,
              fields: {
                [fieldName]: blockValue
              }
            }
          };
          
          console.log(`✅ 转换完成: ${inputName} → block.${blockType}.fields.${fieldName} = "${blockValue}"`);
          hasConversions = true;
        } else {
          // 已经是标准格式，直接使用
          convertedInputs[inputName] = inputConfig as any;
          console.log(`✅ 标准格式，直接使用: ${inputName}`);
        }
      }
      
      if (hasConversions) {
        inputs = convertedInputs;
        console.log(`🎉 inputs 格式转换完成: ${JSON.stringify(inputs, null, 2)}`);
      } else {
        console.log(`ℹ️ inputs 已经是标准格式，无需转换`);
      }
    }

    // 修复 parentConnection 参数
    if (typeof parentConnection === 'string' && !(parentConnection as string).trim()) {
      parentConnection = null;
      console.log(`✅ parentConnection 设为 null`);
    }

    console.log('🔍 修复后的参数:');
    console.log(`  - 块类型: ${type}`);
    console.log(`  - 位置: ${JSON.stringify(position)}`);
    console.log(`  - 字段: ${JSON.stringify(fields)}`);
    console.log(`  - 输入: ${JSON.stringify(inputs)}`);
    console.log(`  - 父级连接: ${JSON.stringify(parentConnection)}`);
    console.log(`  - 创建变量: ${createVariables}`);

    // 验证参数
    if (!type || typeof type !== 'string') {
      throw new Error('参数 "type" 是必需的，且必须是字符串类型');
    }

    // 获取工作区
    console.log('🎯 获取 Blockly 工作区...');
    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }
    console.log('✅ 工作区获取成功');

    // 检查块类型是否存在
    console.log(`🔎 检查块类型 "${type}" 是否注册...`);
    if (!window['Blockly']?.Blocks[type]) {
      throw new Error(`Block 类型 "${type}" 不存在或未注册`);
    }
    console.log(`✅ 块类型 "${type}" 已注册`);

    // 创建块
    console.log(`🏗️ 创建块 "${type}"...`);
    const blockPosition = calculateBlockPosition(workspace, position?.x, position?.y);
    console.log(`📍 计算得到的位置: ${JSON.stringify(blockPosition)}`);
    const block = await createBlockSafely(workspace, type, blockPosition, false);

    if (!block) {
      throw new Error(`创建 Block "${type}" 失败`);
    }
    console.log(`✅ 块创建成功, ID: ${block.id}`);

    // 配置字段
    if (fields) {
      console.log('🏷️ 配置字段...');
      console.log('字段数据:', JSON.stringify(fields));
      await configureBlockFields(block, fields);
      console.log('✅ 字段配置完成');
    }

    // 处理变量创建
    const variablesCreated: string[] = [];
    if (createVariables && fields) {
      console.log('📝 处理变量创建...');
      const createdVars = await createVariablesFromFields(workspace, fields);
      variablesCreated.push(...createdVars);
      console.log(`✅ 创建了 ${createdVars.length} 个变量: ${createdVars.join(', ')}`);
    }

    // 配置输入
    if (inputs) {
      console.log('🔌 配置输入...');
      console.log('输入数据:', JSON.stringify(inputs));
      await configureBlockInputs(workspace, block, inputs);
      console.log('✅ 输入配置完成');
    } else {
      console.log('ℹ️ 没有输入数据需要配置');
    }

    // 处理父级连接（可选）
    if (parentConnection && parentConnection.blockId) {
      try {
        await connectToParent(workspace, block, parentConnection);
      } catch (error) {
        console.warn('连接到父级块失败，但块已成功创建:', error);
        // 不抛出错误，允许块独立存在
      }
    }

    metadata = {
      blockId: block.id,
      blockType: type,
      position: blockPosition,
      variablesCreated: variablesCreated.length > 0 ? variablesCreated : undefined
    };

    toolResult = `成功创建 Block "${type}"${variablesCreated.length > 0 ? `，创建了变量: ${variablesCreated.join(', ')}` : ''}`;

  } catch (error) {
    is_error = true;
    toolResult = `创建 Block 失败: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 2. 块连接工具
 */
interface ConnectBlocksArgs {
  sourceBlock: string | BlockConfig;
  targetBlock: string | BlockConfig;
  connectionType: 'next' | 'input' | 'stack';
  inputName?: string;
}

interface ConnectBlocksResult extends ToolUseResult {
  metadata?: {
    sourceBlockId: string;
    targetBlockId: string;
    connectionType: string;
    inputName?: string;
  };
}

/**
 * 解析块ID，支持新的安全格式和旧格式
 */
function parseBlockId(blockRef: string | BlockConfig): string {
  if (typeof blockRef !== 'string') {
    return blockRef.id;
  }
  
  // 检查是否是新的安全格式：type[ID:"blockId"]
  const safeFormatMatch = blockRef.match(/\[ID:"([^"]+)"\]$/);
  if (safeFormatMatch) {
    return safeFormatMatch[1];
  }
  
  // 检查是否是旧格式：type(blockId)
  const oldFormatMatch = blockRef.match(/\(([^)]+)\)$/);
  if (oldFormatMatch) {
    return oldFormatMatch[1];
  }
  
  // 如果都不匹配，直接返回原字符串作为ID
  return blockRef;
}

export async function connectBlocksTool(
  toolArgs: ConnectBlocksArgs
): Promise<ConnectBlocksResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🔗 connectBlocksTool 开始执行');
  console.log('📦 接收到的参数:', JSON.stringify(toolArgs, null, 2));

  try {
    const { sourceBlock, targetBlock, connectionType, inputName } = toolArgs;

    console.log('🎯 获取 Blockly 工作区...');
    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }
    console.log('✅ 工作区获取成功');

    console.log('🔍 获取或创建源块和目标块...');
    // 获取或创建源块
    const sourceBlockObj = await getOrCreateBlock(workspace, sourceBlock);
    const targetBlockObj = await getOrCreateBlock(workspace, targetBlock);

    console.log('📊 块获取结果:');
    console.log(`  - 源块: ${sourceBlockObj ? `${sourceBlockObj.type}(${sourceBlockObj.id})` : 'null'}`);
    console.log(`  - 目标块: ${targetBlockObj ? `${targetBlockObj.type}(${targetBlockObj.id})` : 'null'}`);

    if (!sourceBlockObj) {
      throw new Error(`无法找到源块: ${typeof sourceBlock === 'string' ? sourceBlock : JSON.stringify(sourceBlock)}`);
    }

    if (!targetBlockObj) {
      throw new Error(`无法找到目标块: ${typeof targetBlock === 'string' ? targetBlock : JSON.stringify(targetBlock)}`);
    }

    console.log(`🔗 执行连接: ${connectionType}`);
    // 执行连接
    await connectBlocks(sourceBlockObj, targetBlockObj, connectionType, inputName);

    metadata = {
      sourceBlockId: sourceBlockObj.id,
      targetBlockId: targetBlockObj.id,
      connectionType,
      inputName
    };

    toolResult = `成功连接块 "${sourceBlockObj.type}" 和 "${targetBlockObj.type}"`;
    console.log(`✅ ${toolResult}`);

  } catch (error) {
    is_error = true;
    toolResult = `连接块失败: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`❌ ${toolResult}`);
  }

  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 3. 代码结构创建工具
 */
interface CodeStructureArgs {
  structure: 'sequence' | 'condition' | 'loop' | 'function' | 'setup' | 'callback';
  blocks?: BlockConfig[];
  // 条件结构的详细配置
  condition?: BlockConfig;
  ifBranch?: BlockConfig | BlockConfig[];
  elseBranch?: BlockConfig | BlockConfig[];
  // 循环结构的详细配置  
  loopCondition?: BlockConfig;
  loopBody?: BlockConfig | BlockConfig[];
  insertPosition?: 'workspace' | 'after' | 'input';
  targetBlock?: string;
  targetInput?: string;
}

interface CodeStructureResult extends ToolUseResult {
  metadata?: {
    structureType: string;
    createdBlocks: string[];
    rootBlockId?: string;
  };
}

export async function createCodeStructureTool(
  toolArgs: CodeStructureArgs
): Promise<CodeStructureResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  try {
    const { structure, blocks, condition, ifBranch, elseBranch, loopCondition, loopBody, insertPosition = 'workspace', targetBlock, targetInput } = toolArgs;

    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }

    // 根据结构类型验证参数
    if (structure === 'condition') {
      if (!condition) {
        throw new Error('条件结构必须提供 condition 参数');
      }
    } else if (structure === 'loop') {
      if (!loopCondition) {
        throw new Error('循环结构必须提供 loopCondition 参数');
      }
    } else {
      if (!blocks || blocks.length === 0) {
        throw new Error('必须提供至少一个块配置');
      }
    }

    const createdBlocks: string[] = [];
    let rootBlock = null;

    switch (structure) {
      case 'sequence':
        rootBlock = await createSequenceStructure(workspace, blocks, createdBlocks);
        break;
      case 'condition':
        rootBlock = await createAdvancedConditionStructure(workspace, { condition, ifBranch, elseBranch }, createdBlocks);
        break;
      case 'loop':
        rootBlock = await createLoopStructure(workspace, blocks, createdBlocks);
        break;
      case 'setup':
        rootBlock = await createSetupStructure(workspace, blocks, createdBlocks);
        break;
      case 'callback':
        rootBlock = await createCallbackStructure(workspace, blocks, createdBlocks);
        break;
      default:
        throw new Error(`不支持的结构类型: ${structure}`);
    }

    // 处理插入位置
    if (insertPosition !== 'workspace' && targetBlock) {
      await insertStructureAtTarget(workspace, rootBlock, insertPosition, targetBlock, targetInput);
    }

    metadata = {
      structureType: structure,
      createdBlocks,
      rootBlockId: rootBlock?.id
    };

    toolResult = `成功创建 ${structure} 结构，包含 ${createdBlocks.length} 个块`;

  } catch (error) {
    is_error = true;
    toolResult = `创建代码结构失败: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 4. 块配置工具
 */
interface ConfigureBlockArgs {
  blockId?: string;
  blockType?: string;
  fields?: FieldConfig;
  inputs?: InputConfig;
}

interface ConfigureBlockResult extends ToolUseResult {
  metadata?: {
    blockId: string;
    blockType: string;
    fieldsUpdated: string[];
    inputsUpdated: string[];
  };
}

export async function configureBlockTool(
  toolArgs: ConfigureBlockArgs
): Promise<ConfigureBlockResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🔧 configureBlockTool 开始执行');
  console.log('📦 接收到的参数:', JSON.stringify(toolArgs, null, 2));

  try {
    let { blockId, blockType, fields, inputs } = toolArgs;

    // 🔧 参数修复和转换
    console.log('🔧 开始参数修复和转换...');
    
    // 修复 fields 参数
    if (typeof fields === 'string') {
      console.log(`⚠️ fields 是字符串 "${fields}"，尝试解析...`);
      try {
        if ((fields as string).trim()) {
          fields = JSON.parse(fields as string);
          console.log(`✅ fields 修复为: ${JSON.stringify(fields)}`);
        } else {
          fields = null;
          console.log(`✅ fields 设为 null`);
        }
      } catch (error) {
        console.error(`❌ fields 解析失败: ${(error as Error).message}`);
        fields = null;
      }
    }

    // 修复 inputs 参数
    if (typeof inputs === 'string') {
      console.log(`⚠️ inputs 是字符串 "${inputs}"，尝试解析...`);
      try {
        if ((inputs as string).trim() && inputs !== '{}') {
          inputs = JSON.parse(inputs as string);
          console.log(`✅ inputs 修复为: ${JSON.stringify(inputs)}`);
        } else {
          inputs = null;
          console.log(`✅ inputs 设为 null`);
        }
      } catch (error) {
        console.error(`❌ inputs 解析失败: ${(error as Error).message}`);
        inputs = null;
      }
    }

    console.log('🔍 修复后的参数:');
    console.log(`  - 块ID: ${blockId}`);
    console.log(`  - 块类型: ${blockType}`);
    console.log(`  - 字段: ${JSON.stringify(fields)}`);
    console.log(`  - 输入: ${JSON.stringify(inputs)}`);

    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }
    console.log('✅ 工作区获取成功');

    // 查找目标块
    console.log(`🎯 查找目标块: ${blockId} (类型: ${blockType})`);
    const block = await findTargetBlock(workspace, { id: blockId, type: blockType });
    if (!block) {
      throw new Error('未找到指定的块');
    }
    console.log(`✅ 找到目标块: ${block.type} (ID: ${block.id})`);

    const fieldsUpdated: string[] = [];
    const inputsUpdated: string[] = [];

    // 更新字段
    if (fields) {
      console.log('🏷️ 开始更新字段...');
      const updatedFields = await configureBlockFields(block, fields);
      fieldsUpdated.push(...updatedFields);
      console.log(`✅ 字段更新完成: ${updatedFields.join(', ')}`);
    }

    // 更新输入
    if (inputs) {
      console.log('🔌 开始更新输入...');
      const updatedInputs = await configureBlockInputs(workspace, block, inputs);
      inputsUpdated.push(...updatedInputs);
      console.log(`✅ 输入更新完成: ${updatedInputs.join(', ')}`);
    }

    metadata = {
      blockId: block.id,
      blockType: block.type,
      fieldsUpdated,
      inputsUpdated
    };

    toolResult = `成功配置块 "${block.type}"${fieldsUpdated.length > 0 ? `，更新字段: ${fieldsUpdated.join(', ')}` : ''}${inputsUpdated.length > 0 ? `，更新输入: ${inputsUpdated.join(', ')}` : ''}`;
    console.log(`✅ configureBlockTool 执行完成: ${toolResult}`);

  } catch (error) {
    is_error = true;
    toolResult = `配置块失败: ${error instanceof Error ? error.message : String(error)}`;
    console.error('❌ configureBlockTool 执行失败:', error);
  }

  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 5. 变量管理工具
 */
interface VariableManagerArgs {
  action: 'create' | 'delete' | 'list' | 'rename';
  variable?: VariableConfig;
  oldName?: string;
  newName?: string;
}

interface VariableManagerResult extends ToolUseResult {
  metadata?: {
    action: string;
    variableName?: string;
    variableId?: string;
    variables?: Array<{ name: string; id: string; type?: string }>;
  };
}

export async function variableManagerTool(
  toolArgs: VariableManagerArgs
): Promise<VariableManagerResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  try {
    const { action, variable, oldName, newName } = toolArgs;

    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }

    switch (action) {
      case 'create':
        if (!variable) {
          throw new Error('创建变量时必须提供变量配置');
        }
        const createdVar = await createVariable(workspace, variable);
        metadata = {
          action,
          variableName: createdVar.name,
          variableId: createdVar.id
        };
        toolResult = `成功创建变量 "${createdVar.name}"`;
        break;

      case 'list':
        const variables = await listVariables(workspace);
        metadata = {
          action,
          variables
        };
        toolResult = `工作区中有 ${variables.length} 个变量`;
        break;

      case 'rename':
        if (!oldName || !newName) {
          throw new Error('重命名变量时必须提供原名称和新名称');
        }
        await renameVariable(workspace, oldName, newName);
        metadata = {
          action,
          variableName: newName
        };
        toolResult = `成功将变量 "${oldName}" 重命名为 "${newName}"`;
        break;

      case 'delete':
        if (!variable?.name) {
          throw new Error('删除变量时必须提供变量名称');
        }
        await deleteVariable(workspace, variable.name);
        metadata = {
          action,
          variableName: variable.name
        };
        toolResult = `成功删除变量 "${variable.name}"`;
        break;

      default:
        throw new Error(`不支持的变量操作: ${action}`);
    }

  } catch (error) {
    is_error = true;
    toolResult = `变量管理失败: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 6. 块查找工具
 */
interface FindBlockArgs {
  criteria: {
    type?: string;
    fields?: FieldConfig;
    position?: 'first' | 'last' | 'selected';
  };
  action?: 'select' | 'highlight' | 'none';
}

interface FindBlockResult extends ToolUseResult {
  metadata?: {
    foundBlocks: Array<{ id: string; type: string; position: Position }>;
    selectedBlockId?: string;
  };
}

export async function findBlockTool(
  toolArgs: FindBlockArgs
): Promise<FindBlockResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🔍 findBlockTool 开始执行');
  console.log('📦 查找条件:', JSON.stringify(toolArgs, null, 2));

  try {
    const { criteria, action = 'none' } = toolArgs;

    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }
    console.log('✅ 工作区获取成功');

    const foundBlocks = await findBlocks(workspace, criteria);
    console.log(`🎯 找到 ${foundBlocks.length} 个符合条件的块`);

    if (foundBlocks.length === 0) {
      console.log('❌ 未找到符合条件的块');
      toolResult = '未找到符合条件的块';
    } else {
      let selectedBlockId = undefined;

      // 详细记录找到的每个块的信息
      console.log('📊 找到的块详情:');
      foundBlocks.forEach((blockInfo, index) => {
        console.log(`\n块 ${index + 1}:`);
        console.log(`  - ID: ${blockInfo.id}`);
        console.log(`  - 类型: ${blockInfo.type}`);
        console.log(`  - 位置: ${JSON.stringify(blockInfo.position)}`);
        console.log(`  - 字段值: ${JSON.stringify(blockInfo.fields)}`);
        if (blockInfo.inputs && Object.keys(blockInfo.inputs).length > 0) {
          console.log(`  - 输入: ${JSON.stringify(blockInfo.inputs)}`);
        }
      });

      if (action === 'select' && foundBlocks.length > 0) {
        const targetBlock = foundBlocks[0];
        workspace.setSelected && workspace.setSelected(targetBlock.block);
        selectedBlockId = targetBlock.id;
        console.log(`🎯 已选中块: ${selectedBlockId}`);
      } else if (action === 'highlight') {
        // 实现高亮逻辑
        await highlightBlocks(foundBlocks.map(b => b.block));
        console.log(`✨ 已高亮 ${foundBlocks.length} 个块`);
      }

      // 返回更详细的 metadata，包含字段值信息
      metadata = {
        foundBlocks: foundBlocks.map(b => ({
          id: b.id,
          type: b.type,
          position: b.position,
          fields: b.fields,
          inputs: b.inputs
        })),
        selectedBlockId,
        searchCriteria: criteria
      };

      // 使用安全的ID格式，避免特殊字符被截断
      const blockList = foundBlocks.map(b => `${b.type}[ID:${JSON.stringify(b.id)}]`).join(', ');
      toolResult = `找到 ${foundBlocks.length} 个符合条件的块：${blockList}`;
      console.log(`✅ 查找完成: ${toolResult}`);
    }

  } catch (error) {
    is_error = true;
    toolResult = `查找块失败: ${error instanceof Error ? error.message : String(error)}`;
    console.error('❌ findBlockTool 执行失败:', error);
  }

  console.log('📤 返回结果:', { content: toolResult, is_error, metadata });
  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 6. 块删除工具
 */
interface DeleteBlockArgs {
  blockId: string;
  cascade?: boolean; // 是否级联删除连接的块
}

interface DeleteBlockResult extends ToolUseResult {
  metadata?: {
    deletedBlockId: string;
    deletedBlockType: string;
    cascadeDeleted?: string[]; // 级联删除的块ID列表
  };
}

export async function deleteBlockTool(
  toolArgs: DeleteBlockArgs
): Promise<DeleteBlockResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🗑️ deleteBlockTool 开始执行');
  console.log('📦 接收到的参数:', JSON.stringify(toolArgs, null, 2));

  try {
    const { blockId, cascade = false } = toolArgs;

    console.log('🎯 获取 Blockly 工作区...');
    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }
    console.log('✅ 工作区获取成功');

    // 查找要删除的块
    console.log(`🔍 查找块 ID: ${blockId}`);
    const blockToDelete = workspace.getBlockById(blockId);
    if (!blockToDelete) {
      throw new Error(`未找到块 ID: ${blockId}`);
    }

    console.log(`✅ 找到目标块: ${blockToDelete.type} (ID: ${blockToDelete.id})`);

    const deletedBlockType = blockToDelete.type;
    const cascadeDeleted: string[] = [];

    if (cascade) {
      console.log('🔗 启用级联删除，收集连接的块...');
      
      // 收集所有连接的块（包括子块和影子块）
      const collectConnectedBlocks = (block: any, collected: Set<string>) => {
        if (!block || collected.has(block.id)) return;
        
        collected.add(block.id);
        
        // 收集所有输入中的连接块
        const inputs = block.inputList;
        for (const input of inputs) {
          if (input.connection && input.connection.targetBlock()) {
            collectConnectedBlocks(input.connection.targetBlock(), collected);
          }
        }
        
        // 收集下一个块
        if (block.nextConnection && block.nextConnection.targetBlock()) {
          collectConnectedBlocks(block.nextConnection.targetBlock(), collected);
        }
      };

      const connectedBlocks = new Set<string>();
      collectConnectedBlocks(blockToDelete, connectedBlocks);
      
      // 移除主块本身，只保留连接的块
      connectedBlocks.delete(blockToDelete.id);
      cascadeDeleted.push(...Array.from(connectedBlocks));
      
      console.log(`📊 发现 ${cascadeDeleted.length} 个连接的块需要级联删除`);
    }

    // 执行删除
    console.log('🗑️ 开始删除块...');
    
    if (cascade && cascadeDeleted.length > 0) {
      // 级联删除：删除整个块树
      blockToDelete.dispose(true); // true表示删除所有连接的块
      toolResult = `成功删除块 "${deletedBlockType}" 及其 ${cascadeDeleted.length} 个连接块`;
    } else {
      // 单独删除：只删除指定的块，保留连接的块
      blockToDelete.dispose(false); // false表示只删除当前块
      toolResult = `成功删除块 "${deletedBlockType}"`;
    }

    console.log(`✅ 删除完成: ${toolResult}`);

    metadata = {
      deletedBlockId: blockId,
      deletedBlockType: deletedBlockType,
      ...(cascade && cascadeDeleted.length > 0 && { cascadeDeleted })
    };

  } catch (error) {
    is_error = true;
    toolResult = `删除块失败: ${error instanceof Error ? error.message : String(error)}`;
    console.error('❌ deleteBlockTool 执行失败:', error);
  }

  console.log('📤 返回结果:', { content: toolResult, is_error, metadata });
  return {
    content: toolResult,
    is_error,
    metadata
  };
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 获取当前活动的 Blockly 工作区
 */
async function getCurrentWorkspace(): Promise<any> {
  try {
    // 方法1: 尝试从 Angular 服务获取工作区（优先）
    const blocklyService = getBlocklyService();
    if (blocklyService?.workspace && !blocklyService.workspace.disposed) {
      return blocklyService.workspace;
    }

    // 方法2: 尝试从全局 Blockly 获取主工作区
    if (window['Blockly']?.getMainWorkspace) {
      const mainWorkspace = window['Blockly'].getMainWorkspace();
      if (mainWorkspace && !mainWorkspace.disposed) {
        return mainWorkspace;
      }
    }

    // 方法3: 尝试从所有工作区中找到活动的
    if (window['Blockly']?.Workspace?.getAll) {
      const workspaces = window['Blockly'].Workspace.getAll();
      for (const workspace of workspaces) {
        if (!workspace.disposed && workspace.svgGroup_) {
          const svgElement = workspace.getParentSvg();
          if (svgElement && svgElement.parentNode) {
            return workspace;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('获取工作区时出错:', error);
    return null;
  }
}

/**
 * 获取 BlocklyService 实例
 */
function getBlocklyService(): any {
  try {
    if ((window as any)['blocklyService']) {
      return (window as any)['blocklyService'];
    }

    const injector = (window as any)['ng']?.getInjector?.(document.body);
    if (injector) {
      try {
        return injector.get('BlocklyService');
      } catch (e) {
        console.debug('无法通过依赖注入获取 BlocklyService:', e);
      }
    }

    const elements = document.querySelectorAll('[ng-version]');
    for (const element of elements) {
      try {
        const componentRef = (window as any)['ng']?.getComponent?.(element);
        if (componentRef?.blocklyService) {
          return componentRef.blocklyService;
        }
      } catch (e) {
        // 继续尝试下一个元素
      }
    }

    return null;
  } catch (error) {
    console.error('获取 BlocklyService 时出错:', error);
    return null;
  }
}

/**
 * 计算块的放置位置
 */
function calculateBlockPosition(workspace: any, x?: number, y?: number): Position {
  try {
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y };
    }

    const metrics = workspace.getMetrics?.();
    if (metrics) {
      const centerX = metrics.viewLeft + (metrics.viewWidth / 2);
      const centerY = metrics.viewTop + (metrics.viewHeight / 2);
      
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetY = (Math.random() - 0.5) * 100;
      
      return {
        x: centerX + offsetX,
        y: centerY + offsetY
      };
    }

    return { x: 100, y: 100 };
  } catch (error) {
    console.error('计算位置时出错:', error);
    return { x: 100, y: 100 };
  }
}

/**
 * 安全地在工作区中创建块
 */
async function createBlockSafely(
  workspace: any,
  type: string,
  position: Position,
  animate: boolean
): Promise<any> {
  try {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          if (!workspace || workspace.disposed) {
            reject(new Error('工作区已被销毁'));
            return;
          }

          const wasRecordingUndo = window['Blockly'].Events.getRecordUndo();
          const currentGroup = window['Blockly'].Events.getGroup();

          window['Blockly'].Events.disable();

          const block = workspace.newBlock(type);

          if (!block) {
            window['Blockly'].Events.enable();
            reject(new Error(`无法创建类型为 "${type}" 的 block`));
            return;
          }

          block.initSvg();
          block.render();

          window['Blockly'].Events.enable();

          if (currentGroup) {
            window['Blockly'].Events.setGroup(currentGroup);
          }
          window['Blockly'].Events.setRecordUndo(wasRecordingUndo);

          block.moveBy(position.x || 0, position.y || 0);

          resolve(block);

        } catch (error) {
          try {
            window['Blockly'].Events.enable();
          } catch (e) {
            console.error('恢复事件系统时出错:', e);
          }
          reject(error);
        }
      }, 50);
    });

  } catch (error) {
    throw error;
  }
}

/**
 * 配置块的字段
 */
async function configureBlockFields(block: any, fields: FieldConfig): Promise<string[]> {
  const updatedFields: string[] = [];

  try {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const field = block.getField(fieldName);
      if (field) {
        // 处理板卡配置变量引用
        const resolvedValue = await resolveBoardConfigVariable(fieldValue);
        
        // 根据字段类型设置值
        if (field.setValue) {
          field.setValue(resolvedValue);
          updatedFields.push(fieldName);
        } else if (field.getText && field.setText) {
          field.setText(resolvedValue);
          updatedFields.push(fieldName);
        }
      }
    }
  } catch (error) {
    console.error('配置块字段时出错:', error);
  }

  return updatedFields;
}

/**
 * 配置块的输入
 */
async function configureBlockInputs(workspace: any, block: any, inputs: InputConfig): Promise<string[]> {
  const updatedInputs: string[] = [];

  console.log('🔌 configureBlockInputs 开始执行');
  console.log('📦 输入配置数据:', JSON.stringify(inputs, null, 2));
  console.log('🧱 目标块信息:', { id: block.id, type: block.type });

  try {
    for (const [inputName, inputConfig] of Object.entries(inputs)) {
      console.log(`\n🔍 处理输入: ${inputName}`);
      console.log('输入配置:', JSON.stringify(inputConfig, null, 2));
      
      const input = block.getInput(inputName);
      if (input) {
        console.log(`✅ 找到输入 "${inputName}"`);
        console.log('输入类型:', input.type);
        console.log('是否有连接点:', !!input.connection);
        
        if (inputConfig.block) {
          console.log('🏗️ 创建子块...');
          // 创建并连接块
          const childBlock = await createBlockFromConfig(workspace, inputConfig.block);
          if (childBlock && input.connection) {
            console.log(`✅ 子块创建成功: ${childBlock.type} (ID: ${childBlock.id})`);
            const connectionToUse = childBlock.outputConnection || childBlock.previousConnection;
            if (connectionToUse) {
              input.connection.connect(connectionToUse);
              console.log(`🔗 成功连接子块到输入 "${inputName}"`);
              updatedInputs.push(inputName);
            } else {
              console.warn(`⚠️ 子块 ${childBlock.type} 没有可用的连接点`);
            }
          } else {
            console.error(`❌ 子块创建失败或输入没有连接点`);
          }
        } else if (inputConfig.shadow) {
          console.log('👤 创建影子块...');
          // 创建影子块
          const shadowBlock = await createBlockFromConfig(workspace, inputConfig.shadow);
          if (shadowBlock && input.connection) {
            console.log(`✅ 影子块创建成功: ${shadowBlock.type} (ID: ${shadowBlock.id})`);
            
            // 正确设置影子块
            const connectionToUse = shadowBlock.outputConnection || shadowBlock.previousConnection;
            if (connectionToUse) {
              // 先设置为影子块
              shadowBlock.setShadow(true);
              // 然后连接到输入
              input.connection.connect(connectionToUse);
              console.log(`🔗 成功设置影子块到输入 "${inputName}"`);
              updatedInputs.push(inputName);
            } else {
              console.warn(`⚠️ 影子块 ${shadowBlock.type} 没有可用的连接点`);
              console.log('可用的连接点:', {
                outputConnection: !!shadowBlock.outputConnection,
                previousConnection: !!shadowBlock.previousConnection,
                nextConnection: !!shadowBlock.nextConnection
              });
            }
          } else {
            console.error(`❌ 影子块创建失败或输入没有连接点`);
            console.log('调试信息:', {
              shadowBlock: !!shadowBlock,
              inputConnection: !!input.connection,
              blockType: shadowBlock?.type
            });
          }
        } else {
          console.log(`ℹ️ 输入 "${inputName}" 没有块或影子配置`);
        }
      } else {
        console.error(`❌ 输入 "${inputName}" 在块 ${block.type} 中不存在`);
        // 列出可用的输入
        const availableInputs = [];
        for (let i = 0; i < block.inputList.length; i++) {
          const inp = block.inputList[i];
          if (inp.name) {
            availableInputs.push(inp.name);
          }
        }
        console.log('可用的输入列表:', availableInputs);
      }
    }
    
    console.log(`✅ configureBlockInputs 完成，更新了 ${updatedInputs.length} 个输入: ${updatedInputs.join(', ')}`);
  } catch (error) {
    console.error('❌ 配置块输入时出错:', error);
  }

  return updatedInputs;
}

/**
 * 从配置创建块
 */
async function createBlockFromConfig(workspace: any, config: BlockConfig): Promise<any> {
  console.log('🏗️ createBlockFromConfig 开始');
  console.log('📦 块配置:', JSON.stringify(config, null, 2));
  
  try {
    console.log(`🔨 创建块类型: ${config.type}`);
    const position = config.position || { x: 0, y: 0 };
    const block = await createBlockSafely(workspace, config.type, position, false);
    
    if (!block) {
      console.error(`❌ 块创建失败: ${config.type}`);
      return null;
    }
    
    console.log(`✅ 块创建成功: ${config.type} (ID: ${block.id})`);
    
    if (config.fields) {
      console.log('🏷️ 配置块字段...');
      console.log('字段数据:', JSON.stringify(config.fields));
      await configureBlockFields(block, config.fields);
      console.log('✅ 字段配置完成');
    }
    
    if (config.inputs) {
      console.log('🔌 配置块输入...');
      await configureBlockInputs(workspace, block, config.inputs);
      console.log('✅ 块输入配置完成');
    }
    
    console.log(`🎉 createBlockFromConfig 完成: ${config.type}`);
    return block;
  } catch (error) {
    console.error('❌ 从配置创建块时出错:', error);
    return null;
  }
}

/**
 * 解析板卡配置变量
 */
async function resolveBoardConfigVariable(value: any): Promise<any> {
  if (typeof value !== 'string' || !value.startsWith('${') || !value.endsWith('}')) {
    return value;
  }

  try {
    // 提取变量路径，如 ${board.serialPort}
    const varPath = value.slice(2, -1);
    const [configType, configKey] = varPath.split('.');
    
    if (configType === 'board') {
      // 获取板卡配置
      const boardConfig = await getBoardConfig();
      if (boardConfig && boardConfig[configKey]) {
        // 如果是数组（下拉选项），返回第一个选项的值
        if (Array.isArray(boardConfig[configKey]) && boardConfig[configKey].length > 0) {
          return boardConfig[configKey][0][1] || boardConfig[configKey][0][0];
        }
        return boardConfig[configKey];
      }
    }
    
    return value; // 无法解析时返回原值
  } catch (error) {
    console.error('解析板卡配置变量时出错:', error);
    return value;
  }
}

/**
 * 获取板卡配置
 */
async function getBoardConfig(): Promise<any> {
  try {
    const blocklyService = getBlocklyService();
    if (blocklyService?.boardConfig) {
      return blocklyService.boardConfig;
    }
    
    // 尝试从其他地方获取板卡配置
    // 这里可以根据实际项目结构调整
    return null;
  } catch (error) {
    console.error('获取板卡配置时出错:', error);
    return null;
  }
}

/**
 * 从变量字段创建变量定义
 */
async function createVariablesFromFields(workspace: any, fields: FieldConfig): Promise<string[]> {
  const createdVariables: string[] = [];

  try {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      // 检查是否是变量字段且需要创建变量定义
      if (typeof fieldValue === 'object' && fieldValue.id) {
        const variableName = fieldValue.name || `var_${Date.now()}`;
        
        // 创建变量定义块
        const varDefBlock = await createBlockSafely(workspace, 'variable_define', { x: 50, y: 50 }, false);
        if (varDefBlock) {
          const varField = varDefBlock.getField('VAR');
          if (varField) {
            varField.setValue(variableName);
            createdVariables.push(variableName);
          }
        }
      }
    }
  } catch (error) {
    console.error('创建变量时出错:', error);
  }

  return createdVariables;
}

/**
 * 获取或创建块
 */
async function getOrCreateBlock(workspace: any, blockRef: string | BlockConfig): Promise<any> {
  console.log('🔍 getOrCreateBlock 开始执行');
  console.log('📦 块引用:', JSON.stringify(blockRef, null, 2));
  
  if (typeof blockRef === 'string') {
    // 解析块ID，支持新旧格式
    const blockId = parseBlockId(blockRef);
    console.log(`🔎 查找现有块 ID: "${blockId}" (原始: "${blockRef}")`);
    
    // 查找现有块
    const block = workspace.getBlockById(blockId);
    
    if (block) {
      console.log(`✅ 找到块: ${block.type} (ID: ${block.id})`);
      return block;
    } else {
      console.error(`❌ 未找到块 ID: "${blockId}"`);
      
      // 列出所有可用的块ID进行调试
      const allBlocks = workspace.getAllBlocks();
      console.log(`📊 工作区中总共有 ${allBlocks.length} 个块`);
      
      if (allBlocks.length > 0) {
        const availableIds = allBlocks.map((b: any) => `${b.type}[ID:${JSON.stringify(b.id)}]`).slice(0, 10); // 只显示前10个
        console.log('🎯 可用的块列表（前10个）:', availableIds.join(', '));
        
        // 检查是否有相似的 ID
        const similarIds = allBlocks
          .map((b: any) => b.id)
          .filter((id: string) => id.includes(blockId.substring(0, 5)) || blockId.includes(id.substring(0, 5)));
        
        if (similarIds.length > 0) {
          console.log('🔍 发现相似的块 ID:', similarIds.join(', '));
        }
      } else {
        console.log('⚠️ 工作区中没有任何块');
      }
      
      return null;
    }
  } else {
    console.log('🏗️ 创建新块...');
    // 创建新块
    const newBlock = await createBlockFromConfig(workspace, blockRef);
    if (newBlock) {
      console.log(`✅ 新块创建成功: ${newBlock.type} (ID: ${newBlock.id})`);
    } else {
      console.error('❌ 新块创建失败');
    }
    return newBlock;
  }
}

/**
 * 连接块到父级
 */
async function connectToParent(workspace: any, block: any, parentConnection: ConnectionConfig): Promise<void> {
  try {
    // 验证 parentConnection 参数
    if (!parentConnection || !parentConnection.blockId) {
      console.log('没有指定父级块，块将作为独立块创建');
      return; // 允许空的父级连接
    }

    console.log('尝试连接到父级块:', parentConnection.blockId);
    
    const parentBlock = workspace.getBlockById(parentConnection.blockId);
    if (!parentBlock) {
      // 列出所有可用的块ID进行调试
      const allBlocks = workspace.getAllBlocks();
      const availableIds = allBlocks.map((b: any) => `${b.type}[ID:${JSON.stringify(b.id)}]`).join(', ');
      console.warn('可用的块ID列表:', availableIds);
      throw new Error(`未找到父级块: ${parentConnection.blockId}。可用块ID: ${availableIds}`);
    }

    console.log('找到父级块:', parentBlock.id, parentBlock.type);

    switch (parentConnection.connectionType) {
      case 'next':
        if (parentBlock.nextConnection && block.previousConnection) {
          parentBlock.nextConnection.connect(block.previousConnection);
          console.log('成功连接到父级块的 next 连接');
        } else {
          throw new Error(`无法连接: 父级块缺少 nextConnection 或当前块缺少 previousConnection`);
        }
        break;
      
      case 'input':
        if (parentConnection.inputName) {
          const input = parentBlock.getInput(parentConnection.inputName);
          if (input && input.connection && (block.outputConnection || block.previousConnection)) {
            const connection = block.outputConnection || block.previousConnection;
            input.connection.connect(connection);
            console.log(`成功连接到父级块的输入: ${parentConnection.inputName}`);
          } else {
            throw new Error(`无法连接到输入 "${parentConnection.inputName}": 输入不存在或连接点不匹配`);
          }
        } else {
          throw new Error('input 连接类型需要指定 inputName');
        }
        break;
      
      default:
        throw new Error(`不支持的连接类型: ${parentConnection.connectionType}`);
    }
  } catch (error) {
    console.error('连接到父级时出错:', error);
    throw error;
  }
}

/**
 * 连接两个块
 */
async function connectBlocks(sourceBlock: any, targetBlock: any, connectionType: string, inputName?: string): Promise<void> {
  try {
    switch (connectionType) {
      case 'next':
        if (sourceBlock.nextConnection && targetBlock.previousConnection) {
          sourceBlock.nextConnection.connect(targetBlock.previousConnection);
        }
        break;
      
      case 'input':
        if (inputName && sourceBlock.getInput(inputName)) {
          const input = sourceBlock.getInput(inputName);
          if (input.connection && (targetBlock.outputConnection || targetBlock.previousConnection)) {
            const connection = targetBlock.outputConnection || targetBlock.previousConnection;
            input.connection.connect(connection);
          }
        }
        break;
      
      case 'stack':
        // 堆叠连接（语句块连接）
        if (sourceBlock.getInput('STACK') || sourceBlock.getInput('DO')) {
          const stackInput = sourceBlock.getInput('STACK') || sourceBlock.getInput('DO');
          if (stackInput && stackInput.connection && targetBlock.previousConnection) {
            stackInput.connection.connect(targetBlock.previousConnection);
          }
        }
        break;
    }
  } catch (error) {
    console.error('连接块时出错:', error);
    throw error;
  }
}

/**
 * 创建序列结构
 */
async function createSequenceStructure(workspace: any, blocks: BlockConfig[], createdBlocks: string[]): Promise<any> {
  let previousBlock = null;
  let rootBlock = null;

  for (const blockConfig of blocks) {
    const block = await createBlockFromConfig(workspace, blockConfig);
    if (block) {
      createdBlocks.push(block.id);
      
      if (!rootBlock) {
        rootBlock = block;
      }
      
      if (previousBlock && previousBlock.nextConnection && block.previousConnection) {
        previousBlock.nextConnection.connect(block.previousConnection);
      }
      
      previousBlock = block;
    }
  }

  return rootBlock;
}

/**
 * 创建条件结构
 */
async function createConditionStructure(workspace: any, blocks: BlockConfig[], createdBlocks: string[]): Promise<any> {
  // 创建 if 块作为容器
  const ifBlock = await createBlockSafely(workspace, 'controls_if', { x: 100, y: 100 }, false);
  if (!ifBlock) {
    throw new Error('无法创建条件块');
  }
  
  createdBlocks.push(ifBlock.id);

  // 连接条件和语句
  if (blocks.length >= 1) {
    // 条件块
    const conditionBlock = await createBlockFromConfig(workspace, blocks[0]);
    if (conditionBlock) {
      createdBlocks.push(conditionBlock.id);
      const ifInput = ifBlock.getInput('IF0');
      if (ifInput && ifInput.connection && conditionBlock.outputConnection) {
        ifInput.connection.connect(conditionBlock.outputConnection);
      }
    }
  }

  if (blocks.length >= 2) {
    // 执行语句
    const doBlock = await createBlockFromConfig(workspace, blocks[1]);
    if (doBlock) {
      createdBlocks.push(doBlock.id);
      const doInput = ifBlock.getInput('DO0');
      if (doInput && doInput.connection && doBlock.previousConnection) {
        doInput.connection.connect(doBlock.previousConnection);
      }
    }
  }

  return ifBlock;
}

/**
 * 创建高级条件结构（支持复杂条件和else分支）
 */
async function createAdvancedConditionStructure(
  workspace: any, 
  config: { condition?: BlockConfig, ifBranch?: BlockConfig | BlockConfig[], elseBranch?: BlockConfig | BlockConfig[] }, 
  createdBlocks: string[]
): Promise<any> {
  console.log('🏗️ 开始创建高级条件结构');
  console.log('📦 条件配置:', JSON.stringify(config, null, 2));

  // 创建基础的 if 块
  const ifBlock = await createBlockSafely(workspace, 'controls_if', { x: 100, y: 100 }, false);
  if (!ifBlock) {
    throw new Error('无法创建条件块');
  }
  
  createdBlocks.push(ifBlock.id);
  console.log(`✅ 创建了 if 块: ${ifBlock.id}`);

  // 如果有else分支，需要添加else部分
  if (config.elseBranch) {
    // 设置 if 块包含 else
    ifBlock.setFieldValue('1', 'ELSE');
    console.log('✅ 启用了 else 分支');
  }

  // 1. 连接条件表达式
  if (config.condition) {
    console.log('🔗 开始连接条件表达式');
    const conditionBlock = await createBlockFromConfig(workspace, config.condition);
    if (conditionBlock) {
      createdBlocks.push(conditionBlock.id);
      const ifInput = ifBlock.getInput('IF0');
      if (ifInput && ifInput.connection && conditionBlock.outputConnection) {
        ifInput.connection.connect(conditionBlock.outputConnection);
        console.log(`✅ 条件表达式已连接: ${conditionBlock.id}`);
      } else {
        console.warn('❌ 无法连接条件表达式，连接点不匹配');
      }
    }
  }

  // 2. 连接if分支
  if (config.ifBranch) {
    console.log('🔗 开始连接 if 分支');
    const ifBranches = Array.isArray(config.ifBranch) ? config.ifBranch : [config.ifBranch];
    let lastBlock = null;
    
    for (let i = 0; i < ifBranches.length; i++) {
      const branchBlock = await createBlockFromConfig(workspace, ifBranches[i]);
      if (branchBlock) {
        createdBlocks.push(branchBlock.id);
        
        if (i === 0) {
          // 第一个块连接到 DO0 输入
          const doInput = ifBlock.getInput('DO0');
          if (doInput && doInput.connection && branchBlock.previousConnection) {
            doInput.connection.connect(branchBlock.previousConnection);
            console.log(`✅ if分支第一个块已连接: ${branchBlock.id}`);
          }
        } else {
          // 后续块连接到前一个块的next
          if (lastBlock && lastBlock.nextConnection && branchBlock.previousConnection) {
            lastBlock.nextConnection.connect(branchBlock.previousConnection);
            console.log(`✅ if分支后续块已连接: ${branchBlock.id}`);
          }
        }
        lastBlock = branchBlock;
      }
    }
  }

  // 3. 连接else分支
  if (config.elseBranch) {
    console.log('🔗 开始连接 else 分支');
    const elseBranches = Array.isArray(config.elseBranch) ? config.elseBranch : [config.elseBranch];
    let lastBlock = null;
    
    for (let i = 0; i < elseBranches.length; i++) {
      const branchBlock = await createBlockFromConfig(workspace, elseBranches[i]);
      if (branchBlock) {
        createdBlocks.push(branchBlock.id);
        
        if (i === 0) {
          // 第一个块连接到 ELSE 输入
          const elseInput = ifBlock.getInput('ELSE');
          if (elseInput && elseInput.connection && branchBlock.previousConnection) {
            elseInput.connection.connect(branchBlock.previousConnection);
            console.log(`✅ else分支第一个块已连接: ${branchBlock.id}`);
          }
        } else {
          // 后续块连接到前一个块的next
          if (lastBlock && lastBlock.nextConnection && branchBlock.previousConnection) {
            lastBlock.nextConnection.connect(branchBlock.previousConnection);
            console.log(`✅ else分支后续块已连接: ${branchBlock.id}`);
          }
        }
        lastBlock = branchBlock;
      }
    }
  }

  console.log(`🎉 高级条件结构创建完成，共创建 ${createdBlocks.length} 个块`);
  return ifBlock;
}

/**
 * 创建循环结构
 */
async function createLoopStructure(workspace: any, blocks: BlockConfig[], createdBlocks: string[]): Promise<any> {
  // 创建 while 循环块
  const whileBlock = await createBlockSafely(workspace, 'controls_whileUntil', { x: 100, y: 100 }, false);
  if (!whileBlock) {
    throw new Error('无法创建循环块');
  }
  
  createdBlocks.push(whileBlock.id);

  // 设置循环模式
  const modeField = whileBlock.getField('MODE');
  if (modeField) {
    modeField.setValue('WHILE');
  }

  // 连接条件和循环体
  if (blocks.length >= 1) {
    const conditionBlock = await createBlockFromConfig(workspace, blocks[0]);
    if (conditionBlock) {
      createdBlocks.push(conditionBlock.id);
      const boolInput = whileBlock.getInput('BOOL');
      if (boolInput && boolInput.connection && conditionBlock.outputConnection) {
        boolInput.connection.connect(conditionBlock.outputConnection);
      }
    }
  }

  if (blocks.length >= 2) {
    const bodyBlock = await createBlockFromConfig(workspace, blocks[1]);
    if (bodyBlock) {
      createdBlocks.push(bodyBlock.id);
      const doInput = whileBlock.getInput('DO');
      if (doInput && doInput.connection && bodyBlock.previousConnection) {
        doInput.connection.connect(bodyBlock.previousConnection);
      }
    }
  }

  return whileBlock;
}

/**
 * 创建 Setup 结构
 */
async function createSetupStructure(workspace: any, blocks: BlockConfig[], createdBlocks: string[]): Promise<any> {
  // 创建 arduino_setup 块
  const setupBlock = await createBlockSafely(workspace, 'arduino_setup', { x: 30, y: -50 }, false);
  if (!setupBlock) {
    throw new Error('无法创建 Setup 块');
  }
  
  createdBlocks.push(setupBlock.id);

  // 设置为不可删除
  setupBlock.setDeletable(false);

  // 如果有块配置，创建序列并连接到 Setup 输入
  if (blocks.length > 0) {
    const sequenceRoot = await createSequenceStructure(workspace, blocks, createdBlocks);
    if (sequenceRoot) {
      const setupInput = setupBlock.getInput('ARDUINO_SETUP');
      if (setupInput && setupInput.connection && sequenceRoot.previousConnection) {
        setupInput.connection.connect(sequenceRoot.previousConnection);
      }
    }
  }

  return setupBlock;
}

/**
 * 创建回调结构
 */
async function createCallbackStructure(workspace: any, blocks: BlockConfig[], createdBlocks: string[]): Promise<any> {
  // 假设第一个块是回调容器块
  if (blocks.length === 0) {
    throw new Error('回调结构至少需要一个块配置');
  }

  const callbackBlock = await createBlockFromConfig(workspace, blocks[0]);
  if (!callbackBlock) {
    throw new Error('无法创建回调块');
  }
  
  createdBlocks.push(callbackBlock.id);

  // 如果有更多块，创建为回调内容
  if (blocks.length > 1) {
    const contentBlocks = blocks.slice(1);
    const contentRoot = await createSequenceStructure(workspace, contentBlocks, createdBlocks);
    
    if (contentRoot) {
      // 查找合适的输入来连接内容
      const inputs = ['CALLBACK', 'HANDLER', 'DO', 'STACK'];
      for (const inputName of inputs) {
        const input = callbackBlock.getInput(inputName);
        if (input && input.connection && contentRoot.previousConnection) {
          input.connection.connect(contentRoot.previousConnection);
          break;
        }
      }
    }
  }

  return callbackBlock;
}

/**
 * 在目标位置插入结构
 */
async function insertStructureAtTarget(
  workspace: any, 
  rootBlock: any, 
  insertPosition: string, 
  targetBlockId: string, 
  targetInput?: string
): Promise<void> {
  const targetBlock = workspace.getBlockById(targetBlockId);
  if (!targetBlock) {
    throw new Error('未找到目标块');
  }

  switch (insertPosition) {
    case 'after':
      if (targetBlock.nextConnection && rootBlock.previousConnection) {
        // 如果目标块已有下一个块，先断开
        const existingNext = targetBlock.getNextBlock();
        if (existingNext) {
          targetBlock.nextConnection.disconnect();
        }
        
        // 连接新结构
        targetBlock.nextConnection.connect(rootBlock.previousConnection);
        
        // 如果新结构有 next 连接，连接原来的下一个块
        if (existingNext && rootBlock.nextConnection) {
          let lastBlock = rootBlock;
          while (lastBlock.getNextBlock()) {
            lastBlock = lastBlock.getNextBlock();
          }
          if (lastBlock.nextConnection && existingNext.previousConnection) {
            lastBlock.nextConnection.connect(existingNext.previousConnection);
          }
        }
      }
      break;
      
    case 'input':
      if (targetInput) {
        const input = targetBlock.getInput(targetInput);
        if (input && input.connection && (rootBlock.outputConnection || rootBlock.previousConnection)) {
          const connection = rootBlock.outputConnection || rootBlock.previousConnection;
          input.connection.connect(connection);
        }
      }
      break;
  }
}

/**
 * 查找目标块
 */
async function findTargetBlock(workspace: any, criteria: BlockReference): Promise<any> {
  if (criteria.id) {
    return workspace.getBlockById(criteria.id);
  }
  
  if (criteria.type) {
    const allBlocks = workspace.getAllBlocks();
    const matchingBlocks = allBlocks.filter((block: any) => block.type === criteria.type);
    
    if (matchingBlocks.length === 0) {
      return null;
    }
    
    switch (criteria.position) {
      case 'first':
        return matchingBlocks[0];
      case 'last':
        return matchingBlocks[matchingBlocks.length - 1];
      case 'selected':
        return workspace.getSelected();
      default:
        return matchingBlocks[0];
    }
  }
  
  if (criteria.position === 'selected') {
    return workspace.getSelected();
  }
  
  return null;
}

/**
 * 查找块
 */
async function findBlocks(workspace: any, criteria: any): Promise<Array<{ id: string; type: string; position: Position; block: any; fields: any; inputs: any }>> {
  console.log('🔍 findBlocks 开始执行');
  console.log('📦 查找条件:', JSON.stringify(criteria, null, 2));
  
  const allBlocks = workspace.getAllBlocks();
  const results: Array<{ id: string; type: string; position: Position; block: any; fields: any; inputs: any }> = [];

  console.log(`🧱 工作区中共有 ${allBlocks.length} 个块`);

  for (const block of allBlocks) {
    console.log(`\n🔍 检查块: ${block.type} (ID: ${block.id})`);

    // 检查类型匹配
    if (criteria.type && block.type !== criteria.type) {
      console.log(`  ❌ 类型不匹配: 期望 ${criteria.type}, 实际 ${block.type} - 跳过`);
      continue; // 早期退出，不匹配的块直接跳过
    }
    
    if (criteria.type) {
      console.log(`  ✅ 类型匹配: ${block.type}`);
    }

    // 收集字段信息
    const fields: any = {};
    const inputList = block.inputList || [];
    
    // 遍历所有输入以获取字段
    for (const input of inputList) {
      if (input.fieldRow) {
        for (const field of input.fieldRow) {
          if (field.name && field.getValue) {
            fields[field.name] = field.getValue();
          }
        }
      }
    }

    // 也检查直接在块上的字段
    if (block.getField) {
      const fieldNames = ['SERIAL', 'SPEED', 'PIN', 'MODE', 'VAR', 'TEXT', 'NUM']; // 常见字段名
      for (const fieldName of fieldNames) {
        const field = block.getField(fieldName);
        if (field) {
          fields[fieldName] = field.getValue();
        }
      }
    }

    console.log(`  📊 字段信息: ${JSON.stringify(fields, null, 2)}`);

    // 检查字段匹配
    let fieldMatches = true;
    if (criteria.fields) {
      for (const [fieldName, expectedValue] of Object.entries(criteria.fields)) {
        const actualValue = fields[fieldName];
        if (actualValue !== expectedValue) {
          console.log(`  ❌ 字段不匹配: ${fieldName} 期望 ${expectedValue}, 实际 ${actualValue} - 跳过`);
          fieldMatches = false;
          break;
        } else {
          console.log(`  ✅ 字段匹配: ${fieldName} = ${actualValue}`);
        }
      }
    }

    if (!fieldMatches) {
      continue; // 字段不匹配，跳过这个块
    }

    // 收集输入信息
    const inputs: any = {};
    for (const input of inputList) {
      if (input.name && input.connection) {
        const connectedBlock = input.connection.targetBlock();
        if (connectedBlock) {
          inputs[input.name] = {
            type: connectedBlock.type,
            id: connectedBlock.id
          };
        }
      }
    }

    // 如果执行到这里，说明块完全匹配
    const position = block.getRelativeToSurfaceXY();
    const blockInfo = {
      id: block.id,
      type: block.type,
      position: { x: position.x, y: position.y },
      block: block,
      fields: fields,
      inputs: inputs
    };
    
    console.log(`  ✅ 块完全匹配，添加到结果: ${JSON.stringify({
      id: blockInfo.id,
      type: blockInfo.type,
      position: blockInfo.position,
      fields: blockInfo.fields,
      inputs: blockInfo.inputs
    }, null, 2)}`);
    
    results.push(blockInfo);
  }

  console.log(`🎯 findBlocks 完成，找到 ${results.length} 个匹配的块`);

  // 根据位置筛选
  if (criteria.position) {
    console.log(`🎯 应用位置筛选: ${criteria.position}`);
    switch (criteria.position) {
      case 'first':
        console.log('  📍 选择第一个块');
        return results.slice(0, 1);
      case 'last':
        console.log('  📍 选择最后一个块');
        return results.slice(-1);
      case 'selected':
        console.log('  📍 筛选已选中的块');
        const selected = workspace.getSelected();
        return results.filter(r => r.block === selected);
    }
  }

  return results;
}

/**
 * 高亮块
 */
async function highlightBlocks(blocks: any[]): Promise<void> {
  try {
    for (const block of blocks) {
      if (block && block.getSvgRoot) {
        const svgRoot = block.getSvgRoot();
        if (svgRoot) {
          // 添加高亮样式
          svgRoot.style.filter = 'drop-shadow(0 0 10px #ffff00)';
          
          // 3秒后移除高亮
          setTimeout(() => {
            if (svgRoot && !block.disposed) {
              svgRoot.style.filter = '';
            }
          }, 3000);
        }
      }
    }
  } catch (error) {
    console.error('高亮块时出错:', error);
  }
}

/**
 * 创建变量
 */
async function createVariable(workspace: any, config: VariableConfig): Promise<{ name: string; id: string }> {
  try {
    // 创建 Blockly 变量
    const variable = workspace.createVariable(config.name, config.type);
    
    // 如果需要自动定义，创建 variable_define 块
    if (config.autoDefine !== false && config.scope === 'global') {
      const defineBlock = await createBlockSafely(workspace, 'variable_define', { x: 50, y: 50 }, false);
      if (defineBlock) {
        const varField = defineBlock.getField('VAR');
        if (varField) {
          varField.setValue(config.name);
        }
        
        // 如果有初始值，设置初始值
        if (config.initialValue !== undefined) {
          const valueInput = defineBlock.getInput('VALUE');
          if (valueInput) {
            // 根据类型创建相应的值块
            let valueBlock = null;
            switch (config.type) {
              case 'int':
              case 'float':
                valueBlock = await createBlockSafely(workspace, 'math_number', { x: 0, y: 0 }, false);
                if (valueBlock) {
                  const numField = valueBlock.getField('NUM');
                  if (numField) {
                    numField.setValue(config.initialValue);
                  }
                }
                break;
              case 'string':
                valueBlock = await createBlockSafely(workspace, 'text', { x: 0, y: 0 }, false);
                if (valueBlock) {
                  const textField = valueBlock.getField('TEXT');
                  if (textField) {
                    textField.setValue(config.initialValue);
                  }
                }
                break;
              case 'bool':
                valueBlock = await createBlockSafely(workspace, 'logic_boolean', { x: 0, y: 0 }, false);
                if (valueBlock) {
                  const boolField = valueBlock.getField('BOOL');
                  if (boolField) {
                    boolField.setValue(config.initialValue ? 'TRUE' : 'FALSE');
                  }
                }
                break;
            }
            
            if (valueBlock && valueInput.connection && valueBlock.outputConnection) {
              valueInput.connection.connect(valueBlock.outputConnection);
            }
          }
        }
      }
    }
    
    return {
      name: variable.name,
      id: variable.getId()
    };
  } catch (error) {
    console.error('创建变量时出错:', error);
    throw error;
  }
}

/**
 * 列出变量
 */
async function listVariables(workspace: any): Promise<Array<{ name: string; id: string; type?: string }>> {
  try {
    const variables = workspace.getAllVariables();
    return variables.map((variable: any) => ({
      name: variable.name,
      id: variable.getId(),
      type: variable.type
    }));
  } catch (error) {
    console.error('列出变量时出错:', error);
    return [];
  }
}

/**
 * 重命名变量
 */
async function renameVariable(workspace: any, oldName: string, newName: string): Promise<void> {
  try {
    const variables = workspace.getAllVariables();
    const variable = variables.find((v: any) => v.name === oldName);
    
    if (!variable) {
      throw new Error(`变量 "${oldName}" 不存在`);
    }
    
    workspace.renameVariableById(variable.getId(), newName);
  } catch (error) {
    console.error('重命名变量时出错:', error);
    throw error;
  }
}

/**
 * 删除变量
 */
async function deleteVariable(workspace: any, variableName: string): Promise<void> {
  try {
    const variables = workspace.getAllVariables();
    const variable = variables.find((v: any) => v.name === variableName);
    
    if (!variable) {
      throw new Error(`变量 "${variableName}" 不存在`);
    }
    
    workspace.deleteVariableById(variable.getId());
  } catch (error) {
    console.error('删除变量时出错:', error);
    throw error;
  }
}

// =============================================================================
// 导出所有工具函数
// =============================================================================

export const blocklyEditTools = {
  smartBlock: smartBlockTool,
  connectBlocks: connectBlocksTool,
  // createCodeStructure: createCodeStructureTool,
  configureBlock: configureBlockTool,
  variableManager: variableManagerTool,
  findBlock: findBlockTool,
  deleteBlock: deleteBlockTool
};

// 默认导出主要的编辑工具
export default smartBlockTool;
