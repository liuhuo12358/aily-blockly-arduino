import { arduinoGenerator } from "../../../editors/blockly-editor/components/blockly/generators/arduino/arduino";
import { ToolUseResult } from "./tools";
import { jsonrepair } from 'jsonrepair';
declare const Blockly: any;

/**
 * Blockly 可视化编程助手 - 简化版本
 * 移除了复杂的事件控制和自定义ID功能，提供稳定的基础操作
 */

// =============================================================================
// 类型定义
// =============================================================================

interface Position {
  x?: number;
  y?: number;
}

interface BlockReference {
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
  id?: string;  // 新增：支持预设块ID
  fields?: FieldConfig;
  inputs?: InputConfig;
  position?: Position;
  next?: {
    block: BlockConfig;
  };
}

interface SmartBlockArgs {
  type: string;
  id?: string;  // 新增：自定义块ID参数
  position?: Position | string;  // 支持字符串格式位置
  fields?: FieldConfig | string;  // 支持字符串格式字段
  inputs?: InputConfig | string;  // 支持字符串格式输入
  parentConnection?: ConnectionConfig;
  createVariables?: boolean;
  animate?: boolean;
}

interface SmartBlockResult extends ToolUseResult {
  metadata?: {
    blockId: string;
    blockType: string;
    position: Position;
    variablesCreated?: string[];
    totalBlocks?: number;
    parentConnected?: boolean;  // 新增：是否连接到父块
  };
}

interface ConnectionConfig {
  blockId: string;
  connectionType: 'next' | 'input';
  inputName?: string;
}

interface CodeStructureArgs {
  // 结构名称（任意字符串，用于日志和元数据）
  structure: string;
  
  // 动态结构定义 - 核心配置（支持字符串格式）
  config: string | {
    structureDefinition: {
      rootBlock: BlockConfig;
      additionalBlocks?: BlockConfig[];
      connectionRules?: Array<{
        source: string; // 输出块的引用（提供连接的块）- 对应 connectBlockTool 的 sourceBlock
        target: string; // 接收块的引用（接收连接的块）- 对应 connectBlockTool 的 targetBlock  
        inputName?: string; // 连接到接收块(target)的输入名
        connectionType?: 'next' | 'input' | 'statement';
      }>;
    };
  };
  
  // 放置选项
  insertPosition?: 'workspace' | 'after' | 'before' | 'input' | 'statement' | 'append';
  targetBlock?: string; // 目标块ID
  targetInput?: string; // 目标输入名
  position?: { x?: number; y?: number } | string; // 工作区位置（支持字符串格式）
}

interface CodeStructureResult extends ToolUseResult {
  metadata?: {
    structureType: string;
    createdBlocks: string[];
    rootBlockId?: string;
    connections: Array<{
      sourceId: string;
      targetId: string;
      connectionType: string;
    }>;
    workspaceOverview?: string;
    cppCode?: string;
  };
}

interface ConnectBlocksArgs {
  sourceBlock: BlockReference | string;  // 支持 BlockReference 或字符串 ID
  targetBlock: BlockReference | string;  // 支持 BlockReference 或字符串 ID
  connectionType: 'next' | 'input' | 'stack' | 'statement';
  inputName?: string;
}

interface ConnectBlocksResult extends ToolUseResult {
  metadata?: {
    sourceBlockId: string;
    targetBlockId: string;
    connectionType: string;
    inputName?: string;
    workspaceOverview?: string;  // 新增：工作区概览
    cppCode?: string;            // 新增：生成的C++代码
  };
}

interface VariableConfig {
  name: string;
  type: 'int' | 'float' | 'string' | 'bool';
  scope: 'global' | 'local';
  initialValue?: any;
  autoDefine?: boolean;
}

interface DeleteBlockResult extends ToolUseResult {
  metadata?: {
    deletedBlockId: string;
    deletedBlockType: string;
    totalDeleted?: number;
    cascadeDeleted?: string[];
    reconnectedBlocks?: number;
    workspaceOverview?: string;  // 新增：工作区概览
    cppCode?: string;            // 新增：生成的C++代码
  };
}

// =============================================================================
// 参数处理和修复函数
// =============================================================================

/**
 * 🔧 JSON 修复工具函数（增强版）
 */
interface JsonFixOptions {
  useJsonRepair?: boolean;
  enableBracesFix?: boolean;
  enableBracketsFix?: boolean;
  enableQuotesFix?: boolean;
  enableSyntaxFix?: boolean;
  logProcess?: boolean;
}

export function fixJsonString(
  jsonString: string, 
  options: JsonFixOptions = {}
): { 
  fixed: string; 
  success: boolean; 
  changes: string[]; 
  error?: string 
} {
  const {
    useJsonRepair = true,
    enableBracesFix = true,
    enableBracketsFix = true,
    enableQuotesFix = true,
    enableSyntaxFix = true,
    logProcess = false
  } = options;

  const changes: string[] = [];
  let fixedJson = jsonString.trim();

  if (logProcess) {
    console.log(`🔧 开始修复 JSON: ${jsonString}`);
  }

  // 首先尝试直接解析
  try {
    JSON.parse(fixedJson);
    return { fixed: fixedJson, success: true, changes };
  } catch (error) {
    if (logProcess) {
      console.log(`⚠️ 需要修复 JSON: ${(error as Error).message}`);
    }
  }

  // 使用 jsonrepair 库修复
  if (useJsonRepair) {
    try {
      const repaired = jsonrepair(fixedJson);
      JSON.parse(repaired); // 验证修复结果
      changes.push('jsonrepair库自动修复');
      if (logProcess) {
        console.log(`✅ jsonrepair 修复成功: ${repaired}`);
      }
      return { fixed: repaired, success: true, changes };
    } catch (repairError) {
      if (logProcess) {
        console.log(`❌ jsonrepair 修复失败: ${(repairError as Error).message}`);
      }
    }
  }

  // 自定义修复逻辑
  try {
    if (enableSyntaxFix) {
      // 修复缺失的引号
      fixedJson = fixedJson.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
      // 修复尾随逗号
      fixedJson = fixedJson.replace(/,\s*([}\]])/g, '$1');
      // 修复缺失的逗号
      fixedJson = fixedJson.replace(/([}\]"])\s*([{"\[])/g, '$1,$2');
      changes.push('自定义基础语法修复');
    }

    // 修复括号
    if (enableBracesFix || enableBracketsFix) {
      const openBraces = (fixedJson.match(/\{/g) || []).length;
      const closeBraces = (fixedJson.match(/\}/g) || []).length;
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;

      if (openBraces > closeBraces) {
        fixedJson += '}'.repeat(openBraces - closeBraces);
        changes.push('修复缺失的闭合大括号');
      }
      if (openBrackets > closeBrackets) {
        fixedJson += ']'.repeat(openBrackets - closeBrackets);
        changes.push('修复缺失的闭合中括号');
      }
    }

    JSON.parse(fixedJson);
    return { fixed: fixedJson, success: true, changes };

  } catch (customError) {
    return { 
      fixed: fixedJson, 
      success: false, 
      changes, 
      error: `所有修复尝试都失败了: ${(customError as Error).message}`
    };
  }
}

// =============================================================================
// 核心工具函数
// =============================================================================

/**
 * 计算两个字符串的编辑距离（Levenshtein Distance）
 */
function calculateEditDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  // 初始化矩阵
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  
  // 填充矩阵
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // 删除
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j - 1] + 1  // 替换
        );
      }
    }
  }
  
  return matrix[str1.length][str2.length];
}

/**
 * 🔍 模糊匹配查找块 - 支持多种匹配策略
 */
function findBlockByFuzzyId(providedId: string, workspace: any): any | null {
  if (!providedId || !workspace) {
    console.log('⚠️ findBlockByFuzzyId: 参数无效');
    return null;
  }

  console.log(`🔍 开始模糊匹配块ID: "${providedId}"`);
  
  // 获取工作区中的所有块
  const allBlocks = workspace.getAllBlocks();
  if (!allBlocks || allBlocks.length === 0) {
    console.log('⚠️ 工作区中没有找到任何块');
    return null;
  }

  console.log(`📊 工作区中共有 ${allBlocks.length} 个块`);
  
  // 1. 首先尝试精确匹配
  for (const block of allBlocks) {
    if (block.id === providedId) {
      console.log(`✅ 精确匹配成功: ${block.type}(${block.id})`);
      return block;
    }
  }
  console.log('⚠️ 精确匹配失败，尝试模糊匹配...');

  // 2. 模糊匹配策略
  const matches: Array<{block: any, score: number, reason: string}> = [];
  
  for (const block of allBlocks) {
    const blockId = block.id;
    let score = 0;
    let reason = '';
    
    // 策略1: 包含匹配 - 较短的ID在较长的ID中连续存在
    if (providedId.length > blockId.length && providedId.includes(blockId)) {
      score = 90;
      reason = `工作区ID "${blockId}" 连续包含在提供的ID "${providedId}" 中`;
    } else if (blockId.length > providedId.length && blockId.includes(providedId)) {
      score = 85;
      reason = `提供的ID "${providedId}" 连续包含在工作区ID "${blockId}" 中`;
    }
    
    // 策略2: 前缀匹配
    else if (blockId.startsWith(providedId) || providedId.startsWith(blockId)) {
      const minLength = Math.min(blockId.length, providedId.length);
      const maxLength = Math.max(blockId.length, providedId.length);
      score = (minLength / maxLength) * 80;
      reason = `前缀匹配: "${providedId}" 与 "${blockId}" 有共同前缀`;
    }
    
    // 策略3: 后缀匹配
    else if (blockId.endsWith(providedId) || providedId.endsWith(blockId)) {
      const minLength = Math.min(blockId.length, providedId.length);
      const maxLength = Math.max(blockId.length, providedId.length);
      score = (minLength / maxLength) * 75;
      reason = `后缀匹配: "${providedId}" 与 "${blockId}" 有共同后缀`;
    }
    
    // 策略4: 编辑距离匹配（用于处理1-2个字符的差异）
    else {
      const editDistance = calculateEditDistance(providedId, blockId);
      const maxLength = Math.max(providedId.length, blockId.length);
      if (editDistance <= 2 && maxLength > 5) { // 最多允许2个字符差异，且ID足够长
        score = ((maxLength - editDistance) / maxLength) * 70;
        reason = `编辑距离匹配: "${providedId}" 与 "${blockId}" 相似度高(距离=${editDistance})`;
      }
    }
    
    if (score > 0) {
      matches.push({block, score, reason});
      console.log(`🎯 候选匹配: ${block.type}(${blockId}) - 得分: ${score.toFixed(2)} - ${reason}`);
    }
  }
  
  if (matches.length === 0) {
    console.log('❌ 未找到任何匹配的块');
    return null;
  }
  
  // 按得分排序，选择最佳匹配
  matches.sort((a, b) => b.score - a.score);
  const bestMatch = matches[0];
  
  console.log(`🏆 最佳匹配: ${bestMatch.block.type}(${bestMatch.block.id})`);
  console.log(`📊 匹配得分: ${bestMatch.score.toFixed(2)}`);
  console.log(`📋 匹配原因: ${bestMatch.reason}`);
  
  // 如果最佳匹配得分太低，拒绝匹配
  if (bestMatch.score < 60) {
    console.log('⚠️ 最佳匹配得分过低，拒绝匹配');
    return null;
  }
  
  // 如果有多个高分匹配，提醒可能存在歧义
  const highScoreMatches = matches.filter(m => m.score >= bestMatch.score - 10);
  if (highScoreMatches.length > 1) {
    console.log(`⚠️ 检测到 ${highScoreMatches.length} 个高分匹配，可能存在歧义:`);
    highScoreMatches.forEach(m => {
      console.log(`   - ${m.block.type}(${m.block.id}) - 得分: ${m.score.toFixed(2)}`);
    });
  }
  
  return bestMatch.block;
}

/**
 * 🎯 智能块查找函数（支持多种匹配策略）
 * 提供精确匹配和模糊匹配，支持其他工具函数复用
 * 
 * @param workspace Blockly工作区
 * @param blockId 要查找的块ID（支持完整ID或部分ID）
 * @param options 查找选项
 * @returns 找到的块或null
 */
