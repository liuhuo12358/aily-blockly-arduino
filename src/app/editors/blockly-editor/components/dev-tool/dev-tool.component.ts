import { Component } from '@angular/core';
import { ProjectService } from '../../../../services/project.service';
import { ElectronService } from '../../../../services/electron.service';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-dev-tool',
  imports: [],
  templateUrl: './dev-tool.component.html',
  styleUrl: './dev-tool.component.scss'
})
export class DevToolComponent {
  // 拖拽相关属性
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  currentX = 185; // 初始 left 值
  currentY = 1; // 初始 bottom 值
  offsetX = 0;
  offsetY = 0;

  constructor(
    private projectService: ProjectService,
    private electronService: ElectronService,
    private messageService: NzMessageService
  ) {

  }

  onDragStart(event: MouseEvent) {
    this.isDragging = true;
    this.dragStartX = event.clientX - this.currentX;
    this.dragStartY = event.clientY;
    this.offsetY = window.innerHeight - this.currentY; // 计算从顶部的偏移
    
    // 添加全局事件监听
    document.addEventListener('mousemove', this.onDrag);
    document.addEventListener('mouseup', this.onDragEnd);
    
    event.preventDefault();
  }

  onDrag = (event: MouseEvent) => {
    if (!this.isDragging) return;
    
    // 计算新位置
    this.currentX = event.clientX - this.dragStartX;
    this.currentY = window.innerHeight - event.clientY + (this.dragStartY - this.offsetY);
    
    // 限制在可视区域内
    const topExclusionZone = 70; // 顶部禁用区域高度
    const componentHeight = 40; // 假设组件高度约40px
    const componentWidth = 260; // 假设组件宽度约260px

    const maxX = window.innerWidth - componentWidth;
    const minY = 1; // 最小bottom值
    const maxY = window.innerHeight - topExclusionZone - componentHeight; // 不能进入顶部40px区域
    
    this.currentX = Math.max(0, Math.min(this.currentX, maxX));
    this.currentY = Math.max(minY, Math.min(this.currentY, maxY));
  }

  onDragEnd = () => {
    this.isDragging = false;
    
    // 移除全局事件监听
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.onDragEnd);
  }

  ngOnDestroy() {
    // 清理事件监听器
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.onDragEnd);
  }

  reload() {
    this.projectService.projectOpen();
  }

  async clear() {
    try {
      const pt = window['platform'].pt;
      // const sketchPath = this.projectService.currentProjectPath + pt + '.temp' + pt + 'sketch' + pt + 'sketch.ino';
      const sketchPath = window['path'].join(
        this.projectService.currentProjectPath,
        '.temp',
        'sketch',
        'sketch.ino'
      );
      const sketchName = window['path'].basename(sketchPath, '.ino');
      
      // 为了避免不同项目的同名sketch冲突,使用项目路径的MD5哈希值
      const projectPathMD5 = (await window['tools'].calculateMD5(sketchPath)).substring(0, 8); // 只取前8位MD5值
      const uniqueSketchName = `${sketchName}_${projectPathMD5}`;
      
      // 使用统一的构建路径获取方法
      const defaultBuildPath = window['path'].join(
        window['path'].getAilyBuilderBuildPath(),
        uniqueSketchName
      );

      // console.log(defaultBuildPath);
      // 检查目录是否存在
      if (!window['fs'].existsSync(defaultBuildPath)) {
        this.messageService.info('Build folder does not exist');
        return;
      }

      // 删除buildPath目录
      this.electronService.deleteDir(defaultBuildPath);
      this.messageService.success('Clear build folder success');
    } catch (error) {
      if (error.message && error.message.includes('EBUSY')) {
        console.warn('Clear build folder failed: Folder is busy');
        this.messageService.warning('Clear build folder failed: Folder is busy, wait a moment and try again.');
      } else {
        console.error('Clear build folder error:', error);
        this.messageService.error('Clear build folder failed: ' + error.message);
      }
    }
  }

  openWebDevTools() {
    // 打开开发者工具
    window['ipcRenderer'].send('open-dev-tools');
  }

  help() {

  }

  close() {

  }
}
