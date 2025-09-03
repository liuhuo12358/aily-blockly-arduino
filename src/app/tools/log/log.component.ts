import { Component, OnDestroy, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Datasource, SizeStrategy, UiScrollModule } from 'ngx-ui-scroll';
import { LogService, LogOptions } from '../../services/log.service';
import { AnsiPipe } from './ansi.pipe';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UiService } from '../../services/ui.service';
import { ProjectService } from '../../services/project.service';
import { ElectronService } from '../../services/electron.service';

@Component({
  selector: 'app-log',
  imports: [CommonModule, AnsiPipe, UiScrollModule],
  templateUrl: './log.component.html',
  styleUrl: './log.component.scss',
})
export class LogComponent implements OnInit, OnDestroy, AfterViewInit {
  private clickTimeout: any;
  private preventSingleClick = false;
  private lastLogCount = 0; // 记录上次的日志数量

  // 虚拟滚动数据源
  datasource;

  // = new Datasource<LogOptions>({
  //   get: (index: number, count: number) => {
  //     console.log(`Datasource get called: index=${index}, count=${count}, total=${this.logService.list.length}`);
  //     const data: LogOptions[] = [];
  //     const startIndex = Math.max(0, index);
  //     const endIndex = Math.min(this.logService.list.length, startIndex + count);

  //     for (let i = startIndex; i < endIndex; i++) {
  //       if (this.logService.list[i]) {
  //         this.logService.list[i]['id'] = i; // 确保每个日志项都有唯一的 ID
  //         data.push(this.logService.list[i]);
  //       }
  //     }

  //     console.log(`Datasource returning ${data.length} items for range [${startIndex}, ${endIndex})`);

  //     return Promise.resolve(data);
  //   },

  //   settings: {
  //     minIndex: 0,
  //     startIndex: 0,
  //     bufferSize: 30, // 减少缓冲区大小，降低内存使用
  //     padding: 0.3, // 适中的 padding 值
  //     sizeStrategy: SizeStrategy.Frequent
  //   }
  // });

  get logList() {
    return this.logService.list;
  }

  constructor(
    private logService: LogService,
    private message: NzMessageService,
    private uiService: UiService,
    private projectService: ProjectService,
    private electronService: ElectronService
  ) { }

  ngOnInit() {
    this.datasource = new Datasource<LogOptions>({
      get: (index: number, count: number) => {
        console.log(`Datasource get called: index=${index}, count=${count}, total=${this.logService.list.length}`);
        const data: LogOptions[] = [];
        const startIndex = Math.max(0, index);
        const endIndex = Math.min(this.logService.list.length, startIndex + count);

        for (let i = startIndex; i < endIndex; i++) {
          if (this.logService.list[i]) {
            this.logService.list[i]['id'] = i; // 确保每个日志项都有唯一的 ID
            data.push(this.logService.list[i]);
          }
        }

        console.log(`Datasource returning ${data.length} items for range [${startIndex}, ${endIndex})`);

        return Promise.resolve(data);
      },

      settings: {
        minIndex: 0,
        startIndex: this.logService.list.length - 1, // 默认滚动到最后一行
        bufferSize: 30, // 减少缓冲区大小，降低内存使用
        padding: 0.3, // 适中的 padding 值
        sizeStrategy: SizeStrategy.Frequent
      }
    });
  }

  ngAfterViewInit() {
    // 监听日志更新
    this.logService.stateSubject.subscribe((opts) => {
      this.handleLogUpdate();
    });
    // setTimeout(() => this.scrollToBottom(), 100);
  }

  private scrollToBottom() {
    if (this.logService.list.length > 0) {
      const startIndex = this.logService.list.length - 1;
      console.log('Scrolling to index:', startIndex);
      const settings = {
        startIndex: startIndex,
        bufferSize: 30
      };
      this.datasource.adapter.reset({ settings });

      // this.datasource.adapter.fix({
      //   scrollToItem: ({ data }) => data.id === startIndex,
      //   scrollToItemOpt: false
      // });
      // console.log('Loading from startIndex:', startIndex);

      // const reloadPromise = this.datasource.adapter.reload(startIndex);
      // if (reloadPromise && typeof reloadPromise.then === 'function') {
      //   reloadPromise.then(() => {
      //     console.log('Datasource reloaded successfully');
      //     setTimeout(() => {
      //       this.forceScrollToBottom();
      //     }, 50);
      //   });
      // } else {
      //   console.log('Datasource reload returned no promise');
      //   setTimeout(() => {
      //     this.forceScrollToBottom();
      //   }, 50);
      // }
    }
  }