export function getBlockByIdSmart(
  workspace: any, 
  blockId: string, 
  options: {
    enableFuzzyMatch?: boolean;
    minScore?: number;
    logDetails?: boolean;
  } = {}
): any | null {
  const { 
    enableFuzzyMatch = true, 
    minScore = 60, 
    logDetails = true 
  } = options;

  if (!workspace || !blockId) {
    if (logDetails) console.log('⚠️ getBlockByIdSmart: 参数无效');
    return null;
  }

  if (logDetails) console.log(`🎯 智能查找块: "${blockId}"`);
  
  // 1. 🎯 精确匹配
  if (logDetails) console.log('📍 尝试精确匹配...');
  let block = workspace.getBlockById(blockId);
  if (block) {
    if (logDetails) console.log(`✅ 精确匹配成功: ${block.type}(${block.id})`);
    return block;
  }

  // 2. 🔍 模糊匹配（如果启用）
  if (!enableFuzzyMatch) {
    if (logDetails) console.log('❌ 精确匹配失败，模糊匹配已禁用');
    return null;
  }

  if (logDetails) console.log('🔍 开始智能模糊匹配...');
  
  const allBlocks = workspace.getAllBlocks();
  if (!allBlocks || allBlocks.length === 0) {
    if (logDetails) console.log('⚠️ 工作区中没有任何块');
    return null;
  }

  const matches: Array<{
    block: any;
    score: number;
    reason: string;
  }> = [];

  for (const currentBlock of allBlocks) {
    const currentId = currentBlock.id;
    let score = 0;
    let reason = '';

    // 📍 策略1: 前缀匹配 (权重: 90)
    if (currentId.startsWith(blockId)) {
      score = 90;
      reason = '前缀匹配';
    }
    // 📍 策略2: 后缀匹配 (权重: 85)
    else if (currentId.endsWith(blockId)) {
      score = 85;
      reason = '后缀匹配';
    }
    // 📍 策略3: 包含匹配 (权重: 80)
    else if (currentId.includes(blockId)) {
      score = 80;
      reason = '包含匹配';
    }
    // 📍 策略4: 编辑距离匹配 (权重: 动态)
    else {
      const distance = calculateEditDistance(blockId, currentId);
      const maxLength = Math.max(blockId.length, currentId.length);
      
      if (maxLength > 0 && distance <= maxLength * 0.4) { // 允许40%的差异
        score = Math.max(0, 70 - (distance / maxLength) * 30);
        reason = `编辑距离匹配 (距离: ${distance})`;
      }
    }

    // 📈 额外加分项
    if (score > 0) {
      // 类型名称相似度加分 (最多+10分)
      if (currentBlock.type && blockId.length > 2) {
        const blockIdPrefix = blockId.toLowerCase().substring(0, Math.min(3, blockId.length));
        if (currentBlock.type.toLowerCase().includes(blockIdPrefix)) {
          score += 10;
          reason += ' + 类型相似';
        }
      }
      
      // ID长度相似度加分 (最多+5分)
      const lengthDiff = Math.abs(currentId.length - blockId.length);
      if (lengthDiff <= 2) {
        score += 5;
        reason += ' + 长度相似';
      }

      matches.push({ block: currentBlock, score, reason });
    }
  }

  if (matches.length === 0) {
    if (logDetails) console.log('❌ 未找到任何匹配的块');
    return null;
  }

  // 按得分排序
  matches.sort((a, b) => b.score - a.score);
  
  const bestMatch = matches[0];
  
  // 检查最佳匹配得分
  if (bestMatch.score < minScore) {
    if (logDetails) {
      console.log(`⚠️ 最佳匹配得分过低 (${bestMatch.score.toFixed(2)} < ${minScore})`);
      console.log(`   候选块: ${bestMatch.block.type}(${bestMatch.block.id})`);
    }
    return null;
  }

  // 记录匹配结果
  if (logDetails) {
    console.log(`🏆 最佳匹配: ${bestMatch.block.type}(${bestMatch.block.id})`);
    console.log(`📊 匹配得分: ${bestMatch.score.toFixed(2)}`);
    console.log(`📋 匹配原因: ${bestMatch.reason}`);

    // 如果有多个高分匹配，提醒歧义
    const highScoreMatches = matches.filter(m => m.score >= bestMatch.score - 5);
    if (highScoreMatches.length > 1) {
      console.log(`⚠️ 检测到 ${highScoreMatches.length} 个高分匹配:`);
      highScoreMatches.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.block.type}(${m.block.id}) - 得分: ${m.score.toFixed(2)} - ${m.reason}`);
      });
    }
  }

  return bestMatch.block;
}

// =============================================================================
// 核心工具函数
// =============================================================================

/**
 * 获取当前活动的 Blockly 工作区 - 增强版本
 */
export function getActiveWorkspace(): any {
  console.log('🔍 查找活动工作区...');
  
  // 方法1: 检查 window.blocklyWorkspace
  if ((window as any).blocklyWorkspace) {
    console.log('✅ 方法1成功: 找到 window.blocklyWorkspace');
    return (window as any).blocklyWorkspace;
  }

  // 方法2: 检查 Angular 组件引用
  if ((window as any).angularComponentRef && (window as any).angularComponentRef.blocklyWorkspace) {
    console.log('✅ 方法2成功: 找到 angularComponentRef.blocklyWorkspace');
    return (window as any).angularComponentRef.blocklyWorkspace;
  }

  // 方法3: 使用 Blockly.getMainWorkspace()
  try {
    if (Blockly && Blockly.getMainWorkspace) {
      const mainWorkspace = Blockly.getMainWorkspace();
      if (mainWorkspace && mainWorkspace.getAllBlocks) {
        console.log('✅ 方法3成功: 找到 Blockly.getMainWorkspace()');
        return mainWorkspace;
      }
    }
  } catch (error) {
    console.log('⚠️ 方法3失败:', error);
  }

  // 方法4: 检查 window['Blockly'].getMainWorkspace()
  try {
    if ((window as any)['Blockly']?.getMainWorkspace) {
      const mainWorkspace = (window as any)['Blockly'].getMainWorkspace();
      if (mainWorkspace && mainWorkspace.getAllBlocks) {
        console.log('✅ 方法4成功: 找到 window[\'Blockly\'].getMainWorkspace()');
        return mainWorkspace;
      }
    }
  } catch (error) {
    console.log('⚠️ 方法4失败:', error);
  }

  // 方法5: 查找所有工作区
  try {
    if (Blockly && (Blockly as any).Workspace?.getAll) {
      const workspaces = (Blockly as any).Workspace.getAll();
      console.log(`🔍 方法5: 找到 ${workspaces.length} 个工作区`);
      
      if (workspaces.length > 0) {
        for (const workspace of workspaces) {
          if (workspace && workspace.getAllBlocks) {
            console.log('✅ 方法5成功: 找到有效工作区');
            return workspace;
          }
        }
      }
    }
  } catch (error) {
    console.log('⚠️ 方法5失败:', error);
  }

  // 方法6: 检查 window['Blockly'].Workspace.getAll()
  try {
    if ((window as any)['Blockly']?.Workspace?.getAll) {
      const workspaces = (window as any)['Blockly'].Workspace.getAll();
      console.log(`🔍 方法6: 找到 ${workspaces.length} 个工作区`);
      
      if (workspaces.length > 0) {
        for (const workspace of workspaces) {
          if (workspace && workspace.getAllBlocks) {
            console.log('✅ 方法6成功: 找到有效工作区');
            return workspace;
          }
        }
      }
    }
  } catch (error) {
    console.log('⚠️ 方法6失败:', error);
  }

  // 方法7: 检查 DOM 中的 blocklyDiv
  try {
    const blocklyDiv = document.getElementById('blocklyDiv');
    if (blocklyDiv) {
      console.log('🔍 方法7: 找到 blocklyDiv DOM 元素');
      // 尝试从 DOM 元素获取工作区实例
      if ((blocklyDiv as any).workspace) {
        console.log('✅ 方法7成功: 从 blocklyDiv 获取工作区');
        return (blocklyDiv as any).workspace;
      }
    }
  } catch (error) {
    console.log('⚠️ 方法7失败:', error);
  }

  // 方法8: 尝试从 Angular 注入器获取 BlocklyService
  try {
    const angularServiceRef = (window as any).angularServiceRef;
    if (angularServiceRef && angularServiceRef.blocklyService && angularServiceRef.blocklyService.workspace) {
      console.log('✅ 方法8成功: 从 Angular BlocklyService 获取工作区');
      return angularServiceRef.blocklyService.workspace;
    }
  } catch (error) {
    console.log('⚠️ 方法8失败:', error);
  }

  // 所有方法都失败了
  console.error('❌ 所有工作区查找方法都失败了');
  console.log('🔍 调试信息:');
  console.log('- window.blocklyWorkspace:', !!(window as any).blocklyWorkspace);
  console.log('- window.angularComponentRef:', !!(window as any).angularComponentRef);
  console.log('- Blockly.getMainWorkspace:', !!(Blockly && Blockly.getMainWorkspace));
  console.log('- window[\'Blockly\']:', !!((window as any)['Blockly']));
  console.log('- DOM blocklyDiv:', !!document.getElementById('blocklyDiv'));
  console.log('- angularServiceRef:', !!(window as any).angularServiceRef);
  
  throw new Error('未找到活动的 Blockly 工作区。请确保 Blockly 已正确初始化。');
}

/**
 * 简化版事件系统控制 - 用于避免连接操作时的事件冲突
 */
let eventSystemState = {
  wasRecordingUndo: true,
  currentGroup: null as string | null
};

function disableBlocklyEvents(): void {
  try {
    if (Blockly && Blockly.Events) {
      eventSystemState.wasRecordingUndo = Blockly.Events.getRecordUndo();
      eventSystemState.currentGroup = Blockly.Events.getGroup();
      Blockly.Events.disable();
      console.log('🔇 Blockly事件系统已禁用');
    }
  } catch (error) {
    console.warn('禁用事件系统失败:', error);
  }
}

function enableBlocklyEvents(): void {
  try {
    if (Blockly && Blockly.Events) {
      Blockly.Events.enable();
      if (eventSystemState.currentGroup) {
        Blockly.Events.setGroup(eventSystemState.currentGroup);
      } else {
        Blockly.Events.setGroup(false);
      }
      Blockly.Events.setRecordUndo(eventSystemState.wasRecordingUndo);
      console.log('🔊 Blockly事件系统已恢复');
    }
  } catch (error) {
    console.warn('恢复事件系统失败:', error);
  }
}

/**
 * 复杂JSON修复功能 - 支持多种修复策略
 */
interface JsonFixResult {
  success: boolean;
  fixed: string;
  error?: string;
  changes: string[];
}

/**
 * 简化的块创建函数
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

          // 直接创建块，使用Blockly默认事件处理
          const block = workspace.newBlock(type);

          if (!block) {
            reject(new Error(`创建块 "${type}" 失败`));
            return;
          }

          // 设置位置
          if (position && typeof position.x === 'number' && typeof position.y === 'number') {
            block.moveBy(position.x, position.y);
          }

          // 初始化块
          block.initSvg();
          
          if (animate) {
            block.render();
          }

          resolve(block);
        } catch (error) {
          console.error('createBlockSafely 内部错误:', error);
          reject(error);
        }
      }, 50);
    });
  } catch (error) {
    console.error('createBlockSafely 错误:', error);
    throw error;
  }
}

/**
 * 配置块的字段
 */
function configureBlockFields(block: any, fields: FieldConfig): void {
  if (!fields) return;
  
  try {
    for (const [fieldName, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        try {
          block.setFieldValue(value.toString(), fieldName);
          console.log(`✅ 字段设置成功: ${fieldName} = ${value}`);
        } catch (fieldError) {
          console.warn(`⚠️ 字段设置失败: ${fieldName}`, fieldError);
        }
      }
    }
  } catch (error) {
    console.warn('配置字段时出错:', error);
  }
}

/**
 * 简化的连接检查
 */
function checkConnectionCompatibility(connection1: any, connection2: any): boolean {
  if (!connection1 || !connection2) return false;
  
  try {
    // 使用数字常量检查连接类型兼容性
    // Blockly 连接类型：1=INPUT_VALUE, 2=OUTPUT_VALUE, 3=NEXT_STATEMENT, 4=PREVIOUS_STATEMENT
    const type1 = connection1.type;
    const type2 = connection2.type;
    
    // NEXT_STATEMENT (3) 连接到 PREVIOUS_STATEMENT (4)
    if (type1 === 3 && type2 === 4) return true;
    if (type1 === 4 && type2 === 3) return true;
    
    // OUTPUT_VALUE (2) 连接到 INPUT_VALUE (1)
    if (type1 === 2 && type2 === 1) return true;
    if (type1 === 1 && type2 === 2) return true;
    
    return false;
  } catch (error) {
    console.warn('连接兼容性检查失败:', error);
    return false;
  }
}

/**
 * 智能块插入功能 - 支持自动后移已连接的块
 */
interface SmartInsertResult {
  smartInsertion: boolean;
  autoMovedBlock: string | null;
}

async function smartInsertBlock(
  workspace: any,
  newBlock: any,
  parentBlock: any,
  connectionType: 'next' | 'input' | 'statement',
  inputName?: string
): Promise<SmartInsertResult> {
  console.log(`🎯 智能插入开始: ${connectionType}`);
  console.log(`📊 新块: ${newBlock.type} (ID: ${newBlock.id})`);
  console.log(`📊 父块: ${parentBlock.type} (ID: ${parentBlock.id})`);
  
  try {
    switch (connectionType) {
      case 'next':
        // 对于next连接，检查是否已有后续块
        const existingNextBlock = parentBlock.getNextBlock();
        if (existingNextBlock) {
          console.log(`🔄 检测到已有后续块: ${existingNextBlock.type}(${existingNextBlock.id})`);
          
          // 断开现有连接
          if (parentBlock.nextConnection && parentBlock.nextConnection.targetConnection) {
            parentBlock.nextConnection.disconnect();
          }
          
          // 连接新块到父块
          if (parentBlock.nextConnection && newBlock.previousConnection) {
            disableBlocklyEvents();
            try {
              parentBlock.nextConnection.connect(newBlock.previousConnection);
              console.log('✅ 新块已连接到父块');
              
              // 将原后续块连接到新块的末尾
              if (newBlock.nextConnection && existingNextBlock.previousConnection) {
                newBlock.nextConnection.connect(existingNextBlock.previousConnection);
                console.log('✅ 原后续块已重新连接到新块');
                return { smartInsertion: true, autoMovedBlock: existingNextBlock.type };
              }
            } finally {
              enableBlocklyEvents();
            }
          }
        } else {
          // 没有现有连接，直接连接
          if (parentBlock.nextConnection && newBlock.previousConnection) {
            disableBlocklyEvents();
            try {
              parentBlock.nextConnection.connect(newBlock.previousConnection);
              console.log('✅ 新块已直接连接');
            } finally {
              enableBlocklyEvents();
            }
          }
        }
        return { smartInsertion: false, autoMovedBlock: null };
        
      case 'input':
        if (!inputName) {
          throw new Error('input连接需要指定inputName参数');
        }
        
        const inputConnection = parentBlock.getInput(inputName);
        if (!inputConnection || !inputConnection.connection) {
          throw new Error(`父块 ${parentBlock.type} 没有名为 "${inputName}" 的输入`);
        }
        
        console.log(`🔍 输入连接类型检查:`);
        console.log(`  - 输入连接类型: ${inputConnection.type}`);
        console.log(`  - 新块有 outputConnection: ${!!newBlock.outputConnection}`);
        console.log(`  - 新块有 previousConnection: ${!!newBlock.previousConnection}`);
        
        // 判断是语句输入还是值输入
        const isStatementInput = inputConnection.type === 3; // type 3 是 statement 连接
        const requiredConnection = isStatementInput ? newBlock.previousConnection : newBlock.outputConnection;
        
        if (!requiredConnection) {
          const connectionType = isStatementInput ? 'previousConnection' : 'outputConnection';
          throw new Error(`新块 ${newBlock.type} 没有所需的 ${connectionType}，无法连接到输入 "${inputName}"`);
        }
        
        // 检查是否已有连接的块
        const existingConnectedBlock = inputConnection.connection.targetBlock();
        if (existingConnectedBlock) {
          console.log(`🔄 检测到输入 "${inputName}" 已有连接块: ${existingConnectedBlock.type}(${existingConnectedBlock.id})`);
          
          disableBlocklyEvents();
          try {
            // 断开现有连接
            inputConnection.connection.disconnect();
            
            // 连接新块
            inputConnection.connection.connect(requiredConnection);
            console.log(`✅ 新块已连接到输入 (${isStatementInput ? '语句' : '值'}连接)`);
            
            // 如果是语句连接且新块有后续连接，尝试将原有块连接到新块的后面
            if (isStatementInput && newBlock.nextConnection && existingConnectedBlock.previousConnection) {
              console.log(`🔗 尝试将原有块连接到新块后面`);
              try {
                newBlock.nextConnection.connect(existingConnectedBlock.previousConnection);
                console.log('✅ 原有块已重新连接到新块后面');
                return { smartInsertion: true, autoMovedBlock: existingConnectedBlock.type };
              } catch (error) {
                console.warn('⚠️ 无法重新连接原有块到后面:', error);
              }
            }
            // 如果是值连接且新块有输入，尝试将原有块连接到新块的输入
            else if (!isStatementInput && newBlock.inputList && newBlock.inputList.length > 0) {
              for (const newBlockInput of newBlock.inputList) {
                if (newBlockInput.connection && !newBlockInput.connection.targetBlock() && 
                    newBlockInput.type !== 1 && existingConnectedBlock.outputConnection) { // 不是语句输入
                  console.log(`🔗 尝试将原有块连接到新块的输入 "${newBlockInput.name}"`);
                  try {
                    newBlockInput.connection.connect(existingConnectedBlock.outputConnection);
                    console.log('✅ 原有块已重新连接到新块');
                    return { smartInsertion: true, autoMovedBlock: existingConnectedBlock.type };
                  } catch (error) {
                    console.warn('⚠️ 无法重新连接原有块:', error);
                  }
                  break;
                }
              }
            }
          } catch (connectError) {
            console.error('❌ 连接失败:', connectError);
            throw connectError;
          } finally {
            enableBlocklyEvents();
          }
          
          return { smartInsertion: true, autoMovedBlock: null };
        } else {
          // 没有现有连接，直接连接
          disableBlocklyEvents();
          try {
            inputConnection.connection.connect(requiredConnection);
            console.log(`✅ 新块已直接连接到输入 (${isStatementInput ? '语句' : '值'}连接)`);
          } catch (connectError) {
            console.error('❌ 直接连接失败:', connectError);
            throw connectError;
          } finally {
            enableBlocklyEvents();
          }
          return { smartInsertion: false, autoMovedBlock: null };
        }
        
      case 'statement':
        // 对于statement连接，查找语句输入
        let statementInput = null;
        if (inputName) {
          statementInput = parentBlock.getInput(inputName);
        }
        
        // 如果没找到，尝试常见名称
        if (!statementInput) {
          const commonNames = ['DO', 'STACK', 'NAME', 'DO0', 'BODY'];
          for (const name of commonNames) {
            statementInput = parentBlock.getInput(name);
            if (statementInput) break;
          }
        }
        
        if (statementInput && statementInput.connection) {
          disableBlocklyEvents();
          try {
            const existingStatementBlock = statementInput.connection.targetBlock();
            if (existingStatementBlock) {
              // 找到语句链的末尾
              let lastBlock = existingStatementBlock;
              while (lastBlock.getNextBlock && lastBlock.getNextBlock()) {
                lastBlock = lastBlock.getNextBlock();
              }
              
              // 将新块连接到末尾
              if (lastBlock.nextConnection && newBlock.previousConnection) {
                lastBlock.nextConnection.connect(newBlock.previousConnection);
                console.log('✅ 新块已连接到语句链末尾');
                return { smartInsertion: true, autoMovedBlock: existingStatementBlock.type };
              }
            } else {
              // 直接连接
              if (newBlock.previousConnection) {
                statementInput.connection.connect(newBlock.previousConnection);
                console.log('✅ 新块已直接连接到语句输入');
                return { smartInsertion: false, autoMovedBlock: null };
              }
            }
          } finally {
            enableBlocklyEvents();
          }
        } else {
          throw new Error(`无法找到有效的statement输入`);
        }
        break;
        
      default:
        throw new Error(`不支持的连接类型: ${connectionType}`);
    }
    
    return { smartInsertion: false, autoMovedBlock: null };
  } catch (error) {
    console.error('智能插入失败:', error);
    throw error;
  }
}

/**
 * 查找块 - 简化版本
 */
function findBlock(workspace: any, reference: BlockReference): any {
  if (!workspace || !reference) return null;
  
  try {
    const allBlocks = workspace.getAllBlocks();
    
    // 按类型查找
    if (reference.type) {
      const blocksByType = allBlocks.filter((block: any) => block.type === reference.type);
      
      if (blocksByType.length === 0) return null;
      if (blocksByType.length === 1) return blocksByType[0];
      
      // 如果有多个同类型块，根据位置选择
      if (reference.position === 'first') return blocksByType[0];
      if (reference.position === 'last') return blocksByType[blocksByType.length - 1];
    }
    
    // 获取选中的块
    if (reference.position === 'selected') {
      const selected = workspace.getSelected?.();
      return selected || null;
    }
    
    return null;
  } catch (error) {
    console.error('查找块时出错:', error);
    return null;
  }
}

// =============================================================================
// 主要工具函数
// =============================================================================

/**
 * 智能块工具 - 增强版本，支持嵌套输入处理
 */
export async function smartBlockTool(args: SmartBlockArgs): Promise<SmartBlockResult> {
  console.log('🔧 智能块工具 - 增强版本');
  console.log('📥 输入参数:', JSON.stringify(args, null, 2));

  try {
    const workspace = getActiveWorkspace();
    let { type, id, fields, inputs, position, parentConnection, animate = true } = args;

    // 🔧 参数修复和转换
    console.log('🔄 开始参数修复和转换...');
    
    // 修复 position 参数
    let parsedPosition: Position = {};
    if (typeof position === 'string') {
      console.log(`⚠️ position 是字符串 "${position}"，尝试解析...`);
      try {
        if (position.trim().startsWith('{')) {
          parsedPosition = JSON.parse(position);
          console.log(`✅ position JSON 解析成功: ${JSON.stringify(parsedPosition)}`);
        } else if (position.includes(',')) {
          const [x, y] = position.split(',').map(v => parseInt(v.trim()) || 0);
          parsedPosition = { x, y };
          console.log(`✅ position 坐标解析成功: ${JSON.stringify(parsedPosition)}`);
        } else {
          parsedPosition = { x: 0, y: 0 };
          console.log(`✅ position 设为默认值: ${JSON.stringify(parsedPosition)}`);
        }
      } catch (error) {
        console.error(`❌ position 解析失败: ${(error as Error).message}`);
        parsedPosition = { x: 0, y: 0 };
      }
    } else if (position && typeof position === 'object') {
      parsedPosition = position;
    } else {
      parsedPosition = { x: 0, y: 0 };
    }

    // 修复 fields 参数
    let parsedFields: FieldConfig = {};
    if (typeof fields === 'string') {
      console.log(`⚠️ fields 是字符串 "${fields}"，尝试解析...`);
      try {
        if (fields.trim()) {
          parsedFields = JSON.parse(fields);
          console.log(`✅ fields 修复为: ${JSON.stringify(parsedFields)}`);
        }
      } catch (error) {
        console.error(`❌ fields 解析失败: ${(error as Error).message}`);
        parsedFields = {};
      }
    } else if (fields && typeof fields === 'object') {
      parsedFields = fields;
    }

    // 修复 inputs 参数
    let parsedInputs: InputConfig = {};
    if (typeof inputs === 'string') {
      console.log(`⚠️ inputs 是字符串 "${inputs}"，尝试解析...`);
      
      if (inputs.trim() && inputs !== '{}') {
        const fixResult = fixJsonString(inputs, { logProcess: true });
        
        if (fixResult.success) {
          try {
            parsedInputs = JSON.parse(fixResult.fixed);
            console.log(`✅ inputs JSON 解析成功: ${JSON.stringify(parsedInputs)}`);
          } catch (parseError) {
            console.error(`❌ 修复后的 JSON 仍然无法解析: ${(parseError as Error).message}`);
            parsedInputs = {};
          }
        } else {
          console.error(`❌ JSON 修复失败: ${fixResult.error}`);
          parsedInputs = {};
        }
      }
    } else if (inputs && typeof inputs === 'object') {
      parsedInputs = inputs;
    }

    // 修复 parentConnection 参数
    let parsedParentConnection: ConnectionConfig | undefined = undefined;
    if (typeof parentConnection === 'string') {
      console.log(`⚠️ parentConnection 是字符串 "${parentConnection}"，尝试解析...`);
      try {
        if ((parentConnection as string).trim()) {
          parsedParentConnection = JSON.parse(parentConnection);
          console.log(`✅ parentConnection 修复为: ${JSON.stringify(parsedParentConnection)}`);
        }
      } catch (error) {
        console.error(`❌ parentConnection 解析失败: ${(error as Error).message}`);
        parsedParentConnection = undefined;
      }
    } else if (parentConnection && typeof parentConnection === 'object') {
      parsedParentConnection = parentConnection;
    }

    // 验证块类型
    if (!Blockly?.Blocks[type]) {
      throw new Error(`未知的块类型: ${type}`);
    }

    // 构建BlockConfig对象
    const blockConfig: BlockConfig = {
      type,
      fields: parsedFields,
      inputs: parsedInputs,
      position: parsedPosition
    };

    console.log(`🔨 创建增强块配置:`, JSON.stringify(blockConfig, null, 2));

    // 使用增强的createBlockFromConfig函数，支持嵌套输入
    const result = await createBlockFromConfig(workspace, blockConfig);

    if (!result?.block) {
      throw new Error(`块创建失败: ${type}`);
    }

    console.log(`✅ 智能块创建成功: ${type}[${result.block.id}]`);

    // 处理父连接
    if (parsedParentConnection) {
      console.log(`🔗 开始处理父连接: ${JSON.stringify(parsedParentConnection)}`);
      const success = await connectToParent(workspace, result.block, parsedParentConnection);
      if (success) {
        console.log(`✅ 父连接成功`);
      } else {
        console.warn(`⚠️ 父连接失败`);
      }
    }

    return {
      is_error: false,
      content: `成功创建智能块 ${type}，包含 ${result.totalBlocks || 1} 个块`,
      metadata: {
        blockId: result.block.id,
        blockType: type,
        position: parsedPosition,
        totalBlocks: result.totalBlocks || 1,
        parentConnected: !!parsedParentConnection
      }
    };
  } catch (error) {
    console.error('❌ 智能块工具执行失败:', error);
    return {
      is_error: true,
      content: `智能块工具执行失败: ${(error as Error).message}`,
      details: `错误详情: ${(error as Error).stack}`
    };
  }
}

/**
 * 连接块到父块
 * @param workspace Blockly工作区
 * @param childBlock 要连接的子块
 * @param connectionConfig 连接配置
 * @returns 是否连接成功
 */
async function connectToParent(
  workspace: any, 
  childBlock: any, 
  connectionConfig: ConnectionConfig
): Promise<boolean> {
  try {
    console.log(`🔗 开始连接到父块: ${connectionConfig.blockId}`);
    
    // 使用智能查找获取父块
    const parentBlock = getBlockByIdSmart(workspace, connectionConfig.blockId);
    if (!parentBlock) {
      console.error(`❌ 找不到父块: ${connectionConfig.blockId}`);
      return false;
    }

    console.log(`✅ 找到父块: ${parentBlock.type}[${parentBlock.id}]`);
    
    // 根据连接类型进行连接
    if (connectionConfig.connectionType === 'next') {
      // 语句连接（next/previous）
      if (parentBlock.nextConnection && childBlock.previousConnection) {
        console.log(`🔗 尝试语句连接: ${parentBlock.type}.next ← ${childBlock.type}.previous`);
        parentBlock.nextConnection.connect(childBlock.previousConnection);
        console.log(`✅ 语句连接成功`);
        return true;
      } else {
        console.warn(`⚠️ 语句连接失败 - 连接点不匹配`);
        console.warn(`  - 父块 next 连接: ${!!parentBlock.nextConnection}`);
        console.warn(`  - 子块 previous 连接: ${!!childBlock.previousConnection}`);
        return false;
      }
    } else if (connectionConfig.connectionType === 'input' && connectionConfig.inputName) {
      // 输入连接
      const inputConnection = parentBlock.getInput(connectionConfig.inputName);
      if (inputConnection && inputConnection.connection && childBlock.outputConnection) {
        console.log(`🔗 尝试输入连接: ${parentBlock.type}.${connectionConfig.inputName} ← ${childBlock.type}.output`);
        inputConnection.connection.connect(childBlock.outputConnection);
        console.log(`✅ 输入连接成功`);
        return true;
      } else {
        console.warn(`⚠️ 输入连接失败 - 连接点不匹配`);
        console.warn(`  - 父块输入 "${connectionConfig.inputName}": ${!!inputConnection?.connection}`);
        console.warn(`  - 子块 output 连接: ${!!childBlock.outputConnection}`);
        return false;
      }
    } else {
      console.error(`❌ 不支持的连接类型: ${connectionConfig.connectionType}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 连接到父块时出错:`, error);
    return false;
  }
}

/**
 * 应用动态扩展到块
 * 这个函数检查块是否需要动态输入，并根据配置添加所需的输入
 */
async function applyDynamicExtensions(block: any, config: any): Promise<void> {
  console.log('🔧 applyDynamicExtensions 开始执行');
  console.log('🧱 块类型:', block.type);
  console.log('📦 配置:', JSON.stringify(config, null, 2));
  
  try {
    // 处理需要动态输入的块类型 - 先扩展输入，再处理extraState
    if (config.inputs) {
      const inputNames = Object.keys(config.inputs);
      console.log('🔍 检测到输入配置:', inputNames);
      
      // 检查是否需要动态扩展输入
      if (block.type === 'blinker_widget_print' || block.type.includes('_print')) {
        console.log('🔧 检测到需要动态输入的块类型，准备扩展');
        await extendBlockWithDynamicInputs(block, config.inputs);
        
        // 根据实际输入数量计算并设置 itemCount
        const inputCount = inputNames.filter(name => name.startsWith('INPUT')).length;
        console.log(`📊 计算得到的输入数量: ${inputCount}`);
        
        if (inputCount > 0) {
          // 动态设置 extraState
          if (!config.extraState) {
            config.extraState = {};
          }
          config.extraState.itemCount = inputCount;
          console.log(`🔢 动态设置 itemCount 为: ${inputCount}`);
          
          // 应用到块 - 设置 itemCount_
          block.itemCount_ = inputCount;
          console.log(`✅ 设置块的 itemCount_ 为: ${inputCount}`);
          
          // 🆕 关键修复：参考 text_join.js 模式，重写 saveExtraState 方法
          block.saveExtraState = function() {
            console.log(`💾 saveExtraState 被调用，返回 itemCount: ${this.itemCount_}`);
            return {
              itemCount: this.itemCount_
            };
          };
          
          // 🆕 同时重写 loadExtraState 方法确保一致性
          block.loadExtraState = function(state) {
            console.log(`🔄 loadExtraState 被调用，state:`, state);
            if (state && state.itemCount !== undefined) {
              this.itemCount_ = state.itemCount;
              if (this.updateShape_ && typeof this.updateShape_ === 'function') {
                this.updateShape_();
                console.log(`✅ loadExtraState 调用 updateShape_，itemCount_: ${this.itemCount_}`);
              }
            }
          };
          
          // 如果有 updateShape_ 方法，调用它
          if (block.updateShape_ && typeof block.updateShape_ === 'function') {
            block.updateShape_();
            console.log(`🔄 调用 updateShape_ 更新块形状，当前 itemCount_: ${block.itemCount_}`);
          }
        }
      }
    }
    
    // 然后处理 extraState（如果存在）
    if (config.extraState) {
      console.log('🎛️ 应用 extraState 配置:', JSON.stringify(config.extraState));
      
      // 特殊处理 text_join 块（使用 mutator 系统）
      if (block.type === 'text_join' && config.extraState.itemCount !== undefined) {
        console.log(`🔢 text_join 块特殊处理，设置 itemCount: ${config.extraState.itemCount}`);
        
        // 直接设置 itemCount_ 属性
        block.itemCount_ = config.extraState.itemCount;
        
        // 如果有 updateShape_ 方法，调用它
        if (block.updateShape_ && typeof block.updateShape_ === 'function') {
          block.updateShape_();
          console.log(`✅ text_join 块 updateShape_ 调用完成，itemCount_: ${block.itemCount_}`);
        }
      }
      // 其他需要 itemCount 的块类型
      else if ((block.type === 'blinker_widget_print' || block.type.includes('_print')) && config.extraState.itemCount !== undefined) {
        console.log(`🔢 ${block.type} 块设置 itemCount: ${config.extraState.itemCount}`);
        
        // 直接设置 itemCount_ 属性
        if (block.itemCount_ !== undefined) {
          block.itemCount_ = config.extraState.itemCount;
          console.log(`✅ 设置 ${block.type} 的 itemCount_: ${config.extraState.itemCount}`);
        }
        
        // 如果有 updateShape_ 方法，调用它
        if (block.updateShape_ && typeof block.updateShape_ === 'function') {
          block.updateShape_();
          console.log(`🔄 ${block.type} updateShape_ 调用完成，itemCount_: ${block.itemCount_}`);
        }
      }
      // 通用的 extraState 处理
      else if (block.loadExtraState && typeof block.loadExtraState === 'function') {
        console.log('🔄 使用 loadExtraState 方法');
        block.loadExtraState(config.extraState);
      } else if (block.setSaveState && typeof block.setSaveState === 'function') {
        console.log('🔄 使用 setSaveState 方法');
        block.setSaveState(config.extraState);
      } else if (config.extraState.itemCount !== undefined) {
        // 通用的 itemCount 处理
        console.log(`🔢 通用设置 itemCount: ${config.extraState.itemCount}`);
        
        // 尝试通用方式设置
        Object.keys(config.extraState).forEach(key => {
          if (block.hasOwnProperty(key + '_')) {
            block[key + '_'] = config.extraState[key];
            console.log(`✅ 设置 ${key}_: ${config.extraState[key]}`);
          }
        });
        
        // 如果块有 updateShape_ 方法，调用它
        if (block.updateShape_ && typeof block.updateShape_ === 'function') {
          block.updateShape_();
          console.log('🔄 调用 updateShape_ 更新块形状');
        }
      }
    }
    
  } catch (error) {
    console.warn('⚠️ 应用动态扩展时出错:', error);
  }
}

/**
 * 扩展块的动态输入
 */
async function extendBlockWithDynamicInputs(block: any, inputsConfig: any): Promise<void> {
  console.log('🔧 extendBlockWithDynamicInputs 开始');
  console.log('🧱 块类型:', block.type);
  console.log('📦 输入配置:', JSON.stringify(inputsConfig, null, 2));
  
  try {
    const inputNames = Object.keys(inputsConfig);
    console.log('🔍 需要的输入名称:', inputNames);
    
    // 计算最高的INPUT编号
    const maxInputNumber = getHighestInputNumber(inputNames);
    console.log('📈 最高输入编号:', maxInputNumber);
    
    // 检查当前块有哪些输入
    const currentInputs = [];
    if (block.inputList) {
      for (let i = 0; i < block.inputList.length; i++) {
        const input = block.inputList[i];
        if (input.name) {
          currentInputs.push(input.name);
        }
      }
    }
    console.log('📋 当前块的输入:', currentInputs);
    
    // 找出缺少的输入
    const missingInputs = inputNames.filter(name => !currentInputs.includes(name));
    console.log('❌ 缺少的输入:', missingInputs);
    
    if (missingInputs.length > 0 || maxInputNumber >= 0) {
      console.log('🔧 尝试扩展块输入...');
      
      // 使用 custom_dynamic_extension 如果可用
      if (block.custom_dynamic_extension && typeof block.custom_dynamic_extension === 'function') {
        console.log('🎯 使用 custom_dynamic_extension 扩展块');
        
        // 计算需要的输入总数（最高编号+1）
        const targetInputCount = Math.max(maxInputNumber + 1, missingInputs.length);
        console.log(`📊 目标输入数量: ${targetInputCount}`);
        
        // 设置块的 itemCount_ 属性（如果存在）
        if (block.itemCount_ !== undefined) {
          block.itemCount_ = targetInputCount;
          console.log(`📊 设置 itemCount_: ${targetInputCount}`);
        }
        
        // 调用动态扩展函数
        block.custom_dynamic_extension(targetInputCount);
        console.log(`✅ 块已扩展到 ${targetInputCount} 个输入`);
        
        // 如果有 updateShape_ 方法，调用它
        if (block.updateShape_ && typeof block.updateShape_ === 'function') {
          block.updateShape_();
          console.log('🔄 调用 updateShape_ 更新块形状');
        }
        
      } else {
        console.log('⚠️ 块没有 custom_dynamic_extension 方法，尝试标准方法');
        
        // 尝试手动添加输入
        for (const inputName of missingInputs) {
          try {
            if (inputName.startsWith('INPUT') && !block.getInput(inputName)) {
              const input = block.appendValueInput(inputName);
              if (input) {
                console.log(`✅ 成功添加输入: ${inputName}`);
              }
            }
          } catch (addError) {
            console.warn(`⚠️ 添加输入 ${inputName} 失败:`, addError);
          }
        }
        
        // 设置 itemCount_ 属性（如果存在）
        if (maxInputNumber >= 0 && block.itemCount_ !== undefined) {
          block.itemCount_ = maxInputNumber + 1;
          console.log(`📊 设置 itemCount_: ${maxInputNumber + 1}`);
          
          // 如果有 updateShape_ 方法，调用它
          if (block.updateShape_ && typeof block.updateShape_ === 'function') {
            block.updateShape_();
            console.log('🔄 调用 updateShape_ 更新块形状');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 扩展动态输入时出错:', error);
  }
}

/**
 * 获取输入名称中的最高数字
 */
function getHighestInputNumber(inputNames: string[]): number {
  let highest = -1;
  for (const name of inputNames) {
    const match = name.match(/INPUT(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > highest) {
        highest = num;
      }
    }
  }
  return highest;
}

/**
 * 配置块的输入
 */
async function configureBlockInputs(workspace: any, block: any, inputs: InputConfig, blockMap?: Map<string, any>): Promise<string[]> {
  const updatedInputs: string[] = [];

  console.log('🔌 configureBlockInputs 开始执行');
  console.log('� 输入配置数据:', JSON.stringify(inputs, null, 2));
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
          // 创建并连接块，传递blockMap以便子块也能被映射
          const childResult = await createBlockFromConfig(workspace, inputConfig.block, blockMap);
          const childBlock = childResult?.block;
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
          // 创建影子块，也传递blockMap以便影子块能被映射
          const shadowResult = await createBlockFromConfig(workspace, inputConfig.shadow, blockMap);
          const shadowBlock = shadowResult?.block;
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
            }
          } else {
            console.error(`❌ 影子块创建失败或输入没有连接点`);
          }
        } else {
          console.log(`ℹ️ 输入 "${inputName}" 没有块或影子配置`);
        }
      } else {
        console.error(`❌ 输入 "${inputName}" 在块 ${block.type} 中不存在`);
        // 列出可用的输入
        const availableInputs = [];
        if (block.inputList) {
          for (let i = 0; i < block.inputList.length; i++) {
            const inp = block.inputList[i];
            if (inp.name) {
              availableInputs.push(inp.name);
            }
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
 * 从配置创建块 - 增强版本，支持嵌套输入处理
 * @param workspace Blockly工作区
 * @param config 块配置
 * @param blockMap 可选的块映射表，用于存储预设ID的块以便后续连接
 * @returns 包含主块和总块数的结果对象
 */
async function createBlockFromConfig(workspace: any, config: BlockConfig | string, blockMap?: Map<string, any>): Promise<{ block: any, totalBlocks: number }> {
  console.log('🏗️ createBlockFromConfig 开始');
  console.log('📦 块配置:', JSON.stringify(config, null, 2));
  
  try {
    // 如果是字符串，创建一个文本块
    if (typeof config === 'string') {
      console.log(`🔨 创建文本块: ${config}`);
      const textBlock = await createBlockSafely(workspace, 'text', { x: 100, y: 100 }, false);
      if (textBlock) {
        textBlock.setFieldValue(config, 'TEXT');
        console.log(`✅ 文本块创建成功: ${config}`);
        return { block: textBlock, totalBlocks: 1 };
      }
      return { block: null, totalBlocks: 0 };
    }
    
    console.log(`🔨 创建块类型: ${config.type}`);
    const position = config.position || { x: 0, y: 0 };
    const block = await createBlockSafely(workspace, config.type, position, false);
    
    if (!block) {
      console.error(`❌ 块创建失败: ${config.type}`);
      return { block: null, totalBlocks: 0 };
    }
    
    console.log(`✅ 块创建成功: ${config.type} (ID: ${block.id})`);
    let totalBlocks = 1;
    
    // 🗂️ 如果提供了blockMap且块配置有预设ID，将块添加到映射表中
    if (blockMap && config.id) {
      blockMap.set(config.id, block);
      console.log(`🗂️ 块映射键设置: '${config.id}' → ${config.type}[${block.id}]`);
    }
    
    // 检查并应用动态扩展
    await applyDynamicExtensions(block, config);
    
    if (config.fields) {
      console.log('🏷️ 配置块字段...');
      configureBlockFields(block, config.fields);
      console.log('✅ 字段配置完成');
    }
    
    if (config.inputs) {
      console.log('🔌 配置块输入...');
      await configureBlockInputs(workspace, block, config.inputs, blockMap);
      console.log('✅ 块输入配置完成');
    }
    
    // 处理next连接
    if (config.next) {
      console.log('🔗 配置next连接...');
      const nextResult = await createBlockFromConfig(workspace, config.next.block, blockMap);
      const nextBlock = nextResult?.block;
      if (nextBlock && block.nextConnection && nextBlock.previousConnection) {
        try {
          block.nextConnection.connect(nextBlock.previousConnection);
          console.log(`✅ next连接成功: ${block.type} -> ${nextBlock.type}`);
          totalBlocks += nextResult.totalBlocks;
        } catch (connectionError) {
          console.warn(`⚠️ next连接失败: ${connectionError}`);
        }
      } else {
        console.warn('⚠️ next连接失败: 连接点不可用');
      }
    }
    
    console.log(`🎉 createBlockFromConfig 完成: ${config.type}`);
    return { block, totalBlocks };
  } catch (error) {
    console.error('❌ 从配置创建块时出错:', error);
    return { block: null, totalBlocks: 0 };
  }
}

/**
 * 创建代码结构工具 - 参考原版本实现
 */
export async function createCodeStructureTool(
  toolArgs: CodeStructureArgs
): Promise<ToolUseResult> {
  let toolResult = null;
  let is_error = false;
  let metadata = null;

  console.log('🏗️ createCodeStructureTool 开始执行');
  console.log('� 接收到的参数:', JSON.stringify(toolArgs, null, 2));

  try {
    let { structure, config, insertPosition = 'workspace', targetBlock, targetInput, position } = toolArgs;

    console.log('🔧 原始参数解析...');
    console.log('- structure:', structure);
    console.log('- config:', config);
    console.log('- position (raw):', position);
    console.log('- insertPosition:', insertPosition);

    // 参数类型转换和修复
    try {
      // 如果 config 是字符串，需要解析
      if (typeof config === 'string') {
        console.log('📝 解析字符串格式的 config...');
        console.log('🔧 原始 config 字符串:', config);
        
        try {
          // 直接尝试解析 JSON
          config = JSON.parse(config);
          console.log('✅ config 解析成功:', config);
        } catch (parseError) {
          console.log('⚠️ config 解析失败，尝试使用 JSON 修复...');
          console.log('❌ 解析错误:', (parseError as Error).message);
          
          try {
            // 使用 jsonrepair 库修复 JSON
            const repairedConfig = jsonrepair(config as string);
            console.log('🔧 修复后的 config:', repairedConfig);
            
            config = JSON.parse(repairedConfig);
            console.log('✅ jsonrepair 修复 config 成功:', config);
          } catch (repairError) {
            console.log('❌ jsonrepair 修复失败，尝试自定义修复...');
            
            // 使用自定义修复函数
            const fixResult = fixJsonString(config as string);
            if (fixResult.success) {
              config = JSON.parse(fixResult.fixed);
              console.log('✅ 自定义修复 config 成功:', config);
              console.log('🔧 修复过程:', fixResult.changes);
            } else {
              throw new Error(`JSON修复失败: ${fixResult.error}. 修复尝试: ${fixResult.changes.join(', ')}`);
            }
          }
        }
      }

      // 解析 position 参数（如果是字符串）
      if (typeof position === 'string') {
        console.log('📍 解析字符串格式的 position...');
        try {
          position = JSON.parse(position);
          console.log('✅ position 解析成功:', position);
        } catch (posParseError) {
          console.log('⚠️ position 解析失败，尝试修复...');
          try {
            const repairedPosition = jsonrepair(position as string);
            position = JSON.parse(repairedPosition);
            console.log('✅ position 修复成功:', position);
          } catch (posRepairError) {
            console.log('❌ position 修复失败，使用默认值');
            position = null;
          }
        }
      }

      // 修复 insertPosition 参数
      if (insertPosition === 'append') {
        console.log('🔄 修复 insertPosition: append -> workspace');
        insertPosition = 'workspace';
      }

      console.log('🎯 参数解析完成:');
      console.log('- config (parsed):', JSON.stringify(config, null, 2));
      console.log('- position (parsed):', JSON.stringify(position, null, 2));
      console.log('- insertPosition (fixed):', insertPosition);

      // 进一步处理 config 中的特殊情况
      if (config && typeof config === 'object') {
        // 验证必要的structureDefinition
        if (!config.structureDefinition) {
          throw new Error('必须提供 config.structureDefinition 配置来定义结构');
        }
        console.log('✅ 动态结构定义验证通过');
      }

    } catch (parseError) {
      console.error('❌ 参数解析失败:', parseError);
      throw new Error(`参数解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // 获取工作区
    const workspace = await getCurrentWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }

    const createdBlocks: string[] = [];
    const connections: Array<{ sourceId: string; targetId: string; connectionType: string }> = [];

    // 计算放置位置
    const blockPosition = position && typeof position === 'object' && position.x !== undefined && position.y !== undefined ? 
      calculateBlockPosition(workspace, position.x, position.y) :
      calculateBlockPosition(workspace);

    console.log(`🎯 开始创建 ${structure} 结构`);
    console.log('📍 计算的位置:', blockPosition);

    // 使用动态结构处理器创建结构
    console.log(`� 使用动态结构定义创建: ${structure}`);
    const rootBlock = await createDynamicStructure(workspace, config, blockPosition, createdBlocks, connections);

    if (rootBlock) {
      // 处理插入位置
      console.log('🔗 检查插入位置条件:');
      console.log('- insertPosition:', insertPosition);
      console.log('- targetBlock:', targetBlock);
      console.log('- targetInput:', targetInput);
      console.log('- 条件判断:', `insertPosition !== 'workspace' (${insertPosition !== 'workspace'}) && targetBlock (${!!targetBlock})`);
      
      if (insertPosition !== 'workspace' && targetBlock) {
        console.log(`🎯 执行块插入: ${insertPosition} 到 ${targetBlock}`);
        await handleBlockInsertion(workspace, rootBlock, insertPosition, targetBlock, targetInput);
        console.log(`✅ 块插入完成`);
      } else {
        console.log(`⚠️ 跳过块插入 - 条件不满足`);
      }

      console.log(`✅ 成功创建 ${structure} 结构，包含 ${createdBlocks.length} 个块`);
      
      // 获取工作区概览，包括树状结构和生成的代码
      console.log('📊 获取工作区概览...');
      const overviewResult = await getWorkspaceOverviewTool({
        includeCode: true,
        includeTree: true,
        format: 'text',
        groupBy: 'structure'
      });
      
      let workspaceOverview = '';
      if (!overviewResult.is_error) {
        workspaceOverview = overviewResult.content;
      } else {
        console.warn('⚠️ 获取工作区概览失败:', overviewResult.content);
        workspaceOverview = '⚠️ 工作区概览获取失败，但结构创建成功';
      }
      
      metadata = {
        structureType: structure,
        createdBlocks,
        rootBlockId: rootBlock.id,
        connections,
        workspaceOverview: overviewResult.is_error ? null : overviewResult.content
      };

      toolResult = `✅ 成功创建 ${structure} 代码结构

📊 创建结果概览:
- 结构名称: ${structure}
- 创建块数: ${createdBlocks.length} 个
- 根块ID: ${rootBlock.id}
- 连接数: ${connections.length} 个

${workspaceOverview}`;
    } else {
      throw new Error('创建代码结构失败');
    }

  } catch (error) {
    is_error = true;
    toolResult = `创建代码结构失败: ${error instanceof Error ? error.message : String(error)}`;
    console.error('❌ createCodeStructureTool 执行失败:', error);
  }

  console.log('📤 返回结果:', { content: toolResult, is_error, metadata });
  return {
    content: toolResult,
    is_error,
    metadata
  };
}

