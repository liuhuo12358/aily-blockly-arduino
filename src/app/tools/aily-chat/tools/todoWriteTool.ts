import { ToolUseResult } from "./tools";
import { 
  TodoItem, 
  TodoQuery,
  getTodos,
  setTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  clearTodos,
  getTodoById,
  getTodosByStatus,
  getTodosByPriority,
  queryTodos,
  getTodoStatistics,
  optimizeTodoStorage,
  validateTodos
} from "../utils/todoStorage";

export async function todoWriteTool(toolArgs: any): Promise<ToolUseResult & { todos?: any[] }> {
  let toolResult = null;
  let is_error = false;

  try {
    const { 
      operation, 
      sessionId = 'default', 
      todos, 
      id, 
      content, 
      status, 
      priority, 
      tags, 
      estimatedHours,
      query 
    } = toolArgs;

    // 生成增强的显示格式
    const formatTodoList = (todos: TodoItem[]): string => {
      if (todos.length === 0) {
        return '📝 **TODO列表为空**\n\n💡 使用 `{"operation": "add", "content": "任务内容", "priority": "high", "tags": ["标签"]}` 添加新任务';
      }

      let result = '📝 **TODO列表**\n\n';
      
      todos.forEach((todo, index) => {
        const statusIcon = todo.status === 'completed' ? '✅' : 
                          todo.status === 'in_progress' ? '🔄' : '⏸️';
        const priorityIcon = todo.priority === 'high' ? '🔴' : 
                            todo.priority === 'medium' ? '🟡' : '🟢';
        
        const isCompleted = todo.status === 'completed';
        const todoText = isCompleted ? `~~${todo.content}~~` : `**${todo.content}**`;
        
        // 显示标签
        const tagsDisplay = Array.isArray(todo.tags) && todo.tags.length > 0 
          ? ` 🏷️[${todo.tags.join(', ')}]` 
          : '';
          
        // 显示预估时间
        const hoursDisplay = todo.estimatedHours 
          ? ` ⏱️${todo.estimatedHours}h` 
          : '';
          
        // 显示状态变化
        const statusChange = todo.previousStatus && todo.previousStatus !== todo.status
          ? ` (${todo.previousStatus} → ${todo.status})`
          : '';
        
        result += `${index + 1}. ${statusIcon} ${priorityIcon} ${todoText}${tagsDisplay}${hoursDisplay} \`(${todo.id})\`${statusChange}\n`;
      });

      const stats = getTodoStatistics(sessionId);
      result += `\n📊 **统计**: 总计${stats.total}项 | ⏸️待处理${stats.byStatus.pending}项 | 🔄进行中${stats.byStatus.in_progress}项 | ✅已完成${stats.byStatus.completed}项`;
      
      if (stats.estimatedTotalHours > 0) {
        result += ` | ⏱️预估${stats.estimatedTotalHours}小时`;
      }
      
      if (stats.cacheEfficiency > 0) {
        result += ` | 📈缓存效率${stats.cacheEfficiency}%`;
      }
      
      return result;
    };

    const generateId = (): string => {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    switch (operation) {
      case 'update':
        // 批量更新TODO列表
        if (!todos || !Array.isArray(todos)) {
          toolResult = '❌ **错误**: 缺少todos数组\n\n💡 **正确用法**: `{"operation": "update", "todos": [...]}` ';
          is_error = true;
          break;
        }

        // 验证todos格式
        const validatedTodos: TodoItem[] = todos.map((todo: any) => ({
          id: todo.id || generateId(),
          content: todo.content?.trim() || '',
          status: ['pending', 'in_progress', 'completed'].includes(todo.status) ? todo.status : 'pending',
          priority: ['high', 'medium', 'low'].includes(todo.priority) ? todo.priority : 'medium',
          tags: Array.isArray(todo.tags) ? todo.tags : [],
          estimatedHours: typeof todo.estimatedHours === 'number' ? todo.estimatedHours : undefined,
          createdAt: todo.createdAt || Date.now(),
          updatedAt: Date.now()
        }));

        // 验证
        const validation = validateTodos(validatedTodos);
        if (!validation.result) {
          toolResult = `❌ **验证失败**: ${validation.message}`;
          is_error = true;
          break;
        }

        setTodos(validatedTodos, sessionId);
        toolResult = `✅ **TODO列表更新成功**\n\n${formatTodoList(validatedTodos)}`;
        break;

      case 'add':
        if (!content?.trim()) {
          toolResult = '❌ **错误**: 缺少任务内容\n\n💡 **正确用法**: `{"operation": "add", "content": "任务内容", "priority": "high|medium|low", "status": "pending|in_progress|completed", "tags": ["标签"]}` ';
          is_error = true;
          break;
        }

        try {
          const newTodo = {
            id: generateId(),
            content: content.trim(),
            status: ['pending', 'in_progress', 'completed'].includes(status) ? status : 'pending' as const,
            priority: priority || 'medium' as const,
            tags: Array.isArray(tags) ? tags : [],
            estimatedHours: estimatedHours,
          };

          // 检查是否已有in_progress任务（当新任务要设置为in_progress时）
          if (newTodo.status === 'in_progress') {
            const inProgressTodos = getTodosByStatus('in_progress', sessionId);
            if (inProgressTodos.length > 0) {
              toolResult = '❌ **错误**: 已有任务在进行中，请先完成当前任务或创建为待处理状态';
              is_error = true;
              break;
            }
          }

          const updatedTodos = addTodo(newTodo, sessionId);
          
          const statusIcon = newTodo.status === 'completed' ? '✅' : 
                            newTodo.status === 'in_progress' ? '🔄' : '⏸️';
          const priorityIcon = newTodo.priority === 'high' ? '🔴' : 
                              newTodo.priority === 'medium' ? '🟡' : '🟢';
          const tagsDisplay = Array.isArray(newTodo.tags) && newTodo.tags.length > 0 
            ? ` 🏷️[${newTodo.tags.join(', ')}]` 
            : '';
          const hoursDisplay = newTodo.estimatedHours 
            ? ` ⏱️${newTodo.estimatedHours}h` 
            : '';
            
          toolResult = `✅ **任务添加成功**: ${statusIcon} ${priorityIcon} ${newTodo.content}${tagsDisplay}${hoursDisplay} \`(${newTodo.id})\`\n\n${formatTodoList(updatedTodos)}`;
        } catch (error) {
          toolResult = `❌ **添加失败**: ${error instanceof Error ? error.message : '未知错误'}`;
          is_error = true;
        }
        break;

      case 'batch_add':
        if (!todos || !Array.isArray(todos) || todos.length === 0) {
          toolResult = '❌ **错误**: 缺少任务数组\n\n💡 **正确用法**: `{"operation": "batch_add", "todos": [{"content": "任务1", "priority": "high"}, {"content": "任务2"}]}` ';
          is_error = true;
          break;
        }

        try {
          const currentTodos = getTodos(sessionId);
          const inProgressCount = currentTodos.filter(t => t.status === 'in_progress').length;
          
          const newTodos = todos.map((todo: any) => ({
            id: todo.id || generateId(),
            content: todo.content?.trim() || '',
            status: ['pending', 'in_progress', 'completed'].includes(todo.status) ? todo.status : 'pending',
            priority: ['high', 'medium', 'low'].includes(todo.priority) ? todo.priority : 'medium',
            tags: Array.isArray(todo.tags) ? todo.tags : [],
            estimatedHours: typeof todo.estimatedHours === 'number' ? todo.estimatedHours : undefined,
          }));

          // 验证新任务
          const newInProgressCount = newTodos.filter(t => t.status === 'in_progress').length;
          if (inProgressCount + newInProgressCount > 1) {
            toolResult = '❌ **错误**: 添加后将有多个进行中任务，同时只能有一个任务处于进行中状态';
            is_error = true;
            break;
          }

          // 逐个添加任务
          let addedCount = 0;
          let failedTasks: string[] = [];
          
          for (const newTodo of newTodos) {
            try {
              if (!newTodo.content?.trim()) {
                failedTasks.push(`空内容任务`);
                continue;
              }
              
              await addTodo(newTodo, sessionId);
              addedCount++;
            } catch (error) {
              failedTasks.push(`"${newTodo.content}": ${error instanceof Error ? error.message : '未知错误'}`);
            }
          }

          const updatedTodos = getTodos(sessionId);
          
          let resultMessage = `✅ **批量添加完成**: 成功添加${addedCount}个任务`;
          if (failedTasks.length > 0) {
            resultMessage += `\n⚠️ **失败${failedTasks.length}个**:\n${failedTasks.map(task => `  • ${task}`).join('\n')}`;
          }
          
          toolResult = `${resultMessage}\n\n${formatTodoList(updatedTodos)}`;
        } catch (error) {
          toolResult = `❌ **批量添加失败**: ${error instanceof Error ? error.message : '未知错误'}`;
          is_error = true;
        }
        break;

      case 'query':
        if (!query) {
          toolResult = '❌ **错误**: 缺少查询条件\n\n💡 **正确用法**: `{"operation": "query", "query": {"status": ["pending"], "priority": ["high"]}}` ';
          is_error = true;
          break;
        }

        const queryResults = queryTodos(query, sessionId);
        toolResult = `🔍 **查询结果** (${queryResults.length}项)\n\n${formatTodoList(queryResults)}`;
        break;

      case 'stats':
        const statistics = getTodoStatistics(sessionId);
        toolResult = `📊 **详细统计**\n\n` +
          `**总数**: ${statistics.total}项\n` +
          `**状态分布**:\n` +
          `  • ⏸️ 待处理: ${statistics.byStatus.pending}项\n` +
          `  • 🔄 进行中: ${statistics.byStatus.in_progress}项\n` +
          `  • ✅ 已完成: ${statistics.byStatus.completed}项\n\n` +
          `**优先级分布**:\n` +
          `  • 🔴 高优先级: ${statistics.byPriority.high}项\n` +
          `  • 🟡 中优先级: ${statistics.byPriority.medium}项\n` +
          `  • 🟢 低优先级: ${statistics.byPriority.low}项\n\n` +
          `**时间估算**: ⏱️ 总计${statistics.estimatedTotalHours}小时\n` +
          `**性能指标**: 📈 缓存效率${statistics.cacheEfficiency}% (${statistics.metrics.cacheHits}/${statistics.metrics.totalOperations})`;
        break;

      case 'list':
        const currentTodos = getTodos(sessionId);
        toolResult = formatTodoList(currentTodos);
        break;

      case 'toggle':
        if (!id) {
          toolResult = '❌ **错误**: 缺少任务ID\n\n💡 **正确用法**: `{"operation": "toggle", "id": "任务ID"}` ';
          is_error = true;
          break;
        }

        try {
          const todo = getTodoById(id, sessionId);
          if (!todo) {
            toolResult = `❌ **错误**: 找不到ID为 ${id} 的任务`;
            is_error = true;
            break;
          }

          const newStatus = todo.status === 'completed' ? 'pending' : 
                           todo.status === 'pending' ? 'in_progress' :
                           'completed';

          // 检查是否已有in_progress任务
          if (newStatus === 'in_progress') {
            const inProgressTodos = getTodosByStatus('in_progress', sessionId);
            if (inProgressTodos.length > 0) {
              toolResult = '❌ **错误**: 已有任务在进行中，请先完成当前任务';
              is_error = true;
              break;
            }
          }

          const updatedTodos = updateTodo(id, { status: newStatus }, sessionId);
          
          const statusText = newStatus === 'completed' ? '完成' : 
                            newStatus === 'in_progress' ? '开始进行' : '重置为待处理';
          toolResult = `✅ **任务状态更新**: ${todo.content} → ${statusText}\n\n${formatTodoList(updatedTodos)}`;
        } catch (error) {
          toolResult = `❌ **更新失败**: ${error instanceof Error ? error.message : '未知错误'}`;
          is_error = true;
        }
        break;

      case 'delete':
        if (!id) {
          toolResult = '❌ **错误**: 缺少任务ID\n\n💡 **正确用法**: `{"operation": "delete", "id": "任务ID"}` ';
          is_error = true;
          break;
        }

        try {
          const todo = getTodoById(id, sessionId);
          if (!todo) {
            toolResult = `❌ **错误**: 找不到ID为 ${id} 的任务`;
            is_error = true;
            break;
          }

          const updatedTodos = deleteTodo(id, sessionId);
          toolResult = `✅ **任务删除成功**: ${todo.content}\n\n${formatTodoList(updatedTodos)}`;
        } catch (error) {
          toolResult = `❌ **删除失败**: ${error instanceof Error ? error.message : '未知错误'}`;
          is_error = true;
        }
        break;

      case 'clear':
        const count = getTodos(sessionId).length;
        clearTodos(sessionId);
        toolResult = `✅ **清空完成**: 删除了${count}个任务`;
        break;

      case 'optimize':
        optimizeTodoStorage(sessionId);
        const optimizedTodos = getTodos(sessionId);
        toolResult = `✅ **存储优化完成**\n\n${formatTodoList(optimizedTodos)}`;
        break;

      default:
        toolResult = `❌ **错误**: 不支持的操作 "${operation}"\n\n💡 **支持的操作**:\n` +
          `• \`add\` - 添加单个任务 (支持content, priority, status, tags, estimatedHours)\n` +
          `• \`batch_add\` - 批量添加任务 (支持todos数组)\n` +
          `• \`list\` - 查看列表\n` +
          `• \`toggle\` - 切换状态\n` +
          `• \`delete\` - 删除任务\n` +
          `• \`update\` - 批量更新\n` +
          `• \`query\` - 高级查询 (按状态、优先级、内容、标签筛选)\n` +
          `• \`stats\` - 详细统计信息\n` +
          `• \`clear\` - 清空列表\n` +
          `• \`optimize\` - 优化存储`;
        is_error = true;
    }

  } catch (error) {
    is_error = true;
    toolResult = `❌ 执行出错: ${error instanceof Error ? error.message : '未知错误'}`;
  }

  // 获取最新的todos列表用于返回
  let resultTodos: any[] = [];
  let currentSessionId = 'default';
  try {
    // 从toolArgs中获取sessionId，如果没有则使用default
    currentSessionId = toolArgs?.sessionId || 'default';
    if (!is_error) {
      resultTodos = getTodos(currentSessionId);
    }
  } catch (error) {
    // 忽略获取todos的错误，不影响主要结果
  }

  return {
    content: toolResult,
    is_error,
    todos: resultTodos
  };
}
