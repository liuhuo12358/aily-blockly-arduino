import { Component, Input, OnInit, OnDestroy, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AilyThinkData {
  type: 'aily-think';
  content?: string;
  isComplete?: boolean;
  metadata?: any;
  raw?: string;
}

@Component({
  selector: 'app-aily-think-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aily-think-viewer.component.html',
  styleUrls: ['./aily-think-viewer.component.scss']
})
export class AilyThinkViewerComponent implements OnInit, OnDestroy {
  @Input() data: AilyThinkData | null = null;
  
  @HostBinding('class.expanded') 
  isExpanded = false;
  thinkContent = '';
  isComplete = false;

  ngOnInit() {
    this.processData();
  }

  ngOnDestroy() {
    // 清理资源
  }

  /**
   * 设置组件数据（由指令调用）
   */
  setData(data: AilyThinkData | string): void {
    // 如果是字符串，尝试解析为 JSON
    if (typeof data === 'string') {
      try {
        this.data = JSON.parse(data);
      } catch {
        // 解析失败，当作纯文本内容
        this.data = { type: 'aily-think', content: data, isComplete: true };
      }
    } else {
      this.data = data;
    }
    this.processData();
  }

  /**
   * 处理数据
   */
  processData(): void {
    if (!this.data) {
      return;
    }

    // 提取内容
    this.thinkContent = this.data.content || this.data.raw || '';
    
    // 检查是否完成，undefined 视为完成
    this.isComplete = this.data.isComplete === true || this.data.isComplete === undefined;
    
    // 如果正在思考中，默认展开
    if (!this.isComplete) {
      this.isExpanded = true;
    }
  }

  /**
   * 切换展开/折叠状态
   */
  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
  }

  /**
   * 获取标题文本
   */
  getTitle(): string {
    return this.isComplete ? ' Think' : ' Thinking...';
  }
}