/**
 * 连接块工具 - 集成智能插入功能
 */
export async function connectBlocksTool(args: ConnectBlocksArgs): Promise<ConnectBlocksResult> {
  console.log('🔗 连接块工具 - 智能版本');
  console.log('📥 输入参数:', JSON.stringify(args, null, 2));

  try {
    const workspace = getActiveWorkspace();
    const { sourceBlock, targetBlock, connectionType, inputName } = args;

    // 智能查找源块和目标块 - 支持字符串ID和BlockReference对象
    let sourceBlockObj: any = null;
    let targetBlockObj: any = null;

    if (typeof sourceBlock === 'string') {
      console.log(`🔍 通过字符串ID查找源块: ${sourceBlock}`);
      sourceBlockObj = getBlockByIdSmart(workspace, sourceBlock, {
        enableFuzzyMatch: true,
        minScore: 60,
        logDetails: true
      });
    } else {
      console.log('🔍 通过BlockReference查找源块:', sourceBlock);
      sourceBlockObj = findBlock(workspace, sourceBlock);
    }

    if (typeof targetBlock === 'string') {
      console.log(`🔍 通过字符串ID查找目标块: ${targetBlock}`);
      targetBlockObj = getBlockByIdSmart(workspace, targetBlock, {
        enableFuzzyMatch: true,
        minScore: 60,
        logDetails: true
      });
    } else {
      console.log('🔍 通过BlockReference查找目标块:', targetBlock);
      targetBlockObj = findBlock(workspace, targetBlock);
    }

    if (!sourceBlockObj) {
      const sourceInfo = typeof sourceBlock === 'string' ? `ID: ${sourceBlock}` : `对象: ${JSON.stringify(sourceBlock)}`;
      throw new Error(`未找到源块 (${sourceInfo})`);
    }
    if (!targetBlockObj) {
      const targetInfo = typeof targetBlock === 'string' ? `ID: ${targetBlock}` : `对象: ${JSON.stringify(targetBlock)}`;
      throw new Error(`未找到目标块 (${targetInfo})`);
    }

    console.log(`🔗 执行智能连接: ${connectionType}`);
    console.log(`  - 源块: ${sourceBlockObj.type}(${sourceBlockObj.id})`);
    console.log(`  - 目标块: ${targetBlockObj.type}(${targetBlockObj.id})`);

    // 🎯 优化连接类型和输入名称
    let optimizedConnectionType = connectionType;
    let optimizedInputName = inputName;
    
    if (connectionType === 'statement') {
      console.log('🔍 处理 statement 连接...');
      
      // 如果用户已指定输入名称，优先使用
      if (inputName && inputName.trim()) {
        console.log(`👤 用户指定了输入名称: ${inputName}`);
        
        // 验证指定的输入名称是否存在
        try {
          const specifiedInput = sourceBlockObj.getInput(inputName);
          if (specifiedInput && specifiedInput.connection) {
            optimizedInputName = inputName;
            optimizedConnectionType = 'input'; // statement 本质上是 input 连接
            console.log(`✅ 用户指定的输入 "${inputName}" 验证成功`);
          } else {
            console.log(`⚠️ 用户指定的输入 "${inputName}" 不存在或无连接，尝试自动检测`);
            const detectedInputName = detectStatementInput(sourceBlockObj);
            if (detectedInputName) {
              optimizedInputName = detectedInputName;
              optimizedConnectionType = 'input';
              console.log(`🔄 智能转换: statement → input，使用检测到的输入: ${detectedInputName}`);
            } else {
              throw new Error(`块 ${sourceBlockObj.type} 不是容器块，没有语句输入端口，且指定的输入 "${inputName}" 不存在`);
            }
          }
        } catch (error) {
          console.log(`⚠️ 验证用户指定输入失败:`, error);
          
          // 🔄 智能交换检查：大模型可能搞错了源块和目标块的顺序
          console.log(`🔄 检查是否应该交换源块和目标块的角色...`);
          try {
            // 检查目标块是否有用户指定的输入端口
            const targetInput = targetBlockObj.getInput(inputName);
            if (targetInput && targetInput.connection) {
              console.log(`💡 发现目标块 ${targetBlockObj.type} 有输入 "${inputName}"，执行智能交换`);
              
              // 交换源块和目标块
              const tempBlock = sourceBlockObj;
              const tempBlockId = sourceBlockObj.id;
              sourceBlockObj = targetBlockObj;
              targetBlockObj = tempBlock;
              
              console.log(`🔄 智能交换完成:`);
              console.log(`  - 新源块: ${sourceBlockObj.type}(${sourceBlockObj.id})`);
              console.log(`  - 新目标块: ${targetBlockObj.type}(${targetBlockObj.id})`);
              
              // 使用指定的输入名称
              optimizedInputName = inputName;
              optimizedConnectionType = 'input';
              console.log(`✅ 交换后验证成功，使用输入: ${inputName}`);
            } else {
              // 目标块也没有指定的输入，尝试自动检测源块
              console.log(`❌ 目标块也没有输入 "${inputName}"，尝试自动检测源块的语句输入`);
              const detectedInputName = detectStatementInput(sourceBlockObj);
              if (detectedInputName) {
                optimizedInputName = detectedInputName;
                optimizedConnectionType = 'input';
                console.log(`🔄 回退到自动检测: 使用输入 ${detectedInputName}`);
              } else {
                throw new Error(`块 ${sourceBlockObj.type} 不是容器块，没有语句输入端口，且指定的输入 "${inputName}" 不存在。建议检查源块和目标块的顺序是否正确。`);
              }
            }
          } catch (swapError) {
            console.log(`⚠️ 智能交换也失败:`, swapError);
            throw new Error(`无法建立连接：源块 ${sourceBlockObj.type} 和目标块 ${targetBlockObj.type} 都不支持指定的输入 "${inputName}"。请检查块的类型和参数是否正确。`);
          }
        }
      } else {
        // 用户未指定输入名称，进行智能检测
        console.log('🔍 用户未指定输入名称，进行智能检测...');
        const detectedInputName = detectStatementInput(sourceBlockObj);
        
        if (detectedInputName) {
          optimizedInputName = detectedInputName;
          optimizedConnectionType = 'input'; // statement 本质上是 input 连接
          console.log(`🔄 智能转换: statement → input，使用输入: ${detectedInputName}`);
        } else {
          throw new Error(`块 ${sourceBlockObj.type} 不是容器块，没有语句输入端口`);
        }
      }
    }

    // 使用智能插入功能执行连接
    console.log('🎯 使用智能插入功能执行连接...');
    const result = await smartInsertBlock(
      workspace,
      targetBlockObj,
      sourceBlockObj,
      optimizedConnectionType as 'next' | 'input' | 'statement',
      optimizedInputName
    );

    // 生成结果消息
    let message = '';
    if (result.smartInsertion && result.autoMovedBlock) {
      message = `✅ 智能插入成功: "${targetBlockObj.type}" 插入到 "${sourceBlockObj.type}"，自动后移了 "${result.autoMovedBlock}" 块`;
    } else if (result.smartInsertion) {
      message = `✅ 智能插入成功: "${targetBlockObj.type}" 插入到 "${sourceBlockObj.type}"`;
    } else {
      message = `✅ 连接成功: "${sourceBlockObj.type}" 和 "${targetBlockObj.type}"`;
    }

    console.log(message);

    // 获取工作区概览，包括树状结构和生成的代码
    console.log('📊 获取连接后的工作区概览...');
    const overviewResult = await getWorkspaceOverviewTool({
      includeCode: true,
      includeTree: true,
      format: 'text',
      groupBy: 'structure'
    });
    
    let workspaceOverview = '';
    let cppCode = '';
    
    if (!overviewResult.is_error) {
      workspaceOverview = overviewResult.content;
      // 尝试提取C++代码部分
      const codeMatch = workspaceOverview.match(/```cpp([\s\S]*?)```/);
      if (codeMatch) {
        cppCode = codeMatch[1].trim();
      }
    } else {
      console.warn('⚠️ 获取工作区概览失败:', overviewResult.content);
      workspaceOverview = '⚠️ 工作区概览获取失败，但连接操作成功';
    }

    // 生成增强的结果消息
    const enhancedMessage = `${message}

📊 连接操作完成后的工作区状态:
${workspaceOverview}`;

    return {
      is_error: false,
      content: enhancedMessage,
      details: JSON.stringify({
        sourceBlockId: sourceBlockObj.id,
        targetBlockId: targetBlockObj.id,
        connectionType: optimizedConnectionType,
        inputName: optimizedInputName,
        originalConnectionType: connectionType,
        smartInsertion: result.smartInsertion,
        autoMovedBlock: result.autoMovedBlock
      }),
      metadata: {
        sourceBlockId: sourceBlockObj.id,
        targetBlockId: targetBlockObj.id,
        connectionType: optimizedConnectionType,
        inputName: optimizedInputName,
        workspaceOverview: overviewResult.is_error ? null : overviewResult.content,
        cppCode: cppCode || null
      }
    };

  } catch (error) {
    console.error('❌ 连接失败:', error);
    return {
      is_error: true,
      content: `❌ 连接失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 智能检测语句输入 - 增强版本
 */
function detectStatementInput(block: any): string | null {
  try {
    console.log(`🔍 检测语句输入 - 块类型: ${block.type}`);
    
    // 检查是否有输入列表
    if (!block.inputList || block.inputList.length === 0) {
      console.log('⚠️ 块没有输入列表');
      return null;
    }

    console.log(`📋 块有 ${block.inputList.length} 个输入:`);
    
    // 详细日志显示所有输入
    block.inputList.forEach((input: any, index: number) => {
      console.log(`  ${index}: ${input.name} (类型: ${input.type}, 有连接: ${!!input.connection})`);
    });

    // 查找语句类型的输入 (type === 3 是 statement 连接)
    for (const input of block.inputList) {
      if (input.type === 3 && input.connection) {
        console.log(`🎯 找到语句输入: ${input.name}`);
        return input.name;
      }
    }

    // 针对特定块类型的专门检测
    const blockSpecificInputs = {
      'arduino_loop': ['ARDUINO_LOOP', 'DO', 'BODY', 'STACK'],
      'arduino_setup': ['ARDUINO_SETUP', 'DO', 'BODY', 'STACK'],
      'controls_if': ['DO', 'DO0', 'ELSE'],
      'controls_for': ['DO'],
      'controls_while': ['DO'],
      'controls_repeat_ext': ['DO'],
      'procedures_defnoreturn': ['STACK'],
      'procedures_defreturn': ['STACK']
    };

    const specificInputs = blockSpecificInputs[block.type as keyof typeof blockSpecificInputs];
    if (specificInputs) {
      console.log(`🎯 尝试特定于 ${block.type} 的输入名称: ${specificInputs.join(', ')}`);
      for (const inputName of specificInputs) {
        try {
          const input = block.getInput(inputName);
          if (input && input.connection) {
            console.log(`🎯 特定检测成功找到语句输入: ${inputName}`);
            return inputName;
          }
        } catch (error) {
          console.log(`⚠️ 检测 ${inputName} 失败:`, error);
        }
      }
    }

    // 通用回退检查：查找常见的语句输入名称
    const commonStatementInputs = ['ARDUINO_LOOP', 'ARDUINO_SETUP', 'NAME', 'DO', 'DO0', 'BODY', 'STATEMENT', 'STACK', 'ELSE'];
    console.log(`🔄 回退检查常见语句输入: ${commonStatementInputs.join(', ')}`);
    
    for (const inputName of commonStatementInputs) {
      try {
        const input = block.getInput(inputName);
        if (input && input.connection) {
          console.log(`🎯 回退检测找到语句输入: ${inputName}`);
          return inputName;
        }
      } catch (error) {
        // 静默继续
      }
    }

    // 最后尝试：遍历所有输入寻找任何可能的语句连接
    console.log('🔍 最后尝试：检查所有输入的连接类型');
    for (const input of block.inputList) {
      if (input.connection) {
        try {
          // 检查连接类型常量
          const connectionType = input.connection.type;
          console.log(`📊 输入 ${input.name} 连接类型: ${connectionType}`);
          
          // Blockly中，语句连接通常是类型 3 或 4
          if (connectionType === 3 || connectionType === 4) {
            console.log(`🎯 基于连接类型找到语句输入: ${input.name}`);
            return input.name;
          }
        } catch (error) {
          console.log(`⚠️ 检查连接类型失败:`, error);
        }
      }
    }

    console.log('❌ 未找到任何语句输入端口');
    return null;
  } catch (error) {
    console.error('❌ 检测语句输入失败:', error);
    return null;
  }
}

/**
 * 执行删除前的安全检查
 */
interface SafetyCheckResult {
  canDelete: boolean;
  warnings: string[];
  criticalIssues: string[];
  affectedBlocks: Array<{ id: string; type: string; relation: string }>;
  isRootBlock: boolean;
  hasChildren: boolean;
}

function performSafetyCheck(block: any, cascade: boolean): SafetyCheckResult {
  const warnings: string[] = [];
  const criticalIssues: string[] = [];
  const affectedBlocks: Array<{ id: string; type: string; relation: string }> = [];
  
  console.log(`🔍 执行安全检查: ${block.type} (${block.id})`);
  
  // 检查是否是重要的根块
  const isRootBlock = !block.previousConnection || 
                     block.type.includes('setup') || 
                     block.type.includes('loop') ||
                     block.type.includes('event') ||
                     block.type.includes('procedure') ||
                     block.type.includes('function');

  if (isRootBlock) {
    warnings.push(`这是一个根块 (${block.type})，删除可能影响程序结构`);
  }

  // 检查子块和连接的块
  const hasChildren = block.getChildren ? block.getChildren().length > 0 : false;
  let childCount = 0;
  
  // 收集所有连接的块
  if (block.getChildren) {
    const children = block.getChildren();
    childCount = children.length;
    
    for (const child of children) {
      affectedBlocks.push({
        id: child.id,
        type: child.type,
        relation: cascade ? '将被删除' : '将保留但可能断开连接'
      });
    }
  }

  // 检查下一个块
  const nextBlock = block.getNextBlock?.();
  if (nextBlock) {
    affectedBlocks.push({
      id: nextBlock.id,
      type: nextBlock.type,
      relation: cascade ? '将被删除' : '将尝试重连到前一个块'
    });
  }

  // 检查连接到此块输入的块
  if (block.inputList) {
    for (const input of block.inputList) {
      if (input.connection && input.connection.targetConnection) {
        const inputBlock = input.connection.targetBlock;
        if (inputBlock) {
          affectedBlocks.push({
            id: inputBlock.id,
            type: inputBlock.type,
            relation: cascade ? '将被删除' : '将断开连接'
          });
          childCount++;
        }
      }
    }
  }

  // 生成警告信息
  if (childCount > 0) {
    if (cascade) {
      warnings.push(`级联删除将同时删除 ${childCount} 个连接的块`);
    } else {
      warnings.push(`删除后将影响 ${childCount} 个连接的块，它们将被保留但可能断开连接`);
    }
  }

  // 检查是否是关键的初始化块
  if (block.type.includes('serial') || block.type.includes('init') || block.type.includes('begin')) {
    warnings.push(`这是一个初始化块 (${block.type})，删除可能影响其他功能`);
  }

  // 检查是否有变量定义
  if (block.getVars && block.getVars().length > 0) {
    const variables = block.getVars();
    warnings.push(`此块定义了变量: ${variables.join(', ')}，删除后这些变量仍会保留`);
  }

  const canDelete = criticalIssues.length === 0;

  console.log(`🔍 安全检查结果:`);
  console.log(`   可以删除: ${canDelete}`);
  console.log(`   是否根块: ${isRootBlock}`);
  console.log(`   有子块: ${hasChildren} (${childCount}个)`);
  console.log(`   警告数量: ${warnings.length}`);
  console.log(`   严重问题: ${criticalIssues.length}`);

  return {
    canDelete,
    warnings,
    criticalIssues,
    affectedBlocks,
    isRootBlock,
    hasChildren
  };
}

/**
 * 分析删除操作的影响
 */
function analyzeDeleteImpact(block: any, cascade: boolean): {
  blocksToDelete: string[];
  blocksToPreserve: string[];
  reconnections: Array<{ from: string; to: string; success: boolean }>;
} {
  const blocksToDelete: string[] = [block.id];
  const blocksToPreserve: string[] = [];
  const reconnections: Array<{ from: string; to: string; success: boolean }> = [];

  if (cascade) {
    // 级联删除：收集所有连接的块
    const allConnected = getAllConnectedBlocks(block);
    blocksToDelete.push(...allConnected.map(b => b.id));
  } else {
    // 智能删除：分析重连可能性
    const previousBlock = block.getPreviousBlock?.();
    const nextBlock = block.getNextBlock?.();
    
    if (block.getChildren) {
      const children = block.getChildren();
      blocksToPreserve.push(...children.map(b => b.id));
    }

    if (previousBlock && nextBlock) {
      reconnections.push({
        from: previousBlock.id,
        to: nextBlock.id,
        success: checkConnectionCompatibility(
          previousBlock.nextConnection,
          nextBlock.previousConnection
        )
      });
    }
  }

  return { blocksToDelete, blocksToPreserve, reconnections };
}

/**
 * 获取所有连接的块
 */
function getAllConnectedBlocks(block: any): any[] {
  const connected: any[] = [];
  const visited = new Set<string>();
  
  function collectConnected(currentBlock: any) {
    if (!currentBlock || visited.has(currentBlock.id)) return;
    
    visited.add(currentBlock.id);
    if (currentBlock.id !== block.id) {
      connected.push(currentBlock);
    }

    // 收集子块
    if (currentBlock.getChildren) {
      const children = currentBlock.getChildren();
      for (const child of children) {
        collectConnected(child);
      }
    }

    // 收集下一个块
    const nextBlock = currentBlock.getNextBlock?.();
    if (nextBlock) {
      collectConnected(nextBlock);
    }

    // 收集输入块
    if (currentBlock.inputList) {
      for (const input of currentBlock.inputList) {
        if (input.connection && input.connection.targetConnection) {
          const inputBlock = input.connection.targetBlock;
          if (inputBlock) {
            collectConnected(inputBlock);
          }
        }
      }
    }
  }

  collectConnected(block);
  return connected;
}

/**
 * 删除块工具 - 参考原始完整实现
 */
export async function deleteBlockTool(args: { 
  block?: BlockReference;
  blockId?: string; 
  cascade?: boolean;
  preview?: boolean;
}): Promise<DeleteBlockResult> {
  console.log('🗑️ 删除块工具');
  console.log('📥 输入参数:', JSON.stringify(args, null, 2));
  
  try {
    const workspace = getActiveWorkspace();
    const { block, blockId: inputBlockId, cascade = false, preview = false } = args;
    
    let blockToDelete: any = null;
    let actualBlockId = '';
    
    // 支持两种方式查找块：blockId 或 block 对象
    if (inputBlockId) {
      console.log(`🔍 通过 blockId 智能查找块: ${inputBlockId}`);
      // 使用智能查找函数（支持精确匹配和模糊匹配）
      blockToDelete = getBlockByIdSmart(workspace, inputBlockId, {
        enableFuzzyMatch: true,
        minScore: 60,
        logDetails: true
      });
      actualBlockId = inputBlockId;
    } else if (block) {
      console.log('🔍 通过 block 对象查找块:', block);
      blockToDelete = findBlock(workspace, block);
      actualBlockId = blockToDelete?.id || '';
    } else {
      throw new Error('必须提供 blockId 或 block 参数');
    }
    
    if (!blockToDelete) {
      const searchInfo = inputBlockId ? `blockId: ${inputBlockId}` : `block: ${JSON.stringify(block)}`;
      throw new Error(`未找到要删除的块 (${searchInfo})`);
    }

    const blockId = blockToDelete.id;
    const blockType = blockToDelete.type;
    const deletedBlockType = blockToDelete.type;
    
    console.log(`✅ 找到目标块: ${blockType} (ID: ${blockId})`);

    // 如果是预览模式，返回分析结果
    if (preview) {
      let previewInfo = [`🔍 删除预览: ${blockType} (${blockId})`];
      
      if (cascade) {
        // 分析级联删除影响
        const cascadeBlocks = [];
        const collectCascadeBlocks = (block: any) => {
          const inputs = block.inputList || [];
          for (const input of inputs) {
            if (input.connection && input.connection.targetBlock()) {
              const connectedBlock = input.connection.targetBlock();
              cascadeBlocks.push(`${connectedBlock.type}(${connectedBlock.id})`);
              collectCascadeBlocks(connectedBlock);
            }
          }
          if (block.nextConnection && block.nextConnection.targetBlock()) {
            const nextBlock = block.nextConnection.targetBlock();
            cascadeBlocks.push(`${nextBlock.type}(${nextBlock.id})`);
            collectCascadeBlocks(nextBlock);
          }
        };
        collectCascadeBlocks(blockToDelete);
        
        previewInfo.push('🔗 级联删除模式');
        previewInfo.push(`📊 将删除 ${cascadeBlocks.length + 1} 个块`);
        previewInfo.push('📋 连接的块:');
        cascadeBlocks.forEach(info => previewInfo.push(`   • ${info}`));
      } else {
        // 分析智能删除影响
        const previousBlock = blockToDelete.getPreviousBlock ? blockToDelete.getPreviousBlock() : null;
        const nextBlock = blockToDelete.getNextBlock ? blockToDelete.getNextBlock() : null;
        
        previewInfo.push('🎯 智能删除模式');
        previewInfo.push(`前一个块: ${previousBlock ? `${previousBlock.type}(${previousBlock.id})` : '无'}`);
        previewInfo.push(`后一个块: ${nextBlock ? `${nextBlock.type}(${nextBlock.id})` : '无'}`);
        
        if (previousBlock && nextBlock) {
          previewInfo.push('🔄 将尝试智能重连前后块');
        }
      }
      
      return {
        is_error: false,
        content: previewInfo.join('\n'),
        details: JSON.stringify({ preview: true, blockId, blockType })
      };
    }

    // 执行删除
    console.log('🗑️ 开始删除块...');
    
    if (cascade) {
      console.log('🔗 启用级联删除，收集连接的块...');
      
      // 收集所有需要删除的块
      const cascadeDeleted: string[] = [];
      const collectAllBlocksToDelete = (block: any, collected: Set<any>) => {
        if (!block || collected.has(block)) return;
        
        collected.add(block);
        console.log(`🎯 收集到块: ${block.type}(${block.id})`);
        
        // 收集所有输入中的连接块
        const inputs = block.inputList || [];
        for (const input of inputs) {
          if (input.connection && input.connection.targetBlock()) {
            collectAllBlocksToDelete(input.connection.targetBlock(), collected);
          }
        }
        
        // 收集下一个块
        if (block.nextConnection && block.nextConnection.targetBlock()) {
          collectAllBlocksToDelete(block.nextConnection.targetBlock(), collected);
        }
      };

      const allBlocksToDelete = new Set<any>();
      collectAllBlocksToDelete(blockToDelete, allBlocksToDelete);
      
      // 将块对象ID存储到cascadeDeleted数组
      for (const block of allBlocksToDelete) {
        if (block.id !== blockToDelete.id) {
          cascadeDeleted.push(block.id);
        }
      }
      
      console.log(`📊 发现 ${cascadeDeleted.length} 个连接的块需要级联删除`);
      
      // 执行级联删除
      const deletedIds: string[] = [];
      
      // 先断开主块的连接关系
      if (blockToDelete.previousConnection && blockToDelete.previousConnection.targetConnection) {
        console.log('🔗 断开主块的previous连接');
        blockToDelete.previousConnection.disconnect();
      }
      if (blockToDelete.outputConnection && blockToDelete.outputConnection.targetConnection) {
        console.log('🔗 断开主块的output连接');
        blockToDelete.outputConnection.disconnect();
      }
      
      // 删除所有连接的块
      for (const blockIdToDel of cascadeDeleted) {
        const blockToDeleteCascade = workspace.getBlockById(blockIdToDel);
        if (blockToDeleteCascade) {
          console.log(`🗑️ 删除连接块: ${blockToDeleteCascade.type}(${blockToDeleteCascade.id})`);
          blockToDeleteCascade.dispose(false);
          deletedIds.push(blockIdToDel);
        }
      }
      
      // 最后删除主块
      console.log(`🗑️ 删除主块: ${blockToDelete.type}(${blockToDelete.id})`);
      blockToDelete.dispose(false);
      deletedIds.push(blockToDelete.id);
      
      const resultMessage = `成功级联删除块 "${deletedBlockType}" 及其 ${deletedIds.length - 1} 个连接块（共删除 ${deletedIds.length} 个块）`;
      console.log(`✅ ${resultMessage}`);
      
      // 获取删除后的工作区概览
      console.log('📊 获取删除后的工作区概览...');
      const overviewResult = await getWorkspaceOverviewTool({
        includeCode: true,
        includeTree: true,
        format: 'text',
        groupBy: 'structure'
      });
      
      let workspaceOverview = '';
      let cppCode = '';
      
      if (!overviewResult.is_error) {
        workspaceOverview = overviewResult.content;
        // 尝试提取C++代码部分
        const codeMatch = workspaceOverview.match(/```cpp([\s\S]*?)```/);
        if (codeMatch) {
          cppCode = codeMatch[1].trim();
        }
      } else {
        console.warn('⚠️ 获取工作区概览失败:', overviewResult.content);
        workspaceOverview = '⚠️ 工作区概览获取失败，但删除操作成功';
      }

      // 生成增强的结果消息
      const enhancedMessage = `${resultMessage}

📊 删除操作完成后的工作区状态:
${workspaceOverview}`;
      
      return {
        is_error: false,
        content: enhancedMessage,
        details: JSON.stringify({
          deletedBlockId: blockId,
          deletedBlockType: deletedBlockType,
          cascadeDeleted: cascadeDeleted,
          totalDeleted: deletedIds.length
        }),
        metadata: {
          deletedBlockId: blockId,
          deletedBlockType: deletedBlockType,
          totalDeleted: deletedIds.length,
          cascadeDeleted: cascadeDeleted,
          workspaceOverview: overviewResult.is_error ? null : overviewResult.content,
          cppCode: cppCode || null
        }
      };
      
    } else {
      console.log('🎯 执行智能单块删除...');
      
      // 检查是否是 hat 块
      const isHatBlock = !blockToDelete.previousConnection || 
                         blockToDelete.type.includes('setup') || 
                         blockToDelete.type.includes('loop') ||
                         blockToDelete.type.includes('hat') ||
                         blockToDelete.type.includes('event');
      
      let reconnectedBlocks = 0;
      let nextBlockPreserved = false;
      let resultMessage = '';
      
      if (isHatBlock) {
        console.log(`📋 检测到 Hat 块 ${blockToDelete.type}，直接删除`);
        blockToDelete.dispose(false);
        resultMessage = `成功删除 Hat 块 "${deletedBlockType}"`;
      } else {
        console.log(`📋 检测到普通块 ${blockToDelete.type}，执行智能删除和重连...`);
        
        // 获取前一个块和后一个块
        const previousBlock = blockToDelete.getPreviousBlock ? blockToDelete.getPreviousBlock() : null;
        const nextBlock = blockToDelete.getNextBlock ? blockToDelete.getNextBlock() : null;
        
        console.log(`🔍 连接状态分析:`);
        console.log(`   前一个块: ${previousBlock ? `${previousBlock.type}(${previousBlock.id})` : '无'}`);
        console.log(`   后一个块: ${nextBlock ? `${nextBlock.type}(${nextBlock.id})` : '无'}`);
        
        // 先断开所有连接
        if (blockToDelete.previousConnection && blockToDelete.previousConnection.targetConnection) {
          console.log('🔗 断开与前一个块的连接');
          blockToDelete.previousConnection.disconnect();
        }
        if (blockToDelete.nextConnection && blockToDelete.nextConnection.targetConnection) {
          console.log('🔗 断开与后一个块的连接');
          blockToDelete.nextConnection.disconnect();
        }
        
        // 删除目标块
        console.log(`🗑️ 删除目标块: ${blockToDelete.type}(${blockToDelete.id})`);
        blockToDelete.dispose(false);
        
        // 智能重连
        if (previousBlock && nextBlock) {
          console.log('🔄 智能重连模式：尝试将前后块重新连接...');
          try {
            if (previousBlock.nextConnection && nextBlock.previousConnection) {
              // 简化的连接兼容性检查
              const isCompatible = true; // 简化处理
              if (isCompatible) {
                previousBlock.nextConnection.connect(nextBlock.previousConnection);
                reconnectedBlocks = 2;
                nextBlockPreserved = true;
                console.log(`✅ 智能重连成功: ${previousBlock.type} → ${nextBlock.type}`);
              } else {
                console.log('⚠️ 前后块类型不兼容，无法重连，但块已保留');
                nextBlockPreserved = true;
              }
            } else {
              console.log('⚠️ 连接点不匹配，无法重连，但块已保留');
              nextBlockPreserved = true;
            }
          } catch (reconnectError) {
            console.warn('⚠️ 重连过程中出现错误，但块已保留:', reconnectError);
            nextBlockPreserved = true;
          }
        } else if (nextBlock) {
          console.log('✅ 后续块已保留（无前一个块需要重连）');
          nextBlockPreserved = true;
        }
        
        // 生成结果消息
        if (reconnectedBlocks > 0) {
          resultMessage = `成功删除块 "${deletedBlockType}"，并智能重连了前后块`;
        } else if (nextBlockPreserved) {
          resultMessage = `成功删除块 "${deletedBlockType}"，后续块已保留`;
        } else {
          resultMessage = `成功删除块 "${deletedBlockType}"`;
        }
      }
      
      console.log(`✅ ${resultMessage}`);
      
      // 获取删除后的工作区概览
      console.log('📊 获取删除后的工作区概览...');
      const overviewResult = await getWorkspaceOverviewTool({
        includeCode: true,
        includeTree: true,
        format: 'text',
        groupBy: 'structure'
      });
      
      let workspaceOverview = '';
      let cppCode = '';
      
      if (!overviewResult.is_error) {
        workspaceOverview = overviewResult.content;
        // 尝试提取C++代码部分
        const codeMatch = workspaceOverview.match(/```cpp([\s\S]*?)```/);
        if (codeMatch) {
          cppCode = codeMatch[1].trim();
        }
      } else {
        console.warn('⚠️ 获取工作区概览失败:', overviewResult.content);
        workspaceOverview = '⚠️ 工作区概览获取失败，但删除操作成功';
      }

      // 生成增强的结果消息
      const enhancedMessage = `${resultMessage}

📊 删除操作完成后的工作区状态:
${workspaceOverview}`;
      
      return {
        is_error: false,
        content: enhancedMessage,
        details: JSON.stringify({
          deletedBlockId: blockId,
          deletedBlockType: deletedBlockType,
          isHatBlock: isHatBlock,
          reconnectedBlocks: reconnectedBlocks,
          nextBlockPreserved: nextBlockPreserved
        }),
        metadata: {
          deletedBlockId: blockId,
          deletedBlockType: deletedBlockType,
          reconnectedBlocks: reconnectedBlocks,
          workspaceOverview: overviewResult.is_error ? null : overviewResult.content,
          cppCode: cppCode || null
        }
      };
    }

  } catch (error) {
    console.error('❌ 删除块失败:', error);
    return {
      is_error: true,
      content: `❌ 删除块失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 获取工作区概览 - 简化版本
 */
export async function getWorkspaceOverviewTool(args?: any): Promise<ToolUseResult> {
  console.log('🌍 获取工作区完整概览 - 增强版本');
  console.log('📦 配置参数:', JSON.stringify(args, null, 2));
  
  try {
    const {
      includeCode = true,
      includeTree = true,
      format = 'both',
      groupBy = 'structure'
    } = args || {};
    
    const workspace = getActiveWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }

    // 获取所有块并进行分析
    const allBlocks = workspace.getAllBlocks();
    console.log(`📊 工作区包含 ${allBlocks.length} 个块`);
    
    // 统计数据
    const statistics = {
      totalBlocks: allBlocks.length,
      blocksByType: {} as { [type: string]: number },
      independentStructures: 0,
      maxDepth: 0,
      connectedBlocks: 0,
      isolatedBlocks: 0
    };

    // 详细块信息
    const allBlocksInfo: any[] = [];
    const rootBlocks: any[] = [];
    let structureTree = '';
    let generatedCode = '';

    // 分析每个块
    for (const block of allBlocks) {
      // 统计块类型
      statistics.blocksByType[block.type] = (statistics.blocksByType[block.type] || 0) + 1;

      // 收集有意义的字段和参数信息
      const fields: any = {};
      const inputs: any = {};
      const inputList = block.inputList || [];

      // 🚀 完全动态扫描块结构 - 不依赖任何预设定义
      console.log(`🔍 开始动态扫描块: ${block.type}`);
      
      // 1. 完整扫描所有输入 - 不管类型，全部收集
      for (const input of inputList) {
        const inputTypeStr = getInputType(input);
        console.log(`📝 扫描输入: ${input.name || '匿名'} (类型: ${input.type || '未知'} → ${inputTypeStr})`);
        
        // 收集字段值（如下拉菜单、数字输入等）
        if (input.fieldRow) {
          for (const field of input.fieldRow) {
            if (field.name && field.getValue) {
              const fieldValue = field.getValue();
              
              // 使用简化的字段识别
              if (isValidField(field.name, fieldValue)) {
                fields[field.name] = fieldValue;
              }
            }
          }
        }
        
        // 收集输入连接
        if (input.name) {
          if (input.connection) {
            const connectedBlock = input.connection.targetBlock();
            if (connectedBlock) {
              inputs[input.name] = {
                type: connectedBlock.type,
                id: connectedBlock.id
              };
              statistics.connectedBlocks++;
            } else {
              inputs[input.name] = {
                type: 'empty',
                inputType: getInputType(input)
              };
            }
          } else {
            // 即使没有connection，也要记录这个输入的存在
            inputs[input.name] = {
              type: 'no_connection',
              inputType: getInputType(input)
            };
            console.log(`� 发现无连接输入: ${input.name} (类型: ${getInputTypeDescription(input.type)})`);
          }
        }
      }
      // 分析树状结构信息
      const tree = analyzeBlockTreeStructure(block);
      if (tree.depth > statistics.maxDepth) {
        statistics.maxDepth = tree.depth;
      }

      // 生成单个块的代码（如果需要）
      let blockCode = '';
      if (includeCode) {
        try {
          // 尝试生成代码 - 简化处理
          if ((window as any).Arduino && (window as any).Arduino.blockToCode) {
            const code = (window as any).Arduino.blockToCode(block);
            blockCode = Array.isArray(code) ? code[0] || '' : code || '';
          }
        } catch (error) {
          blockCode = `// ${block.type} - 代码生成错误: ${error}`;
        }
      }

      const blockInfo = {
        id: block.id,
        type: block.type,
        position: block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 },
        fields,
        inputs,
        tree,
        generatedCode: blockCode,
        isRoot: !block.getParent || !block.getParent(),
        hasParent: !!(block.getParent && block.getParent()),
        hasChildren: Object.keys(inputs).length > 0,
        nextBlock: block.getNextBlock ? (block.getNextBlock() ? {
          id: block.getNextBlock().id,
          type: block.getNextBlock().type
        } : null) : null
      };

      allBlocksInfo.push(blockInfo);
      
      // 识别根块（顶层块）
      if (!blockInfo.hasParent) {
        rootBlocks.push(blockInfo);
      }
    }

    statistics.independentStructures = rootBlocks.length;
    statistics.isolatedBlocks = allBlocks.filter((block: any) => {
      const hasConnections = block.getParent() || block.getNextBlock() || 
        (block.inputList && block.inputList.some((input: any) => 
          input.connection && input.connection.targetBlock()));
      return !hasConnections;
    }).length;

    // 生成树状结构文本
    if (includeTree) {
      structureTree = generateTreeStructure(rootBlocks, allBlocksInfo, groupBy);
    }

    // 生成完整代码
    if (includeCode) {
      try {
        if ((window as any).Arduino && (window as any).Arduino.workspaceToCode) {
          generatedCode = (window as any).Arduino.workspaceToCode(workspace) || '// 无代码生成';
        } else {
          // 备用方法：拼接顶层块的代码
          const codeLines: string[] = [];
          for (const rootBlock of rootBlocks) {
            const blockFromWorkspace = workspace.getBlockById(rootBlock.id);
            if (blockFromWorkspace && rootBlock.generatedCode && 
                !rootBlock.generatedCode.includes('代码生成错误')) {
              codeLines.push(rootBlock.generatedCode);
            }
          }
          generatedCode = codeLines.length > 0 ? codeLines.join('\n\n') : '// 无可用代码内容';
        }
      } catch (error) {
        generatedCode = `// 工作区代码生成失败: ${error}`;
      }
    }

    // 格式化输出
    const workspaceStructure = {
      totalBlocks: statistics.totalBlocks,
      blocksByType: statistics.blocksByType,
      rootBlocks,
      allBlocks: allBlocksInfo,
      structureTree,
      generatedCode
    };

    let textOutput = '';
    let jsonOutput = null;

    if (format === 'text' || format === 'both') {
      textOutput = formatWorkspaceOverviewText(workspaceStructure, statistics, {
        includeCode,
        includeTree,
        groupBy
      });
    }

    if (format === 'json' || format === 'both') {
      // 简化JSON输出，只保留关键信息供大模型使用
      jsonOutput = {
        summary: {
          totalBlocks: statistics.totalBlocks,
          blockTypes: Object.keys(statistics.blocksByType).length,
          independentStructures: statistics.independentStructures,
          maxDepth: statistics.maxDepth,
          connectedBlocks: statistics.connectedBlocks,
          isolatedBlocks: statistics.isolatedBlocks
        },
        blocksByType: statistics.blocksByType,
        structures: rootBlocks.map(root => ({
          id: root.id,
          type: root.type,
          position: root.position,
          fields: root.fields,
          childCount: countChildren(root.id, allBlocksInfo),
          depth: root.tree.depth
        })),
        generatedCode: includeCode ? generatedCode : undefined
      };
    }

    console.log(`✅ 工作区分析完成: ${statistics.totalBlocks} 个块，${statistics.independentStructures} 个独立结构`);

    return {
      is_error: false,
      content: format === 'json' ? JSON.stringify(jsonOutput, null, 2) : textOutput,
      details: JSON.stringify({
        statistics,
        format,
        includeCode,
        includeTree,
        workspace: jsonOutput || workspaceStructure
      })
    };

  } catch (error) {
    console.error('❌ 获取工作区概览失败:', error);
    return {
      is_error: true,
      content: `❌ 获取工作区概览失败: ${error.message}`,
      details: JSON.stringify({ error: error.message })
    };
  }
}

// 辅助函数：分析块的树状结构
function analyzeBlockTreeStructure(block: any): any {
  const tree = {
    childBlocks: [] as any[],
    depth: 0,
    path: '',
    parentBlock: null as any,
    nextBlock: null as any,
    previousBlock: null as any,
    rootBlock: null as any
  };

  // 分析父块关系
  if (block.getParent) {
    const parent = block.getParent();
    if (parent) {
      tree.parentBlock = {
        id: parent.id,
        type: parent.type
      };
    }
  }

  // 分析子块关系（输入连接的块）
  const inputList = block.inputList || [];
  for (const input of inputList) {
    if (input.connection && input.connection.targetBlock()) {
      const childBlock = input.connection.targetBlock();
      tree.childBlocks.push({
        id: childBlock.id,
        type: childBlock.type,
        inputName: input.name || 'unknown'
      });
    }
  }

  // 分析顺序关系
  if (block.getNextBlock) {
    const nextBlock = block.getNextBlock();
    if (nextBlock) {
      tree.nextBlock = {
        id: nextBlock.id,
        type: nextBlock.type
      };
    }
  }

  if (block.getPreviousBlock) {
    const previousBlock = block.getPreviousBlock();
    if (previousBlock) {
      tree.previousBlock = {
        id: previousBlock.id,
        type: previousBlock.type
      };
    }
  }

  // 查找根块和计算深度
  let currentBlock = block;
  let depth = 0;
  const pathParts: string[] = [];

  while (currentBlock) {
    pathParts.unshift(`${currentBlock.type}[${currentBlock.id.substring(0, 8)}...]`);
    
    const parent = currentBlock.getParent ? currentBlock.getParent() : null;
    
    if (parent) {
      currentBlock = parent;
      depth++;
    } else {
      break;
    }
  }

  tree.rootBlock = {
    id: currentBlock.id,
    type: currentBlock.type
  };
  tree.depth = depth;
  tree.path = pathParts.join(' → ');

  return tree;
}

// 辅助函数：生成树状结构文本 - 简化格式
function generateTreeStructure(rootBlocks: any[], allBlocks: any[], groupBy: string): string {
  if (rootBlocks.length === 0) {
    return '📝 工作区为空，没有块';
  }

  const lines: string[] = [];
  lines.push('🌳 工作区结构树:');
  lines.push('(type [id] @(x,y) {fields})');
  lines.push('');

  rootBlocks.forEach((rootBlock, index) => {
    // 格式: 结构 1: type [block-id] @(x,y) {field1:value1, field2:value2}
    const blockInfo = formatBlockInfo(rootBlock);
    lines.push(`结构 ${index + 1}: ${blockInfo}`);
    
    // 递归显示结构 - 使用简化格式，支持复杂多层嵌套
    displayBlockStructureRecursiveSimple(rootBlock, allBlocks, lines, 1, new Set(), '');
    lines.push('');
  });

  return lines.join('\n');
}

// 辅助函数：格式化块信息为简洁格式
function formatBlockInfo(block: any): string {
  // const blockId = block.id.length > 12 ? `${block.id.substring(0, 12)}...` : block.id;
  const blockId = block.id;
  const position = `@(${block.position.x},${block.position.y})`;
  
  // 格式化字段信息 - 使用更严格的过滤
  let fieldsStr = '';
  if (block.fields && Object.keys(block.fields).length > 0) {
    const fieldPairs = Object.entries(block.fields)
      .filter(([key, value]) => {
        // 基本空值过滤
        if (value === null || value === undefined || value === '') {
          return false;
        }
        
        // 过滤掉图标和UI相关的字段
        const excludedFields = [
          'PLUS', 'MINUS', 'ICON', 'IMAGE', 'BUTTON',
          'DROPDOWN_ARROW', 'CHEVRON_DOWN', 'CHEVRON_UP',
          'EXPAND', 'COLLAPSE', 'MUTATOR'
        ];
        
        if (excludedFields.includes(key)) {
          return false;
        }
        
        // 过滤掉包含base64图片数据的字段
        if (typeof value === 'string' && 
            (value.startsWith('data:image/') || 
             value.includes('base64') ||
             value.length > 100)) {
          return false;
        }
        
        // 过滤掉SVG数据
        if (typeof value === 'string' && 
            value.includes('<svg') && value.includes('</svg>')) {
          return false;
        }
        
        return true;
      })
      .map(([key, value]) => `${key}:${value}`);
    
    if (fieldPairs.length > 0) {
      fieldsStr = ` {${fieldPairs.join(', ')}}`;
    }
  }
  
  return `${block.type} [${blockId}] ${position}${fieldsStr}`;
}

// 简化的字段过滤函数
function isValidField(name: string, value: any): boolean {
  if (!name || value === undefined || value === null || value === '') return false;
  
  // 过滤UI元素
  if (name.includes('ICON') || name.includes('IMAGE') || name.includes('BUTTON')) return false;
  
  // 过滤长文本/base64
  if (typeof value === 'string' && value.length > 100) return false;
  
  return true;
}

// 简化的输入类型获取
function getInputType(input: any): string {
  if (!input) return 'unknown';
  // 根据Blockly常量：1=INPUT_VALUE, 2=OUTPUT_VALUE, 3=NEXT_STATEMENT, 4=PREVIOUS_STATEMENT, 5=DUMMY_INPUT
  if (input.type === 1) return 'input_value';     // INPUT_VALUE
  if (input.type === 3) return 'input_statement'; // NEXT_STATEMENT (用于语句连接)
  if (input.type === 5) return 'input_dummy';     // DUMMY_INPUT (虚拟输入，只包含字段)
  return 'input_value'; // 默认
}

// 兼容性函数
function getInputTypeDescription(inputType: number): string {
  const types = { 1: 'value', 2: 'dummy', 3: 'statement', 4: 'end_row', 5: 'next' };
  return types[inputType as keyof typeof types] || `type_${inputType}`;
}

// 辅助函数：判断是否为statement类型输入 - 增强版本
function isStatementInput(inputType: string, inputName: string, blockType?: string): boolean {
  // 1. 优先从输入的实际类型判断
  if (blockType && inputName) {
    // 简化判断：直接通过常见名称和类型判断
    if (inputType.includes('statement') || 
        inputName.match(/^(DO|ELSE|STACK|SUBSTACK|BODY|LOOP|THEN|CATCH|FINALLY)\d*$/)) {
      return true;
    }
    if (inputType.includes('value') || inputType.includes('input')) {
      return false;
    }
  }
  
  // 2. 检查inputType中是否包含statement关键字
  if (inputType && (inputType.includes('statement') || inputType.includes('next_statement'))) {
    return true;
  }
  
  // 3. 检查常见的statement输入名称
  const statementInputNames = [
    'ARDUINO_SETUP', 'DO', 'DO0', 'DO1', 'DO2', 'DO3', 'DO4', 'DO5',
    'ELSE', 'STATEMENT', 'STACK', 'SUBSTACK', 'SUBSTACK2', 
    'BODY', 'LOOP', 'THEN', 'CATCH', 'FINALLY'
  ];
  
  if (statementInputNames.includes(inputName)) {
    return true;
  }
  
  // 4. 检查DO开头的输入名称（动态数量的DO输入）
  if (inputName && inputName.match(/^DO\d*$/)) {
    return true;
  }
  
  return false;
}

// 辅助函数：递归显示块结构 - 简化版本 - 支持复杂多层嵌套
function displayBlockStructureRecursiveSimple(
  block: any, 
  allBlocks: any[], 
  lines: string[], 
  level: number, 
  visited: Set<string>,
  parentPrefix: string = ''
): void {
  if (visited.has(block.id)) {
    return; // 避免循环引用
  }
  visited.add(block.id);

  // 收集所有要显示的子块 - 按类型分组便于大模型理解
  const valueInputs: Array<{block?: any, inputName: string, inputType: string, isEmpty?: boolean}> = [];
  const statementInputs: Array<{block?: any, inputName: string, inputType: string, isEmpty?: boolean}> = [];
  const nextBlocks: Array<{block: any}> = [];
  
  // 添加输入连接的子块 - 区分value和statement输入，包括空输入
  if (block.inputs && Object.keys(block.inputs).length > 0) {
    Object.entries(block.inputs).forEach(([inputName, inputInfo]: [string, any]) => {
      const inputType = inputInfo.inputType || 'unknown';
      
      if (inputInfo.type === 'empty' || inputInfo.type === 'no_connection' || !inputInfo.id) {
        // 🎯 处理空输入 - 使用真实的块类型来获取准确的输入类型
        if (isStatementInput(inputType, inputName, block.type)) {
          statementInputs.push({inputName, inputType, isEmpty: true});
        } else {
          valueInputs.push({inputName, inputType, isEmpty: true});
        }
      } else {
        // 处理有连接的输入 - 使用真实的块类型来获取准确的输入类型
        const childBlock = allBlocks.find(b => b.id === inputInfo.id);
        if (childBlock) {
          if (isStatementInput(inputType, inputName, block.type)) {
            statementInputs.push({block: childBlock, inputName, inputType});
          } else {
            valueInputs.push({block: childBlock, inputName, inputType});
          }
        }
      }
    });
  }
  
  // 添加下一个块（顺序连接）
  if (block.nextBlock) {
    const nextBlock = allBlocks.find(b => b.id === block.nextBlock.id);
    if (nextBlock) {
      nextBlocks.push({block: nextBlock});
    }
  }

  // 显示所有子块 - 按类型分组显示，更便于大模型理解结构
  const allChildren: Array<{block?: any, inputName: string, inputType: string, category: string, isEmpty?: boolean}> = [
    ...valueInputs.map(child => ({...child, category: 'value'})),
    ...statementInputs.map(child => ({...child, category: 'statement'})),
    ...nextBlocks.map(child => ({...child, category: 'next', inputName: 'NEXT', inputType: 'sequence'}))
  ];

  allChildren.forEach((child, index) => {
    const isLast = index === allChildren.length - 1;
    const currentPrefix = isLast ? '└── ' : '├── ';
    
    // 🎯 改进的分层显示格式 - 更便于大模型理解结构
    if (child.category === 'statement') {
      // statement输入：先显示输入类型，再在下层显示实际块
      const inputTypeDesc = `[${child.inputName}:statement]`;
      lines.push(`${parentPrefix}${currentPrefix}${inputTypeDesc}`);
      
      if (child.isEmpty !== true && child.block) {
        // 在下一层显示实际的块
        const blockInfo = formatBlockInfo(child.block);
        const blockPrefix = parentPrefix + (isLast ? '    ' : '│   ') + '└── ';
        lines.push(`${blockPrefix}${blockInfo}`);
        
        // 递归显示块的子结构
        const newParentPrefix = parentPrefix + (isLast ? '    ' : '│   ') + '    ';
        displayBlockStructureRecursiveSimple(child.block, allBlocks, lines, level + 1, visited, newParentPrefix);
      } else if (child.isEmpty === true) {
        // 空输入在下一层显示
        const emptyPrefix = parentPrefix + (isLast ? '    ' : '│   ') + '└── ';
        lines.push(`${emptyPrefix}⭕ 需要连接 (${child.inputType}类型输入)`);
      }
    } else if (child.category === 'value') {
      // value输入：直接显示块，但用更准确的术语
      const inputTypeDesc = `[${child.inputName}:input]`;
      
      if (child.isEmpty !== true && child.block) {
        const childInfo = formatBlockInfo(child.block);
        lines.push(`${parentPrefix}${currentPrefix}${inputTypeDesc} ${childInfo}`);
        
        // 递归显示子结构
        const newParentPrefix = parentPrefix + (isLast ? '    ' : '│   ');
        displayBlockStructureRecursiveSimple(child.block, allBlocks, lines, level + 1, visited, newParentPrefix);
      } else if (child.isEmpty === true) {
        lines.push(`${parentPrefix}${currentPrefix}${inputTypeDesc} ⭕ 需要连接 (${child.inputType}类型输入)`);
      }
    } else if (child.category === 'next') {
      // 顺序连接：直接显示下一个块
      if (child.block) {
        const childInfo = formatBlockInfo(child.block);
        lines.push(`${parentPrefix}${currentPrefix}${childInfo}`);
        
        // 递归显示子结构
        const newParentPrefix = parentPrefix + (isLast ? '    ' : '│   ');
        displayBlockStructureRecursiveSimple(child.block, allBlocks, lines, level + 1, visited, newParentPrefix);
      }
    }
  });
}

// 辅助函数：递归显示块结构 - 保持原版本兼容性
function displayBlockStructureRecursive(
  block: any, 
  allBlocks: any[], 
  lines: string[], 
  level: number, 
  visited: Set<string>,
  prefix: string
): void {
  if (visited.has(block.id)) {
    return; // 避免循环引用
  }
  visited.add(block.id);

  const indent = '  '.repeat(level);
  
  // 显示子块（输入连接）
  if (block.inputs && Object.keys(block.inputs).length > 0) {
    Object.entries(block.inputs).forEach(([inputName, inputInfo]: [string, any]) => {
      const childBlock = allBlocks.find(b => b.id === inputInfo.id);
      if (childBlock) {
        lines.push(`${indent}├─ 📥 ${inputName}: ${inputInfo.type} [${inputInfo.id.substring(0, 8)}...]`);
        displayBlockStructureRecursive(childBlock, allBlocks, lines, level + 1, visited, '│  ');
      }
    });
  }
  
  // 显示下一个块（顺序连接）
  if (block.nextBlock) {
    const nextBlock = allBlocks.find(b => b.id === block.nextBlock.id);
    if (nextBlock) {
      lines.push(`${indent}└─ ➡️ 下一个: ${nextBlock.type} [${nextBlock.id.substring(0, 8)}...]`);
      displayBlockStructureRecursive(nextBlock, allBlocks, lines, level + 1, visited, '   ');
    }
  }
}

// 辅助函数：计算子块数量
function countChildren(blockId: string, allBlocks: any[]): number {
  const block = allBlocks.find(b => b.id === blockId);
  if (!block) return 0;
  
  let count = 0;
  
  // 计算输入连接的子块
  if (block.inputs) {
    count += Object.keys(block.inputs).length;
  }
  
  // 计算顺序连接的下一个块
  if (block.nextBlock) {
    count += 1 + countChildren(block.nextBlock.id, allBlocks);
  }
  
  return count;
}

// 辅助函数：格式化文本输出
function formatWorkspaceOverviewText(
  structure: any, 
  statistics: any,
  options: {
    includeCode: boolean;
    includeTree: boolean;
    groupBy: string;
  }
): string {
  const lines: string[] = [];
  
  console.log('==========================🌍 工作区完整概览==========================');

  lines.push('🌍 工作区完整概览');
  lines.push('='.repeat(50));
  lines.push('');
  
  // 统计信息
  lines.push('📊 统计信息:');
  lines.push(`  • 总块数: ${statistics.totalBlocks}`);
  lines.push(`  • 独立结构数: ${statistics.independentStructures}`);
  lines.push(`  • 最大嵌套深度: ${statistics.maxDepth}`);
  lines.push(`  • 已连接块数: ${statistics.connectedBlocks}`);
  lines.push(`  • 孤立块数: ${statistics.isolatedBlocks}`);
  lines.push('');
  
  // 块类型分布
  lines.push('📈 块类型分布:');
  Object.entries(statistics.blocksByType)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .forEach(([type, count]) => {
      lines.push(`  • ${type}: ${count} 个`);
    });
  lines.push('');

  // 树状结构
  if (options.includeTree && structure.structureTree) {
    lines.push(structure.structureTree);
    lines.push('');
  }

  // 生成的代码
  if (options.includeCode && structure.generatedCode) {
    lines.push('💻 生成的 C++ 代码:');
    lines.push('```cpp');
    lines.push(structure.generatedCode);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 生成代码工具
 */
export async function generateCodeTool(): Promise<ToolUseResult> {
  console.log('⚙️ 生成代码工具');
  
  try {
    const workspace = getActiveWorkspace();
    const code = arduinoGenerator.workspaceToCode(workspace);
    
    return {
      is_error: false,
      content: '✅ 代码生成成功',
      details: JSON.stringify({
        code: code,
        language: 'arduino'
      })
    };

  } catch (error) {
    console.error('❌ 代码生成失败:', error);
    return {
      is_error: true,
      content: `❌ 代码生成失败: ${error.message}`,
      details: JSON.stringify({ error: error.message })
    };
  }
}

/**
 * 配置块工具 - 集成JSON修复功能
 */
export async function configureBlockTool(args: any): Promise<ToolUseResult> {
  console.log('🔧 配置块工具 - 智能版本');
  console.log('📥 原始输入参数:', JSON.stringify(args, null, 2));
  
  try {
    const workspace = getActiveWorkspace();
    let { blockId, blockType, fields, inputs } = args;

    // 🔧 参数修复和转换
    console.log('🔧 开始参数修复和转换...');
    
    // 修复 fields 参数
    if (typeof fields === 'string') {
      console.log(`⚠️ fields 是字符串，尝试解析...`);
      try {
        if (fields.trim()) {
          const fixResult = fixJsonString(fields, { logProcess: true });
          if (fixResult.success) {
            fields = JSON.parse(fixResult.fixed);
            console.log(`✅ fields 修复成功: ${JSON.stringify(fields)}`);
          } else {
            console.error(`❌ fields 修复失败: ${fixResult.error}`);
            fields = null;
          }
        } else {
          fields = null;
        }
      } catch (error) {
        console.error(`❌ fields 解析失败: ${(error as Error).message}`);
        fields = null;
      }
    }

    // 修复 inputs 参数
    if (typeof inputs === 'string') {
      console.log(`⚠️ inputs 是字符串，尝试解析...`);
      
      if (inputs.trim() && inputs !== '{}') {
        const fixResult = fixJsonString(inputs, { logProcess: true });
        
        if (fixResult.success) {
          console.log(`✅ JSON 修复成功，应用的修复: ${fixResult.changes.join(', ')}`);
          try {
            inputs = JSON.parse(fixResult.fixed);
            console.log(`✅ inputs 修复成功: ${JSON.stringify(inputs)}`);
          } catch (parseError) {
            console.error(`❌ 修复后的 JSON 仍然无法解析: ${(parseError as Error).message}`);
            inputs = null;
          }
        } else {
          console.error(`❌ JSON 修复失败: ${fixResult.error}`);
          console.error(`❌ 尝试的修复: ${fixResult.changes.join(', ')}`);
          inputs = null;
        }
      } else {
        inputs = null;
        console.log(`✅ inputs 设为 null（空字符串或仅包含 {}）`);
      }
    }

    console.log('🔍 修复后的参数:');
    console.log(`  - 块ID: ${blockId}`);
    console.log(`  - 块类型: ${blockType}`);
    console.log(`  - 字段: ${JSON.stringify(fields)}`);
    console.log(`  - 输入: ${JSON.stringify(inputs)}`);
    
    let targetBlock: any = null;
    
    // 查找目标块
    if (blockId) {
      targetBlock = workspace.getBlockById(blockId);
    } else if (blockType) {
      const allBlocks = workspace.getAllBlocks();
      targetBlock = allBlocks.find((block: any) => block.type === blockType);
    }
    
    if (!targetBlock) {
      throw new Error('未找到目标块');
    }

    console.log(`✅ 找到目标块: ${targetBlock.type} (ID: ${targetBlock.id})`);

    const fieldsUpdated: string[] = [];
    const inputsUpdated: string[] = [];

    // 配置字段
    if (fields) {
      console.log('🏷️ 开始更新字段...');
      try {
        for (const [fieldName, value] of Object.entries(fields)) {
          if (value !== undefined && value !== null) {
            try {
              targetBlock.setFieldValue(value.toString(), fieldName);
              fieldsUpdated.push(fieldName);
              console.log(`✅ 字段更新成功: ${fieldName} = ${value}`);
            } catch (fieldError) {
              console.warn(`⚠️ 字段更新失败: ${fieldName}`, fieldError);
            }
          }
        }
        console.log(`✅ 字段更新完成: ${fieldsUpdated.join(', ')}`);
      } catch (error) {
        console.warn('字段配置时出错:', error);
      }
    }

    // 配置输入（如果需要支持）
    if (inputs) {
      console.log('🔌 输入配置暂不支持（可以在此扩展）');
    }

    const message = `✅ 块配置成功: ${targetBlock.type} [${blockId}] ${fieldsUpdated.length > 0 ? `，更新字段: ${fieldsUpdated.join(', ')}` : ''}`;
    console.log(message);

    return {
      is_error: false,
      content: message,
      details: JSON.stringify({
        blockId: targetBlock.id,
        blockType: targetBlock.type,
        fieldsUpdated,
        inputsUpdated
      })
    };

  } catch (error) {
    console.error('❌ 配置块失败:', error);
    return {
      is_error: true,
      content: `❌ 配置块失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 变量管理工具 - 简化版本
 */
export async function variableManagerTool(args: any): Promise<ToolUseResult> {
  console.log('📝 变量管理工具 - 简化版本');
  
  try {
    const workspace = getActiveWorkspace();
    const { action, variableName, variableType = 'Number' } = args;
    
    const variableMap = workspace.getVariableMap();
    
    if (action === 'create') {
      if (!variableName) {
        throw new Error('创建变量需要提供变量名');
      }
      
      // 检查变量是否已存在
      const existingVar = variableMap.getVariable(variableName);
      if (existingVar) {
        return {
          is_error: false,
          content: `✅ 变量已存在: ${variableName}`,
          details: JSON.stringify({
            variableName: variableName,
            variableId: existingVar.getId(),
            action: 'exists'
          })
        };
      }
      
      // 创建新变量
      const newVariable = variableMap.createVariable(variableName, variableType);
      
      return {
        is_error: false,
        content: `✅ 变量创建成功: ${variableName}`,
        details: JSON.stringify({
          variableName: variableName,
          variableId: newVariable.getId(),
          variableType: variableType,
          action: 'created'
        })
      };
      
    } else if (action === 'list') {
      const allVariables = variableMap.getAllVariables();
      const variableList = allVariables.map((variable: any) => ({
        name: variable.name,
        id: variable.getId(),
        type: variable.type
      }));
      
      return {
        is_error: false,
        content: `✅ 获取变量列表成功，共 ${variableList.length} 个变量`,
        details: JSON.stringify({
          variables: variableList,
          count: variableList.length,
          action: 'list'
        })
      };
    }
    
    throw new Error(`未知的操作: ${action}`);

  } catch (error) {
    console.error('❌ 变量管理失败:', error);
    return {
      is_error: true,
      content: `❌ 变量管理失败: ${error.message}`,
      details: JSON.stringify({ error: error.message })
    };
  }
}

/**
 * 查找块工具 - 完善版本
 */
export async function findBlockTool(args: any): Promise<ToolUseResult> {
  console.log('🔍 查找块工具 - 完善版本');
  console.log('📦 查询条件:', JSON.stringify(args, null, 2));
  
  try {
    const workspace = getActiveWorkspace();
    if (!workspace) {
      throw new Error('未找到活动的 Blockly 工作区');
    }

    // 解析大模型发送的查询格式
    let parsedArgs = { ...args };
    
    // 处理 criteria 格式的查询 (大模型发送的格式)
    if (args.criteria && typeof args.criteria === 'string') {
      console.log(`🤖 解析大模型查询格式: "${args.criteria}"`);
      
      // 解析 type:blockType 格式
      if (args.criteria.startsWith('type:')) {
        parsedArgs.blockType = args.criteria.replace('type:', '');
        console.log(`📋 解析得到块类型: "${parsedArgs.blockType}"`);
      }
      // 解析 id:blockId 格式
      else if (args.criteria.startsWith('id:')) {
        parsedArgs.blockId = args.criteria.replace('id:', '');
        console.log(`🆔 解析得到块ID: "${parsedArgs.blockId}"`);
      }
      // 解析 search:keyword 格式
      else if (args.criteria.startsWith('search:')) {
        parsedArgs.searchCriteria = args.criteria.replace('search:', '');
        console.log(`🔎 解析得到搜索关键词: "${parsedArgs.searchCriteria}"`);
      }
      // 直接作为搜索条件
      else {
        parsedArgs.searchCriteria = args.criteria;
        console.log(`🔍 直接作为搜索条件: "${parsedArgs.searchCriteria}"`);
      }
      
      // 移除原始 criteria 参数
      delete parsedArgs.criteria;
    }
    
    // 处理 limit 参数 (大模型格式)
    if (args.limit && !parsedArgs.maxResults) {
      parsedArgs.maxResults = args.limit;
      console.log(`📊 设置结果限制: ${parsedArgs.maxResults}`);
    }
    
    // 处理 includeMetadata 参数 (大模型格式)
    if (args.includeMetadata !== undefined) {
      parsedArgs.includeFields = args.includeMetadata;
      parsedArgs.includeConnections = args.includeMetadata;
      parsedArgs.includePosition = args.includeMetadata;
      console.log(`📋 设置包含元数据: ${args.includeMetadata}`);
    }

    // 从解析后的参数中提取值
    const { 
      blockType, 
      blockId, 
      searchCriteria, 
      includeFields = true,
      includeConnections = true,
      includePosition = true,
      includeCode = false,
      fuzzyMatch = false,
      maxResults = 50
    } = parsedArgs;
    
    console.log(`🔎 开始搜索，模糊匹配: ${fuzzyMatch}，最大结果: ${maxResults}`);
    
    const allBlocks = workspace.getAllBlocks();
    let foundBlocks: any[] = [];
    
    // 1. 按ID查找（支持模糊匹配）
    if (blockId) {
      console.log(`🆔 按ID查找: "${blockId}"`);
      
      if (fuzzyMatch) {
        // 模糊匹配ID
        foundBlocks = allBlocks.filter((block: any) => 
          block.id.toLowerCase().includes(blockId.toLowerCase())
        );
        console.log(`🔍 模糊匹配找到 ${foundBlocks.length} 个块`);
      } else {
        // 精确匹配ID
        const block = workspace.getBlockById(blockId);
        if (block) {
          foundBlocks = [block];
          console.log('✅ 精确匹配找到1个块');
        } else {
          console.log('❌ 精确匹配未找到块');
        }
      }
    }
    
    // 2. 按类型查找
    else if (blockType) {
      console.log(`📋 按类型查找: "${blockType}"`);
      
      if (fuzzyMatch) {
        // 模糊匹配类型
        foundBlocks = allBlocks.filter((block: any) => 
          block.type.toLowerCase().includes(blockType.toLowerCase())
        );
        console.log(`🔍 模糊匹配找到 ${foundBlocks.length} 个块`);
      } else {
        // 精确匹配类型
        foundBlocks = allBlocks.filter((block: any) => block.type === blockType);
        console.log(`✅ 精确匹配找到 ${foundBlocks.length} 个块`);
      }
    }
    
    // 3. 按搜索条件查找
    else if (searchCriteria) {
      console.log(`🔎 按条件查找: "${searchCriteria}"`);
      
      foundBlocks = allBlocks.filter((block: any) => {
        // 在类型中搜索
        if (block.type.toLowerCase().includes(searchCriteria.toLowerCase())) {
          return true;
        }
        
        // 在字段中搜索
        const inputList = block.inputList || [];
        for (const input of inputList) {
          if (input.fieldRow) {
            for (const field of input.fieldRow) {
              if (field.getValue && field.getValue()) {
                const value = field.getValue().toString().toLowerCase();
                if (value.includes(searchCriteria.toLowerCase())) {
                  return true;
                }
              }
            }
          }
        }
        
        return false;
      });
      
      console.log(`🔍 条件匹配找到 ${foundBlocks.length} 个块`);
    }
    
    // 4. 如果没有指定条件，返回所有块
    else {
      console.log('📊 返回所有块');
      foundBlocks = allBlocks;
    }
    
    // 限制结果数量
    if (foundBlocks.length > maxResults) {
      console.log(`⚠️ 结果超过限制，截取前 ${maxResults} 个`);
      foundBlocks = foundBlocks.slice(0, maxResults);
    }
    
    // 生成详细的块信息
    const results = foundBlocks.map((block: any) => {
      const blockInfo: any = {
        id: block.id,
        type: block.type,
        isTopLevel: !block.getParent(),
        hasParent: !!block.getParent(),
        hasChildren: false,
        hasNext: false,
        hasPrevious: false
      };
      
      // 包含位置信息
      if (includePosition) {
        blockInfo.position = block.getRelativeToSurfaceXY ? 
          block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
      }
      
      // 包含字段信息
      if (includeFields) {
        const fields: any = {};
        const inputList = block.inputList || [];
        
        for (const input of inputList) {
          if (input.fieldRow) {
            for (const field of input.fieldRow) {
              if (field.name && field.getValue) {
                try {
                  const value = field.getValue();
                  if (value !== null && value !== undefined && value !== '') {
                    fields[field.name] = value;
                  }
                } catch (error) {
                  // 忽略字段获取错误
                }
              }
            }
          }
        }
        
        blockInfo.fields = fields;
      }
      
      // 包含连接信息
      if (includeConnections) {
        const connections: any = {
          inputs: {},
          next: null,
          previous: null,
          parent: null
        };
        
        // 输入连接
        const inputList = block.inputList || [];
        for (const input of inputList) {
          if (input.name && input.connection) {
            const connectedBlock = input.connection.targetBlock();
            if (connectedBlock) {
              connections.inputs[input.name] = {
                type: connectedBlock.type,
                id: connectedBlock.id
              };
              blockInfo.hasChildren = true;
            }
          }
        }
        
        // 顺序连接
        if (block.getNextBlock && block.getNextBlock()) {
          const nextBlock = block.getNextBlock();
          connections.next = {
            type: nextBlock.type,
            id: nextBlock.id
          };
          blockInfo.hasNext = true;
        }
        
        if (block.getPreviousBlock && block.getPreviousBlock()) {
          const previousBlock = block.getPreviousBlock();
          connections.previous = {
            type: previousBlock.type,
            id: previousBlock.id
          };
          blockInfo.hasPrevious = true;
        }
        
        // 父块连接
        if (block.getParent && block.getParent()) {
          const parentBlock = block.getParent();
          connections.parent = {
            type: parentBlock.type,
            id: parentBlock.id
          };
        }
        
        blockInfo.connections = connections;
      }
      
      // 包含代码生成
      if (includeCode) {
        try {
          let generatedCode = '';
          if ((window as any).Arduino && (window as any).Arduino.blockToCode) {
            const code = (window as any).Arduino.blockToCode(block);
            generatedCode = Array.isArray(code) ? code[0] || '' : code || '';
          }
          blockInfo.generatedCode = generatedCode || `// ${block.type} - 无代码生成`;
        } catch (error) {
          blockInfo.generatedCode = `// ${block.type} - 代码生成失败: ${error}`;
        }
      }
      
      return blockInfo;
    });
    
    // 生成简化的摘要信息
    const summary = {
      totalFound: results.length,
      byType: {} as { [type: string]: number },
      topLevelBlocks: results.filter(r => r.isTopLevel).length,
      connectedBlocks: results.filter(r => r.hasParent || r.hasChildren).length,
      isolatedBlocks: results.filter(r => !r.hasParent && !r.hasChildren && !r.hasNext && !r.hasPrevious).length
    };
    
    // 统计类型分布
    results.forEach(block => {
      summary.byType[block.type] = (summary.byType[block.type] || 0) + 1;
    });
    
    // 生成用户友好的响应文本
    let responseText = '';
    if (results.length === 0) {
      responseText = '❌ 未找到匹配的块';
    } else {
      const searchDesc = blockId ? `ID "${blockId}"` :
                        blockType ? `类型 "${blockType}"` :
                        searchCriteria ? `条件 "${searchCriteria}"` :
                        '所有块';
      
      responseText = `✅ 找到 ${results.length} 个匹配 ${searchDesc} 的块\n\n`;
      responseText += `📊 统计信息:\n`;
      responseText += `  • 总数: ${summary.totalFound}\n`;
      responseText += `  • 顶级块: ${summary.topLevelBlocks}\n`;
      responseText += `  • 连接块: ${summary.connectedBlocks}\n`;
      responseText += `  • 孤立块: ${summary.isolatedBlocks}\n\n`;
      
      responseText += `📈 类型分布:\n`;
      Object.entries(summary.byType)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          responseText += `  • ${type}: ${count} 个\n`;
        });
      
      if (includePosition) {
        responseText += `\n🔍 块详情:\n`;
        results.slice(0, 10).forEach((block, index) => { // 最多显示10个
          const fieldsStr = includeFields && Object.keys(block.fields || {}).length > 0 ?
            ` {${Object.entries(block.fields).map(([k, v]) => `${k}:${v}`).join(', ')}}` : '';
          responseText += `  ${index + 1}. ${block.type} [${block.id.substring(0, 12)}...] @(${block.position.x},${block.position.y})${fieldsStr}\n`;
        });
        
        if (results.length > 10) {
          responseText += `  ... 还有 ${results.length - 10} 个块（详见 details）\n`;
        }
      }
    }
    
    console.log(`✅ 搜索完成，返回 ${results.length} 个结果`);
    
    return {
      is_error: false,
      content: responseText,
      details: JSON.stringify({
        searchParams: { blockType, blockId, searchCriteria, fuzzyMatch },
        summary,
        blocks: results
      }, null, 2)
    };

  } catch (error) {
    console.error('❌ 查找块失败:', error);
    return {
      is_error: true,
      content: `❌ 查找块失败: ${error.message}`,
      details: JSON.stringify({ 
        error: error.message,
        searchParams: args 
      })
    };
  }
}

