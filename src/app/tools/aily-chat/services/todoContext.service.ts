import { 
  getTodos, 
  getTodoContextSummary, 
  getNextTask,
  getTodoStatistics,
  TodoItem 
} from '../utils/todoStorage';

/**
 * TODO上下文服务 - 将任务状态集成到对话上下文中
 * 这是一个独立的服务，展示了todoStorage.ts的复用性
 */
export class TodoContextService {
  
  /**
   * 获取用于对话的TODO上下文摘要
   */
  static getContextForChat(sessionId: string): string {
    return getTodoContextSummary(sessionId);
  }

  /**
   * 获取下一个要处理的任务
   */
  static getNextTaskForUser(sessionId: string): TodoItem | null {
    return getNextTask(sessionId);
  }

  /**
   * 检查是否有紧急任务需要关注
   */
  static hasUrgentTasks(sessionId: string): boolean {
    const todos = getTodos(sessionId);
    return todos.some(todo => 
      todo.priority === 'high' && 
      todo.status !== 'completed'
    );
  }

  /**
   * 获取当前工作状态的简要描述
   */
  static getWorkStatus(sessionId: string): string {
    const todos = getTodos(sessionId);
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const pending = todos.filter(t => t.status === 'pending');
    const highPriority = pending.filter(t => t.priority === 'high');

    if (inProgress.length > 0) {
      return `正在进行: ${inProgress[0].content}`;
    }
    
    if (highPriority.length > 0) {
      return `有${highPriority.length}个高优先级任务等待处理`;
    }
    
    if (pending.length > 0) {
      return `有${pending.length}个任务等待处理`;
    }
    
    return '当前没有待处理任务';
  }

  /**
   * 生成任务进度报告
   */
  static generateProgressReport(sessionId: string): string {
    const stats = getTodoStatistics(sessionId);
    
    if (stats.total === 0) {
      return '📋 当前没有任务记录';
    }

    const completionRate = Math.round((stats.byStatus.completed / stats.total) * 100);
    
    return `📊 任务进度报告:\n` +
           `• 总任务数: ${stats.total}\n` +
           `• 完成率: ${completionRate}%\n` +
           `• 进行中: ${stats.byStatus.in_progress}项\n` +
           `• 待处理: ${stats.byStatus.pending}项\n` +
           `• 高优先级: ${stats.byPriority.high}项`;
  }

  /**
   * 检查用户是否应该被提醒关注TODO
   */
  static shouldRemindUser(sessionId: string): {
    shouldRemind: boolean;
    reason: string;
    suggestion: string;
  } {
    const todos = getTodos(sessionId);
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const highPriorityPending = todos.filter(t => t.priority === 'high' && t.status === 'pending');
    
    // 如果有进行中的任务但用户很久没更新
    if (inProgress.length > 0) {
      const lastUpdate = inProgress[0].updatedAt || 0;
      const hoursSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate > 2) {
        return {
          shouldRemind: true,
          reason: `任务"${inProgress[0].content}"已进行中${Math.round(hoursSinceUpdate)}小时`,
          suggestion: '考虑更新任务状态或将其标记为完成'
        };
      }
    }
    
    // 如果有高优先级任务但没有进行中的任务
    if (highPriorityPending.length > 0 && inProgress.length === 0) {
      return {
        shouldRemind: true,
        reason: `有${highPriorityPending.length}个高优先级任务等待处理`,
        suggestion: '建议开始处理高优先级任务'
      };
    }
    
    return {
      shouldRemind: false,
      reason: '',
      suggestion: ''
    };
  }

  /**
   * 为聊天机器人生成合适的TODO相关回复建议
   */
  static generateChatSuggestions(sessionId: string): string[] {
    const todos = getTodos(sessionId);
    const suggestions: string[] = [];

    if (todos.length === 0) {
      suggestions.push('你可以使用TODO工具来跟踪任务进度');
      return suggestions;
    }

    const inProgress = todos.filter(t => t.status === 'in_progress');
    const pending = todos.filter(t => t.status === 'pending');
    const highPriority = pending.filter(t => t.priority === 'high');

    if (inProgress.length > 0) {
      suggestions.push(`继续处理当前任务: ${inProgress[0].content}`);
    }

    if (highPriority.length > 0) {
      suggestions.push(`处理高优先级任务: ${highPriority[0].content}`);
    }

    if (pending.length > 2) {
      suggestions.push('考虑对任务进行优先级排序');
    }

    return suggestions;
  }
}

/**
 * 导出一些便捷函数供其他模块使用
 */
export const todoContextHelpers = {
  getContextSummary: TodoContextService.getContextForChat,
  getWorkStatus: TodoContextService.getWorkStatus,
  hasUrgentTasks: TodoContextService.hasUrgentTasks,
  generateProgressReport: TodoContextService.generateProgressReport,
};