  // 处理日志更新的新方法
  private handleLogUpdate() {
    const currentLogCount = this.logService.list.length;

    // 如果日志被清空
    if (currentLogCount === 0 && this.lastLogCount > 0) {
      this.lastLogCount = 0;
      if (this.datasource.adapter) {
        this.datasource.adapter.reload(0);
      }
      return;
    }

    // 如果有新增日志
    if (currentLogCount > this.lastLogCount) {
      const newItemsCount = currentLogCount - this.lastLogCount;
      this.lastLogCount = currentLogCount;

      // 对于新增日志，我们需要确保数据源能够获取到新数据
      if (this.datasource.adapter) {
        // 检查用户是否在底部附近
        const viewport = document.querySelector('.log-box');
        const shouldScrollToBottom = viewport ?
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100 : true;

        // 使用更轻量的方式更新，但确保数据源能获取到新数据
        // 由于 ngx-ui-scroll 的数据获取机制，我们仍需要刷新数据源
        const currentFirstVisible = this.datasource.adapter.firstVisible?.$index || 0;
        const currentLastVisible = this.datasource.adapter.lastVisible?.$index || 0;

        // 如果当前可见区域接近数据末尾，需要重新加载以显示新数据
        if (currentLastVisible >= this.lastLogCount - newItemsCount - 10) {
          // 保持当前视图位置，只是扩展数据范围
          const startIndex = Math.max(0, currentLogCount - 100);
          this.datasource.adapter.reload(startIndex).then(() => {
            if (shouldScrollToBottom) {
              setTimeout(() => this.forceScrollToBottom(), 10);
            }
          });
        } else {
          // 如果用户不在底部，只需要让adapter知道数据已更新
          this.datasource.adapter.check();
        }
      }
    } else {
      // 更新现有数据的情况
      this.lastLogCount = currentLogCount;
      if (this.datasource.adapter) {
        this.datasource.adapter.check();
      }
    }
  }

  // 智能滚动到底部（只有在用户接近底部时才滚动）
  private smartScrollToBottom() {
    const viewport = document.querySelector('.log-box');
    if (viewport) {
      const scrollTop = viewport.scrollTop;
      const scrollHeight = viewport.scrollHeight;
      const clientHeight = viewport.clientHeight;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100; // 距离底部不到100px

      if (isNearBottom) {
        this.forceScrollToBottom();
      }
    }
  }

  reloadDatasource() {
    // 这个方法现在主要用于强制完全重新加载的场景（比如手动清空后重新加载）
    if (this.datasource.adapter && this.logService.list.length > 0) {
      // 从合理的范围开始加载，避免空白屏幕
      const startIndex = Math.max(0, this.logService.list.length - 50); // 显示最后50项

      const reloadPromise = this.datasource.adapter.reload(startIndex);
      if (reloadPromise && typeof reloadPromise.then === 'function') {
        reloadPromise.then(() => {
          // 重新加载后直接使用原生滚动
          setTimeout(() => {
            this.forceScrollToBottom();
          }, 50); // 减少延迟时间
        });
      } else {
        // 如果 reload() 没有返回 Promise，直接滚动到底部
        setTimeout(() => {
          this.forceScrollToBottom();
        }, 50);
      }
    } else if (this.logService.list.length === 0) {
      // 如果没有数据，重置到起始位置
      if (this.datasource.adapter) {
        this.datasource.adapter.reload(0);
      }
    }
  }

  clear() {
    this.logService.clear();
    this.lastLogCount = 0; // 重置日志计数
    if (this.datasource.adapter) {
      this.datasource.adapter.reload(0);
    }
  }

  ngOnDestroy() {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }
    this.lastLogCount = 0;
  }

  // 处理点击事件，区分单击和双击
  handleClick(item: any, event: MouseEvent) {
    console.log('单击事件:', item);

    this.clickTimeout = setTimeout(() => {
      if (!this.preventSingleClick) {
        this.copyLogItemToClipboard(item);
      }
      this.preventSingleClick = false;
    }, 250);
  }

  // 处理双击事件
  handleDoubleClick(item: any, event: MouseEvent) {
    this.preventSingleClick = true;
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }
    this.copyLogItemToChat(item);
  }

  // 单击复制日志内容到剪切板
  async copyLogItemToClipboard(item: any) {
    try {
      const logContent = `${item.detail}`;
      await navigator.clipboard.writeText(logContent);
      this.message.success('日志内容已复制到剪切板');
    } catch (err) {
      console.error('复制到剪切板失败:', err);
    }
  }

  // 双击打开AI助手并发送日志内容
  async copyLogItemToChat(item: any) {
    // 这里可以实现将日志内容发送到AI助手的逻辑
    // 例如，调用一个服务方法来处理这个操作
    this.uiService.openTool("aily-chat");
    setTimeout(() => {
      window.sendToAilyChat(`运行日志：\n${item.detail}`, {
        sender: 'LogComponent',
        type: 'log'
      });
    }, 100);
    this.message.info('日志内容已发送到AI助手');
  }

  private forceScrollToBottom(): void {
    // 使用 requestAnimationFrame 确保在下一个渲染周期执行
    requestAnimationFrame(() => {
      const viewport = document.querySelector('.log-box');
      if (viewport) {
        // 使用 smooth 滚动，减少视觉冲击
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'auto' // 对于日志可以使用 instant 滚动
        });
      }
    });
  }

  async exportData() {
    if (this.logService.list.length === 0) {
      this.message.warning('没有日志数据可以导出');
      return;
    }

    // 弹出保存对话框
    const folderPath = await window['ipcRenderer'].invoke('select-folder-saveAs', {
      title: '导出日志数据',
      path: this.projectService.currentProjectPath,
      suggestedName: 'log_' + new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(/[/,:]/g, '_').replace(/\s/g, '_') + '.txt',
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!folderPath) {
      return;
    }

    // 准备要写入的内容
    let fileContent = '';

    for (const item of this.logService.list) {
      const timeString = new Date(item.timestamp).toLocaleTimeString();
      fileContent += `[${timeString}] ${item.detail || ''}\n`;
    }

    // 写入文件
    this.electronService.writeFile(folderPath, fileContent);
    this.message.success('日志数据已成功导出到' + folderPath);
  }


}