// =============================================================================
// 块定义查询工具 - 新增功能
// =============================================================================

/**
 * 块连接信息接口
 */
interface BlockConnectionInfo {
  blockType: string;
  connections: {
    inputs: Array<{
      name: string;
      type: 'input_statement' | 'input_value' | 'field_dropdown' | 'field_number' | 'field_variable' | string;
      check?: string | string[];
      align?: string;
    }>;
    outputs: {
      hasOutput: boolean;
      outputType?: string | string[];
    };
    flow: {
      hasPrevious: boolean;
      hasNext: boolean;
    };
  };
  metadata: {
    colour?: string;
    tooltip?: string;
    helpUrl?: string;
    message0?: string;
    library?: string;
    filePath?: string;
  };
}

/**
 * 块定义查询缓存
 */
class BlockDefinitionCache {
  private static instance: BlockDefinitionCache;
  private cache: Map<string, BlockConnectionInfo[]> = new Map();
  private lastScanTime: number = 0;
  private scanInterval: number = 5 * 60 * 1000; // 5分钟缓存

  static getInstance(): BlockDefinitionCache {
    if (!BlockDefinitionCache.instance) {
      BlockDefinitionCache.instance = new BlockDefinitionCache();
    }
    return BlockDefinitionCache.instance;
  }

