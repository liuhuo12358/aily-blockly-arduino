import { Injectable } from '@angular/core';
import { BlocklyService } from './blockly.service';
import { ActionService } from '../../../services/action.service';

@Injectable({
  providedIn: 'root'
})
export class _ProjectService {

  currentProjectPath;

  constructor(
    private blocklyService: BlocklyService,
    private actionService: ActionService
  ) { }

  init() {
    this.actionService.listen('project-save', (action) => {
      this.save(action.payload.path);
    });
    this.actionService.listen('project-check-unsaved', (action) => {
      let result = this.hasUnsavedChanges();
      return { hasUnsavedChanges: result };
    });
  }

  close() {

  }

  hasUnsavedChanges(): boolean {
    try {
      // 获取当前工作区的 JSON 数据
      const currentWorkspaceJson = this.blocklyService.getWorkspaceJson();

      // 读取并解析已保存的 JSON 数据
      const savedJsonStr = window['fs'].readFileSync(`${this.currentProjectPath}/project.abi`, 'utf8');
      const savedJson = JSON.parse(savedJsonStr);

      // 将当前工作区 JSON 和保存的 JSON 转为字符串进行比较
      const currentJsonStr = JSON.stringify(currentWorkspaceJson);
      const normalizedSavedJsonStr = JSON.stringify(savedJson);

      // 比较两个 JSON 字符串是否相同
      return currentJsonStr !== normalizedSavedJsonStr;
    } catch (error) {
      console.error('检查未保存更改时出错:', error);
      // 出错时，保守地返回 true，表示可能有未保存的更改
      return true;
    }
  }

  save(path: string) {
    const jsonData = this.blocklyService.getWorkspaceJson();
    window['fs'].writeFileSync(`${path}/project.abi`, JSON.stringify(jsonData, null, 2));
    // this.stateSubject.next('saved');
  }
}
