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

  constructor(
    private projectService: ProjectService,
    private electronService: ElectronService,
    private messageService: NzMessageService
  ) {

  }

  reload() {
    this.projectService.projectOpen();
  }

  async clear() {
    try {
      const sketchPath = this.projectService.currentProjectPath+'\\.temp\\sketch\\sketch.ino';
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
      console.error('Clear build folder error:', error);
      this.messageService.error('Clear build folder failed: ' + error.message);
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