  private constructor() {}

  /**
   * 检查缓存是否需要更新
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastScanTime > this.scanInterval;
  }

  /**
   * 获取缓存的块定义
   */
  getCachedDefinitions(): Map<string, BlockConnectionInfo[]> {
    return this.cache;
  }

  /**
   * 更新缓存
   */
  updateCache(definitions: Map<string, BlockConnectionInfo[]>): void {
    this.cache = definitions;
    this.lastScanTime = Date.now();
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.lastScanTime = 0;
  }
}

/**
 * 扫描并解析所有块定义文件
 */
async function scanBlockDefinitions(projectService?: any): Promise<Map<string, BlockConnectionInfo[]>> {
  console.log('🔍 开始扫描块定义文件...');
  
  const definitions = new Map<string, BlockConnectionInfo[]>();
  
  try {
    // 获取当前项目根目录 - 使用 ProjectService
    let projectRoot = '';
    
    // 优先使用传入的 ProjectService
    if (projectService) {
      projectRoot = projectService.currentProjectPath || projectService.projectRootPath || '';
      console.log(`📁 从 ProjectService 获取项目根目录: ${projectRoot}`);
    }
    
    // 如果没有 ProjectService，尝试从 window 对象获取项目路径
    if (!projectRoot && typeof window !== 'undefined' && (window as any).projectService) {
      const windowProjectService = (window as any).projectService;
      projectRoot = windowProjectService.currentProjectPath || windowProjectService.projectRootPath || '';
      console.log(`📁 从 window.projectService 获取项目根目录: ${projectRoot}`);
    }
    
    // 最后的后备方案
    if (!projectRoot) {
      console.warn('⚠️ 无法获取项目根目录，使用默认路径');
      return definitions;
    }
    console.log(`� 项目根目录: ${projectRoot}`);
    
    // 构建 node_modules/@aily-project 路径
    const aillyLibsPath = (window as any).path ? 
      (window as any).path.join(projectRoot, 'node_modules', '@aily-project') :
      `${projectRoot}/node_modules/@aily-project`;
    console.log(`📂 扫描库目录: ${aillyLibsPath}`);

    // 检查目录是否存在
    const fs = (window as any).fs;
    console.log('🔧 可用的 fs 方法:', Object.keys(fs || {}));
    
    if (!fs || !fs.existsSync(aillyLibsPath)) {
      console.warn(`⚠️ 库目录不存在: ${aillyLibsPath}`);
      return definitions;
    }

    // 读取目录中的所有子目录
    const dirEntries = fs.readDirSync(aillyLibsPath, { withFileTypes: true });
    console.log('📁 原始目录条目:', dirEntries);
    
    const libraryDirs = dirEntries
      .filter((dirent: any) => {
        // 兼容不同的 readDirSync 返回格式
        const isDir = dirent.isDirectory ? dirent.isDirectory() : 
                      (dirent.type === 'directory' || fs.isDirectory(
                        (window as any).path ? 
                          (window as any).path.join(aillyLibsPath, dirent.name || dirent) :
                          `${aillyLibsPath}/${dirent.name || dirent}`
                      ));
        return isDir;
      })
      .map((dirent: any) => dirent.name || dirent)
      .filter((name: string) => name.startsWith('lib-'));

    console.log(`📚 找到 ${libraryDirs.length} 个库目录:`, libraryDirs);

    // 遍历每个库目录
    for (const libName of libraryDirs) {
      try {
        const libPath = (window as any).path ? 
          (window as any).path.join(aillyLibsPath, libName) :
          `${aillyLibsPath}/${libName}`;
        const blockJsonPath = (window as any).path ? 
          (window as any).path.join(libPath, 'block.json') :
          `${libPath}/block.json`;
        
        console.log(`🔍 检查块定义文件: ${blockJsonPath}`);
        
        // 检查 block.json 文件是否存在
        if (fs.existsSync(blockJsonPath)) {
          console.log(`✅ 找到块定义文件: ${libName}/block.json`);
          
          // 读取并解析文件内容
          const fileContent = fs.readFileSync(blockJsonPath, 'utf8');
          const blockDefinitions = JSON.parse(fileContent);
          
          const connectionInfos: BlockConnectionInfo[] = [];
          
          // 解析每个块定义
          if (Array.isArray(blockDefinitions)) {
            for (const blockDef of blockDefinitions) {
              const connectionInfo = parseBlockDefinition(blockDef, libName, blockJsonPath);
              if (connectionInfo) {
                connectionInfos.push(connectionInfo);
              }
            }
          }
          
          definitions.set(libName, connectionInfos);
          console.log(`📦 ${libName}: 解析了 ${connectionInfos.length} 个块定义`);
          
        } else {
          console.log(`⚠️ 库 ${libName} 中未找到 block.json 文件`);
        }
        
      } catch (error) {
        console.warn(`⚠️ 处理库 ${libName} 时出错:`, error);
      }
    }

    console.log(`🎯 扫描完成，共处理 ${definitions.size} 个库的块定义`);
    return definitions;
    
  } catch (error) {
    console.error('❌ 扫描块定义文件失败:', error);
    console.log('📋 错误详情:', error);
    
    // 如果扫描失败，返回预定义的块信息作为后备
    console.log('🔄 使用预定义的块信息作为后备...');
    return getFallbackBlockDefinitions();
  }
}

