import { Injectable } from '@angular/core';
import { ActionService } from './action.service';

@Injectable({
  providedIn: 'root'
})
export class UploaderService {

  constructor(
    private actionService: ActionService
  ) { }

  cancelled = false;

  async upload() {
    this.actionService.dispatch('upload-begin', {}, result => {
      if (result.success) {
        // this.stateSubject.next('saved');
      } else {
        // console.warn('项目保存失败:', result.error);
      }
    });
  }

  /**
  * 取消当前编译过程
  */
  cancel() {
    this.actionService.dispatch('upload-cancel', {}, result => {
      if (result.success) {
        this.cancelled = true;
      } else {
        // console.warn('项目保存失败:', result.error);
      }
    });
    this.cancelled = true;
  }
}