/**
 * 获取后备的块定义数据（当文件扫描失败时使用）
 */
function getFallbackBlockDefinitions(): Map<string, BlockConnectionInfo[]> {
  console.log('📋 使用后备块定义数据');
  
  const definitions = new Map<string, BlockConnectionInfo[]>();
  const realBlockData = getRealBlockDefinitions();
  
  // 按库分组
  const byLibrary = new Map<string, BlockConnectionInfo[]>();
  realBlockData.forEach(block => {
    const lib = block.metadata.library || 'unknown';
    if (!byLibrary.has(lib)) {
      byLibrary.set(lib, []);
    }
    byLibrary.get(lib)!.push(block);
  });
  
  return byLibrary;
}

/**
 * 解析单个块定义
 */
function parseBlockDefinition(blockDef: any, library: string, filePath: string): BlockConnectionInfo | null {
  try {
    const connectionInfo: BlockConnectionInfo = {
      blockType: blockDef.type,
      connections: {
        inputs: [],
        outputs: {
          hasOutput: !!blockDef.output,
          outputType: blockDef.output
        },
        flow: {
          hasPrevious: blockDef.previousStatement !== undefined,
          hasNext: blockDef.nextStatement !== undefined
        }
      },
      metadata: {
        colour: blockDef.colour,
        tooltip: blockDef.tooltip,
        helpUrl: blockDef.helpUrl,
        message0: blockDef.message0,
        library,
        filePath
      }
    };

    // 解析输入定义
    const inputMessages = [
      { args: blockDef.args0, message: blockDef.message0 },
      { args: blockDef.args1, message: blockDef.message1 },
      { args: blockDef.args2, message: blockDef.message2 },
      { args: blockDef.args3, message: blockDef.message3 }
    ];

    for (const { args } of inputMessages) {
      if (args && Array.isArray(args)) {
        for (const arg of args) {
          if (arg.type && arg.name) {
            connectionInfo.connections.inputs.push({
              name: arg.name,
              type: arg.type,
              check: arg.check,
              align: arg.align
            });
          }
        }
      }
    }

    return connectionInfo;
  } catch (error) {
    console.warn(`⚠️ 解析块定义失败 ${blockDef.type}:`, error);
    return null;
  }
}

/**
 * 块定义查询工具
 */
export async function queryBlockDefinitionTool(projectService: any, args: {
  blockType?: string;
  library?: string;
  connectionType?: 'input_statement' | 'input_value' | 'previousStatement' | 'nextStatement' | 'output';
  refresh?: boolean;
  useRealData?: boolean; // 是否使用真实数据（需要文件读取）
  scanFiles?: boolean;   // 是否扫描实际文件系统
}): Promise<ToolUseResult> {
  console.log('🔍 块定义查询工具');
  console.log('📦 查询参数:', JSON.stringify(args, null, 2));

  try {
    const { blockType, library, connectionType, refresh = false, useRealData = false, scanFiles = true } = args;

    let allResults: BlockConnectionInfo[] = [];

    // 优先使用文件系统扫描
    if (scanFiles) {
      console.log('📂 使用文件系统扫描模式');
      const cache = BlockDefinitionCache.getInstance();
      let definitions: Map<string, BlockConnectionInfo[]>;
      
      if (refresh || cache.needsRefresh()) {
        console.log('🔄 刷新块定义缓存，扫描文件系统...');
        definitions = await scanBlockDefinitions(projectService);
        cache.updateCache(definitions);
      } else {
        console.log('✅ 使用缓存的块定义');
        definitions = cache.getCachedDefinitions();
      }

      // 将扫描结果转换为数组
      for (const [libName, blockInfos] of definitions) {
        allResults.push(...blockInfos);
      }

      console.log(`📊 从文件系统扫描获得 ${allResults.length} 个块定义`);
      
      // 如果文件扫描没有结果，使用后备数据
      if (allResults.length === 0) {
        console.log('⚠️ 文件扫描无结果，使用后备数据');
        allResults = getRealBlockDefinitions();
      }
    }
    // 如果不扫描文件，使用预定义数据
    else if (useRealData) {
      console.log('📋 使用预定义块数据模式');
      allResults = getRealBlockDefinitions();
    }
    // 原有的缓存逻辑（占位符）
    else {
      console.log('💾 使用缓存模式（后备）');
      const cache = BlockDefinitionCache.getInstance();
      let definitions: Map<string, BlockConnectionInfo[]>;
      
      if (refresh || cache.needsRefresh()) {
        console.log('🔄 刷新块定义缓存...');
        definitions = await scanBlockDefinitions(projectService);
        cache.updateCache(definitions);
      } else {
        console.log('✅ 使用缓存的块定义');
        definitions = cache.getCachedDefinitions();
      }

      for (const [libName, blockInfos] of definitions) {
        allResults.push(...blockInfos);
      }
    }

    // 应用过滤条件
    const filteredResults = filterBlockDefinitions(allResults, { blockType, library, connectionType });
    const summary = formatBlockDefinitionResults(filteredResults, args);

    return {
      is_error: false,
      content: summary,
      details: JSON.stringify({
        scanMode: scanFiles ? 'filesystem' : (useRealData ? 'predefined' : 'cache'),
        totalBlocksFound: allResults.length,
        matchingBlocks: filteredResults.length,
        queryParams: args,
        results: filteredResults.map(r => ({
          type: r.blockType,
          library: r.metadata.library,
          hasInputs: r.connections.inputs.length > 0,
          hasFlow: r.connections.flow.hasPrevious || r.connections.flow.hasNext,
          hasOutput: r.connections.outputs.hasOutput
        }))
      })
    };

  } catch (error) {
    console.error('❌ 块定义查询失败:', error);
    return {
      is_error: true,
      content: `❌ 块定义查询失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 获取真实的块定义数据（基于已知的block.json内容）
 */
function getRealBlockDefinitions(): BlockConnectionInfo[] {
  return [
    // lib-core-loop 库的块定义
    {
      blockType: 'arduino_setup',
      connections: {
        inputs: [
          { name: 'ARDUINO_SETUP', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: false, hasNext: false }
      },
      metadata: {
        colour: '#3a3a3a',
        message0: '▶️初始化 %1',
        library: 'lib-core-loop',
        tooltip: 'arduino_setup'
      }
    },
    {
      blockType: 'arduino_loop',
      connections: {
        inputs: [
          { name: 'ARDUINO_LOOP', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: false, hasNext: false }
      },
      metadata: {
        colour: '#3a3a3a',
        message0: '🔁循环执行 %1',
        library: 'lib-core-loop',
        tooltip: 'arduino_loop'
      }
    },
    {
      blockType: 'controls_repeat_ext',
      connections: {
        inputs: [
          { name: 'TIMES', type: 'input_value', check: 'Number' },
          { name: 'DO', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '重复 %1 次',
        library: 'lib-core-loop',
        tooltip: 'controls_repeat'
      }
    },
    {
      blockType: 'controls_repeat',
      connections: {
        inputs: [
          { name: 'TIMES', type: 'field_number' },
          { name: 'DO', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '重复 %1 次',
        library: 'lib-core-loop',
        tooltip: 'controls_repeat'
      }
    },
    {
      blockType: 'controls_whileUntil',
      connections: {
        inputs: [
          { name: 'MODE', type: 'field_dropdown' },
          { name: 'BOOL', type: 'input_value', check: 'Boolean,Number' },
          { name: 'DO', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '%1 %2',
        library: 'lib-core-loop',
        tooltip: 'while/until loop'
      }
    },
    {
      blockType: 'controls_for',
      connections: {
        inputs: [
          { name: 'VAR', type: 'field_variable' },
          { name: 'FROM', type: 'input_value', check: 'Number' },
          { name: 'TO', type: 'input_value', check: 'Number' },
          { name: 'BY', type: 'input_value', check: 'Number' },
          { name: 'DO', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '变量 %1 从 %2 到 %3 每次增加 %4',
        library: 'lib-core-loop',
        tooltip: 'for loop'
      }
    },
    {
      blockType: 'controls_flow_statements',
      connections: {
        inputs: [
          { name: 'FLOW', type: 'field_dropdown' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: false }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '%1',
        library: 'lib-core-loop',
        tooltip: 'break/continue'
      }
    },
    {
      blockType: 'controls_whileForever',
      connections: {
        inputs: [
          { name: 'DO', type: 'input_statement' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: 'loop_blocks',
        message0: '🔁 永远循环 %1',
        library: 'lib-core-loop',
        tooltip: 'forever loop'
      }
    },
    // lib-core-serial 库的主要块定义
    {
      blockType: 'serial_begin',
      connections: {
        inputs: [
          { name: 'SERIAL', type: 'field_dropdown' },
          { name: 'SPEED', type: 'field_dropdown' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#48c2c4',
        message0: '初始化串口%1 设置波特率为%2',
        library: 'lib-core-serial',
        tooltip: 'Initialize serial communication'
      }
    },
    {
      blockType: 'serial_available',
      connections: {
        inputs: [
          { name: 'SERIAL', type: 'field_dropdown' }
        ],
        outputs: { hasOutput: true, outputType: 'Boolean' },
        flow: { hasPrevious: false, hasNext: false }
      },
      metadata: {
        colour: '#48c2c4',
        message0: '串口%1缓冲区有数据',
        library: 'lib-core-serial',
        tooltip: 'Check if serial data available'
      }
    },
    {
      blockType: 'serial_println',
      connections: {
        inputs: [
          { name: 'SERIAL', type: 'field_dropdown' },
          { name: 'CONTENT', type: 'input_value' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#48c2c4',
        message0: '串口%1输出一行%2',
        library: 'lib-core-serial',
        tooltip: 'Print line to serial'
      }
    },
    {
      blockType: 'serial_print',
      connections: {
        inputs: [
          { name: 'SERIAL', type: 'field_dropdown' },
          { name: 'CONTENT', type: 'input_value' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#48c2c4',
        message0: '串口%1输出%2',
        library: 'lib-core-serial',
        tooltip: 'Print to serial'
      }
    },
    // lib-blinker 库的主要块定义
    {
      blockType: 'blinker_init_wifi',
      connections: {
        inputs: [
          { name: 'MODE', type: 'field_dropdown' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#03A9F4',
        message0: '初始化Blinker WiFi模式 %1',
        library: 'lib-blinker',
        tooltip: 'Initialize Blinker WiFi'
      }
    },
    {
      blockType: 'blinker_init_ble',
      connections: {
        inputs: [],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#03A9F4',
        message0: '初始化Blinker BLE模式',
        library: 'lib-blinker',
        tooltip: 'Initialize Blinker BLE'
      }
    },
    {
      blockType: 'blinker_debug_init',
      connections: {
        inputs: [
          { name: 'SERIAL', type: 'field_dropdown' },
          { name: 'SPEED', type: 'field_dropdown' }
        ],
        outputs: { hasOutput: false },
        flow: { hasPrevious: true, hasNext: true }
      },
      metadata: {
        colour: '#03A9F4',
        message0: '初始化Blinker调试 串口 %1 速率 %2 完整调试 %3',
        library: 'lib-blinker',
        tooltip: 'Initialize Blinker debug'
      }
    }
  ];
}

/**
 * 过滤块定义结果
 */
function filterBlockDefinitions(
  allBlocks: BlockConnectionInfo[],
  filters: {
    blockType?: string;
    library?: string;
    connectionType?: string;
  }
): BlockConnectionInfo[] {
  const { blockType, library, connectionType } = filters;
  
  return allBlocks.filter(block => {
    // 按块类型过滤
    if (blockType && block.blockType !== blockType) return false;
    
    // 按库过滤
    if (library && block.metadata.library !== library) return false;
    
    // 按连接类型过滤
    if (connectionType) {
      switch (connectionType) {
        case 'input_statement':
          return block.connections.inputs.some(input => input.type === 'input_statement');
        case 'input_value':
          return block.connections.inputs.some(input => input.type === 'input_value');
        case 'previousStatement':
          return block.connections.flow.hasPrevious;
        case 'nextStatement':
          return block.connections.flow.hasNext;
        case 'output':
          return block.connections.outputs.hasOutput;
        default:
          return true;
      }
    }
    
    return true;
  });
}

/**
 * 格式化块定义查询结果
 */
function formatBlockDefinitionResults(results: BlockConnectionInfo[], queryParams: any): string {
  const lines: string[] = [];
  
  lines.push('🔍 块定义查询结果');
  lines.push('='.repeat(50));
  lines.push('');
  
  if (results.length === 0) {
    lines.push('❌ 未找到匹配的块定义');
    return lines.join('\n');
  }

  lines.push(`📊 查询统计: 找到 ${results.length} 个匹配的块定义`);
  lines.push('');

  // 按库分组显示
  const byLibrary = new Map<string, BlockConnectionInfo[]>();
  results.forEach(result => {
    const lib = result.metadata.library || 'unknown';
    if (!byLibrary.has(lib)) {
      byLibrary.set(lib, []);
    }
    byLibrary.get(lib)!.push(result);
  });

  for (const [library, blocks] of byLibrary) {
    lines.push(`📚 库: ${library} (${blocks.length} 个块)`);
    lines.push('');
    
    for (const block of blocks) {
      lines.push(`  🔹 ${block.blockType}`);
      if (block.metadata.message0) {
        lines.push(`     📝 ${block.metadata.message0}`);
      }
      
      // 连接信息
      const connections: string[] = [];
      
      if (block.connections.flow.hasPrevious) connections.push('⬆️ Previous');
      if (block.connections.flow.hasNext) connections.push('⬇️ Next');
      if (block.connections.outputs.hasOutput) connections.push(`➡️ Output(${block.connections.outputs.outputType || 'Any'})`);
      
      // 输入连接
      const inputConnections = block.connections.inputs.filter(input => 
        input.type === 'input_statement' || input.type === 'input_value'
      );
      
      inputConnections.forEach(input => {
        if (input.type === 'input_statement') {
          connections.push(`🔗 Statement(${input.name})`);
        } else if (input.type === 'input_value') {
          connections.push(`🔌 Value(${input.name}${input.check ? `:${input.check}` : ''})`);
        }
      });
      
      if (connections.length > 0) {
        lines.push(`     🔗 连接: ${connections.join(', ')}`);
      }
      
      if (block.metadata.colour) {
        lines.push(`     🎨 颜色: ${block.metadata.colour}`);
      }
      
      lines.push('');
    }
    
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 获取特定块类型的连接兼容性
 */
export async function getBlockConnectionCompatibilityTool(projectService: any, args: {
  sourceBlockType: string;
  targetBlockType: string;
  library?: string;
}): Promise<ToolUseResult> {
  console.log('🔗 块连接兼容性查询');
  console.log('📦 查询参数:', JSON.stringify(args, null, 2));

  try {
    const { sourceBlockType, targetBlockType, library } = args;
    
    // 获取真实块定义数据
    const allBlocks = getRealBlockDefinitions();
    
    // 查找源块和目标块
    let sourceBlock: BlockConnectionInfo | null = null;
    let targetBlock: BlockConnectionInfo | null = null;
    
    for (const block of allBlocks) {
      if (block.blockType === sourceBlockType && (!library || block.metadata.library === library)) {
        sourceBlock = block;
      }
      if (block.blockType === targetBlockType && (!library || block.metadata.library === library)) {
        targetBlock = block;
      }
    }

    if (!sourceBlock) {
      return {
        is_error: true,
        content: `❌ 未找到源块定义: ${sourceBlockType}`
      };
    }

    if (!targetBlock) {
      return {
        is_error: true,
        content: `❌ 未找到目标块定义: ${targetBlockType}`
      };
    }

    // 分析连接兼容性
    const compatibility = analyzeConnectionCompatibility(sourceBlock, targetBlock);
    const summary = formatCompatibilityResults(sourceBlock, targetBlock, compatibility);

    return {
      is_error: false,
      content: summary,
      details: JSON.stringify({
        sourceBlock: sourceBlockType,
        targetBlock: targetBlockType,
        compatibility
      })
    };

  } catch (error) {
    console.error('❌ 连接兼容性查询失败:', error);
    return {
      is_error: true,
      content: `❌ 连接兼容性查询失败: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 分析两个块之间的连接兼容性
 */
function analyzeConnectionCompatibility(
  sourceBlock: BlockConnectionInfo, 
  targetBlock: BlockConnectionInfo
): {
  canConnect: boolean;
  connections: Array<{
    type: 'next' | 'input' | 'statement';
    sourceConnection: string;
    targetConnection: string;
    compatible: boolean;
    inputName?: string;
  }>;
} {
  const connections: Array<{
    type: 'next' | 'input' | 'statement';
    sourceConnection: string;
    targetConnection: string;
    compatible: boolean;
    inputName?: string;
  }> = [];

  // 检查 Next 连接 (源块的 next 连接到目标块的 previous)
  if (sourceBlock.connections.flow.hasNext && targetBlock.connections.flow.hasPrevious) {
    connections.push({
      type: 'next',
      sourceConnection: 'nextStatement',
      targetConnection: 'previousStatement', 
      compatible: true
    });
  }

  // 检查输入连接 (目标块的输入可以连接源块的输出)
  for (const input of targetBlock.connections.inputs) {
    if (input.type === 'input_value' && sourceBlock.connections.outputs.hasOutput) {
      // 检查类型兼容性
      let compatible = true;
      if (input.check && sourceBlock.connections.outputs.outputType) {
        const inputTypes = Array.isArray(input.check) ? input.check : [input.check];
        const outputTypes = Array.isArray(sourceBlock.connections.outputs.outputType) 
          ? sourceBlock.connections.outputs.outputType 
          : [sourceBlock.connections.outputs.outputType];
        
        compatible = inputTypes.some(inputType => outputTypes.includes(inputType));
      }
      
      connections.push({
        type: 'input',
        sourceConnection: 'output',
        targetConnection: input.name,
        compatible,
        inputName: input.name
      });
    }
    
    if (input.type === 'input_statement' && sourceBlock.connections.flow.hasPrevious) {
      connections.push({
        type: 'statement',
        sourceConnection: 'previousStatement',
        targetConnection: input.name,
        compatible: true,
        inputName: input.name
      });
    }
  }

  const canConnect = connections.some(conn => conn.compatible);

  return { canConnect, connections };
}

/**
 * 格式化兼容性查询结果
 */
function formatCompatibilityResults(
  sourceBlock: BlockConnectionInfo,
  targetBlock: BlockConnectionInfo,
  compatibility: any
): string {
  const lines: string[] = [];
  
  lines.push('🔗 块连接兼容性分析');
  lines.push('='.repeat(50));
  lines.push('');
  
  lines.push(`📦 源块: ${sourceBlock.blockType} (${sourceBlock.metadata.library})`);
  if (sourceBlock.metadata.message0) {
    lines.push(`   📝 ${sourceBlock.metadata.message0}`);
  }
  lines.push('');
  
  lines.push(`📦 目标块: ${targetBlock.blockType} (${targetBlock.metadata.library})`);
  if (targetBlock.metadata.message0) {
    lines.push(`   📝 ${targetBlock.metadata.message0}`);
  }
  lines.push('');
  
  lines.push(`🔗 连接兼容性: ${compatibility.canConnect ? '✅ 可以连接' : '❌ 无法连接'}`);
  lines.push('');
  
  if (compatibility.connections.length > 0) {
    lines.push('📋 可能的连接方式:');
    lines.push('');
    
    for (const conn of compatibility.connections) {
      const status = conn.compatible ? '✅' : '❌';
      const inputName = conn.inputName ? ` (输入: ${conn.inputName})` : '';
      
      lines.push(`  ${status} ${conn.type} 连接: ${conn.sourceConnection} → ${conn.targetConnection}${inputName}`);
    }
  } else {
    lines.push('❌ 没有找到可能的连接方式');
  }
  
  return lines.join('\n');
}

// =============================================================================
// 动态结构创建辅助函数
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
    if ((window as any)['Blockly']?.getMainWorkspace) {
      const mainWorkspace = (window as any)['Blockly'].getMainWorkspace();
      if (mainWorkspace && !mainWorkspace.disposed) {
        return mainWorkspace;
      }
    }

    // 方法3: 尝试从所有工作区中找到活动的
    if ((window as any)['Blockly']?.Workspace?.getAll) {
      const workspaces = (window as any)['Blockly'].Workspace.getAll();
      for (const workspace of workspaces) {
        if (!workspace.disposed && workspace.svgGroup_) {
          const svgElement = workspace.getParentSvg();
          if (svgElement && svgElement.parentNode) {
            return workspace;
          }
        }
      }
    }

    throw new Error('未找到活动的 Blockly 工作区');
  } catch (error) {
    console.error('❌ 获取工作区失败:', error);
    throw error;
  }
}

/**
 * 获取 BlocklyService 的辅助函数
 */
function getBlocklyService(): any {
  // 从 window 对象获取 Angular 服务引用
  if ((window as any).angularServiceRef && (window as any).angularServiceRef.blocklyService) {
    return (window as any).angularServiceRef.blocklyService;
  }
  return null;
}

/**
 * 计算块的放置位置
 */
function calculateBlockPosition(workspace: any, x?: number, y?: number): Position {
  const metrics = workspace.getMetrics();
  
  return {
    x: x !== undefined ? x : metrics.viewLeft + 50,
    y: y !== undefined ? y : metrics.viewTop + 50
  };
}

/**
 * 创建动态结构 - 支持用户自定义的任意块结构
 */
async function createDynamicStructure(
  workspace: any, 
  config: any, 
  position: Position, 
  createdBlocks: string[], 
  connections: any[]
): Promise<any> {
  console.log('🚀 创建动态自定义结构');
  
  if (!config.structureDefinition) {
    throw new Error('动态结构必须提供 structureDefinition 配置');
  }
  
  const { rootBlock: rootConfig, additionalBlocks = [], connectionRules = [] } = config.structureDefinition;
  
  // 预分析连接规则，确定每个块需要的输入
  const blockInputRequirements = analyzeInputRequirements(connectionRules);
  console.log('📊 块输入需求分析:', blockInputRequirements);
  
  // 存储所有创建的块，用于后续连接
  const blockMap = new Map<string, any>();
  
  // 1. 创建根块
  console.log('📦 创建根块:', rootConfig.type);
  console.log('🔍 根块配置:', JSON.stringify(rootConfig, null, 2));
  const enhancedRootConfig = enhanceConfigWithInputs(rootConfig, blockInputRequirements);
  const rootResult = await createBlockFromConfig(workspace, enhancedRootConfig, blockMap);
  if (rootResult?.block) {
    const rootBlock = rootResult.block;
    console.log(`✅ 根块创建成功: ${rootBlock.type}[${rootBlock.id}]`);
    createdBlocks.push(rootBlock.id);
    
    // 设置多个映射键以提高连接成功率
    blockMap.set('root', rootBlock);
    blockMap.set(rootBlock.type, rootBlock); // 使用块类型作为键
    
    // 如果根块配置有标识符，也用标识符作为键
    if (rootConfig.id) {
      console.log(`🗂️ 设置根块映射键: ${rootConfig.id} → ${rootBlock.type}[${rootBlock.id}]`);
      blockMap.set(rootConfig.id, rootBlock);
    }
    
    console.log(`🗂️ 根块映射键设置: 'root', '${rootBlock.type}' → ${rootBlock.type}[${rootBlock.id}]`);
  } else {
    console.error(`❌ 根块创建失败: ${rootConfig.type}`);
  }
  
  // 2. 创建附加块
  for (let i = 0; i < additionalBlocks.length; i++) {
    const blockConfig = additionalBlocks[i];
    console.log(`📦 创建附加块 ${i + 1}:`, blockConfig.type);
    console.log(`🔍 附加块配置:`, JSON.stringify(blockConfig, null, 2));
    
    const enhancedConfig = enhanceConfigWithInputs(blockConfig, blockInputRequirements);
    const blockResult = await createBlockFromConfig(workspace, enhancedConfig, blockMap);
    if (blockResult?.block) {
      const block = blockResult.block;
      console.log(`✅ 附加块创建成功: ${block.type}[${block.id}]`);
      createdBlocks.push(block.id);
      
      // 设置多个映射键以提高连接成功率
      const blockKey = blockConfig.id || `block_${i}`;
      blockMap.set(blockKey, block);
      blockMap.set(block.type, block); // 使用块类型作为键
      
      console.log(`🗂️ 附加块映射键设置: '${blockKey}', '${block.type}' → ${block.type}[${block.id}]`);
    } else {
      console.error(`❌ 附加块创建失败: ${blockConfig.type}`);
    }
  }
  
  // 3. 根据连接规则连接块
  console.log('🗺️ 当前块映射表:');
  for (const [key, block] of blockMap.entries()) {
    console.log(`  - ${key} → ${block.type}[${block.id}]`);
  }
  
  for (const rule of connectionRules) {
    try {
      console.log(`🔍 尝试连接: ${rule.source} -> ${rule.target}`);
      
      // 智能查找源块和目标块 - 尝试多种映射键
      let sourceBlock = blockMap.get(rule.source);
      let targetBlock = blockMap.get(rule.target);
      
      // 如果直接查找失败，尝试其他可能的键
      if (!sourceBlock) {
        console.log(`⚠️ 未找到源块 "${rule.source}"，尝试其他映射键...`);
        for (const [key, block] of blockMap.entries()) {
          if (key.includes(rule.source) || rule.source.includes(key) || 
              block.type === rule.source || rule.source === block.type) {
            sourceBlock = block;
            console.log(`✅ 找到源块替代映射: "${key}" → ${block.type}[${block.id}]`);
            break;
          }
        }
      }
      
      if (!targetBlock) {
        console.log(`⚠️ 未找到目标块 "${rule.target}"，尝试其他映射键...`);
        for (const [key, block] of blockMap.entries()) {
          if (key.includes(rule.target) || rule.target.includes(key) || 
              block.type === rule.target || rule.target === block.type) {
            targetBlock = block;
            console.log(`✅ 找到目标块替代映射: "${key}" → ${block.type}[${block.id}]`);
            break;
          }
        }
      }
      
      if (sourceBlock && targetBlock) {
        console.log(`✅ 找到连接块: ${sourceBlock.type}[${sourceBlock.id}] -> ${targetBlock.type}[${targetBlock.id}]`);
        console.log(`🔗 执行连接: ${rule.source} -> ${rule.target} (类型: ${rule.connectionType || 'next'})`);
        
        // 在连接操作时临时禁用事件，避免移动事件错误
        const wasRecordingUndo = (window as any)['Blockly'].Events.getRecordUndo();
        const currentGroup = (window as any)['Blockly'].Events.getGroup();
        (window as any)['Blockly'].Events.disable();
        
        try {
          if (rule.connectionType === 'next' || !rule.connectionType) {
            // 下一个块连接
            if (sourceBlock.nextConnection && targetBlock.previousConnection) {
              sourceBlock.nextConnection.connect(targetBlock.previousConnection);
              connections.push({
                sourceId: sourceBlock.id,
                targetId: targetBlock.id,
                connectionType: 'next'
              });
              console.log(`✅ next 连接成功: ${sourceBlock.type} -> ${targetBlock.type}`);
            }
          } else if (rule.connectionType === 'input' && rule.inputName) {
            // 输入连接
            const inputConnection = sourceBlock.getInput(rule.inputName);
            if (inputConnection && targetBlock.outputConnection) {
              inputConnection.connection.connect(targetBlock.outputConnection);
              connections.push({
                sourceId: sourceBlock.id,
                targetId: targetBlock.id,
                connectionType: 'input',
                inputName: rule.inputName
              });
              console.log(`✅ input 连接成功: ${sourceBlock.type}.${rule.inputName} -> ${targetBlock.type}`);
            }
          } else if (rule.connectionType === 'statement') {
            // 父块连接（statement连接）
            const statementConnection = sourceBlock.getInput(rule.inputName || 'DO');
            if (statementConnection && targetBlock.previousConnection) {
              statementConnection.connection.connect(targetBlock.previousConnection);
              connections.push({
                sourceId: sourceBlock.id,
                targetId: targetBlock.id,
                connectionType: 'statement',
                inputName: rule.inputName || 'DO'
              });
              console.log(`✅ statement 连接成功: ${sourceBlock.type}.${rule.inputName || 'DO'} -> ${targetBlock.type}`);
            }
          }
        } catch (connectError) {
          console.warn(`⚠️ 连接操作时出错: ${connectError}, 但连接尝试继续`);
        } finally {
          // 恢复事件系统
          (window as any)['Blockly'].Events.enable();
          if (currentGroup) {
            (window as any)['Blockly'].Events.setGroup(currentGroup);
          }
          (window as any)['Blockly'].Events.setRecordUndo(wasRecordingUndo);
        }
      } else {
        console.warn(`⚠️ 无法找到连接的块: ${rule.source} -> ${rule.target}`);
        console.warn(`  源块 "${rule.source}": ${sourceBlock ? '✅ 找到' : '❌ 未找到'}`);
        console.warn(`  目标块 "${rule.target}": ${targetBlock ? '✅ 找到' : '❌ 未找到'}`);
        console.warn(`  可用的块键: [${Array.from(blockMap.keys()).join(', ')}]`);
      }
    } catch (error) {
      console.error(`❌ 连接块时出错:`, error);
    }
  }
  
  return rootResult?.block || null;
}

/**
 * 分析连接规则，确定每个块需要的输入
 */
function analyzeInputRequirements(connectionRules: any[]): Map<string, string[]> {
  const requirements = new Map<string, string[]>();
  
  for (const rule of connectionRules) {
    if (rule.connectionType === 'input' && rule.inputName) {
      const sourceId = rule.source;
      if (!requirements.has(sourceId)) {
        requirements.set(sourceId, []);
      }
      const inputs = requirements.get(sourceId)!;
      if (!inputs.includes(rule.inputName)) {
        inputs.push(rule.inputName);
      }
    }
  }
  
  return requirements;
}

/**
 * 根据输入需求增强块配置
 */
function enhanceConfigWithInputs(config: any, requirements: Map<string, string[]>): any {
  if (!config.id || !requirements.has(config.id)) {
    return config;
  }
  
  const enhancedConfig = { ...config };
  const requiredInputs = requirements.get(config.id)!;
  
  if (!enhancedConfig.inputs) {
    enhancedConfig.inputs = {};
  }
  
  for (const inputName of requiredInputs) {
    if (!enhancedConfig.inputs[inputName]) {
      enhancedConfig.inputs[inputName] = { connection: 'value' };
    }
  }
  
  return enhancedConfig;
}

/**
 * 处理块插入
 */
async function handleBlockInsertion(
  workspace: any, 
  block: any, 
  insertPosition: string, 
  targetBlockId: string, 
  targetInput?: string
): Promise<void> {
  console.log(`🎯 执行块插入详细过程:`);
  console.log(`  - 插入位置: ${insertPosition}`);
  console.log(`  - 目标块ID: ${targetBlockId}`);
  console.log(`  - 指定输入: ${targetInput || '未指定'}`);
  console.log(`  - 要插入的块: ${block.type}[${block.id}]`);
  
  // 使用智能块查找，支持模糊匹配
  console.log(`🔍 智能查找目标块: "${targetBlockId}"...`);
  const targetBlock = getBlockByIdSmart(workspace, targetBlockId, {
    enableFuzzyMatch: true,
    minScore: 60,
    logDetails: true
  });
  
  if (!targetBlock) {
    console.warn(`⚠️ 智能查找也未找到目标块: ${targetBlockId}`);
    console.warn(`提示: 请检查目标块ID是否正确，或者目标块是否存在于工作区中`);
    return;
  }
  
  console.log(`✅ 找到目标块: ${targetBlock.type}[${targetBlock.id}]`);
  
  switch (insertPosition) {
    case 'after':
      console.log(`🔗 尝试 after 连接...`);
      if (targetBlock.nextConnection && block.previousConnection) {
        targetBlock.nextConnection.connect(block.previousConnection);
        console.log(`✅ after 插入成功`);
      } else {
        console.warn(`❌ after 连接失败 - 连接点不匹配`);
        console.warn(`  目标块nextConnection: ${!!targetBlock.nextConnection}`);
        console.warn(`  插入块previousConnection: ${!!block.previousConnection}`);
      }
      break;
      
    case 'before':
      console.log(`🔗 尝试 before 连接...`);
      if (targetBlock.previousConnection && block.nextConnection) {
        block.nextConnection.connect(targetBlock.previousConnection);
        console.log(`✅ before 插入成功`);
      } else {
        console.warn(`❌ before 连接失败 - 连接点不匹配`);
        console.warn(`  目标块previousConnection: ${!!targetBlock.previousConnection}`);
        console.warn(`  插入块nextConnection: ${!!block.nextConnection}`);
      }
      break;
      
    case 'input':
      console.log(`🔗 尝试 input 连接到: ${targetInput}`);
      if (targetInput) {
        const input = targetBlock.getInput(targetInput);
        if (input && input.connection && block.outputConnection) {
          input.connection.connect(block.outputConnection);
          console.log(`✅ input 插入成功: ${targetInput}`);
        } else {
          console.warn(`❌ input 连接失败`);
          console.warn(`  目标输入存在: ${!!input}`);
          console.warn(`  目标输入有连接: ${!!(input && input.connection)}`);
          console.warn(`  插入块outputConnection: ${!!block.outputConnection}`);
        }
      } else {
        console.warn(`❌ input 连接失败: 未指定 targetInput`);
      }
      break;
      
    case 'statement':
      console.log(`🔗 尝试 statement 连接...`);
      
      // 智能检测目标输入名
      let actualInputName = targetInput;
      
      if (!actualInputName) {
        console.log(`🔍 未指定输入名，开始智能检测...`);
        
        // 首先尝试常见的语句输入名称（优先考虑块类型特定的）
        const possibleInputs = [];
        
        // 根据目标块类型添加特定的输入名
        if (targetBlock.type.includes('setup')) {
          possibleInputs.push('ARDUINO_SETUP', 'SETUP', 'DO', 'STACK');
        } else if (targetBlock.type.includes('loop')) {
          possibleInputs.push('ARDUINO_LOOP', 'LOOP', 'DO', 'STACK');
        } else {
          possibleInputs.push('DO', 'STACK', 'BODY', 'NAME', 'DO0');
        }
        
        console.log(`🔍 尝试输入名列表: [${possibleInputs.join(', ')}]`);
        
        // 检查所有可能的输入名
        for (const inputName of possibleInputs) {
          const testInput = targetBlock.getInput(inputName);
          if (testInput && testInput.connection) {
            console.log(`✅ 检测到有效的语句输入: ${inputName}`);
            console.log(`  输入类型: ${testInput.type}`);
            console.log(`  连接类型: ${testInput.connection.type}`);
            
            // 验证这确实是一个语句输入（类型为3或4）
            if (testInput.type === 3 || testInput.connection.type === 3 || testInput.connection.type === 4) {
              actualInputName = inputName;
              console.log(`🎯 选择语句输入: ${inputName}`);
              break;
            } else {
              console.log(`⚠️ ${inputName} 不是语句输入，继续查找...`);
            }
          } else {
            console.log(`❌ ${inputName} 不存在或无连接`);
          }
        }
        
        // 如果还是没找到，列出所有输入进行调试
        if (!actualInputName) {
          console.warn(`⚠️ 未找到合适的语句输入，列出目标块所有输入:`);
          const inputList = targetBlock.inputList || [];
          for (let i = 0; i < inputList.length; i++) {
            const input = inputList[i];
            console.warn(`  输入 ${i}: name="${input.name}", type=${input.type}, hasConnection=${!!input.connection}`);
            if (input.connection) {
              console.warn(`    连接类型: ${input.connection.type}`);
            }
          }
        }
      }
      
      if (actualInputName) {
        console.log(`🔗 使用输入名进行连接: ${actualInputName}`);
        const statementInput = targetBlock.getInput(actualInputName);
        
        if (statementInput && statementInput.connection && block.previousConnection) {
          console.log(`🔗 执行statement连接...`);
          console.log(`  目标输入连接类型: ${statementInput.connection.type}`);
          console.log(`  插入块连接类型: ${block.previousConnection.type}`);
          
          try {
            statementInput.connection.connect(block.previousConnection);
            console.log(`✅ statement 插入成功: ${actualInputName}`);
          } catch (connectError) {
            console.error(`❌ statement 连接异常:`, connectError);
          }
        } else {
          console.warn(`❌ statement 连接失败 - 连接点检查:`);
          console.warn(`  语句输入存在: ${!!statementInput}`);
          console.warn(`  语句输入连接存在: ${!!(statementInput && statementInput.connection)}`);
          console.warn(`  插入块previousConnection存在: ${!!block.previousConnection}`);
          
          if (statementInput) {
            console.warn(`  语句输入类型: ${statementInput.type}`);
            if (statementInput.connection) {
              console.warn(`  语句输入连接类型: ${statementInput.connection.type}`);
            }
          }
          if (block.previousConnection) {
            console.warn(`  插入块连接类型: ${block.previousConnection.type}`);
          }
        }
      } else {
        console.error(`❌ statement 插入失败: 无法确定目标输入名`);
        console.error(`  目标块类型: ${targetBlock.type}`);
        console.error(`  请检查目标块是否为容器块（如 setup, loop 等）`);
      }
      break;
      
    default:
      console.warn(`⚠️ 未支持的插入位置: ${insertPosition}`);
  }
}
