import { Injectable } from '@angular/core';
import { ActionService } from './action.service';
import { ElectronService } from './electron.service';

@Injectable({
  providedIn: 'root'
})
export class UploaderService {

  constructor(
    private actionService: ActionService,
    private electronService: ElectronService
  ) { }

  async upload() {
    try {
      const result = await this.actionService.dispatchWithFeedback('upload-begin', {}, 300000).toPromise();
      if (!this.electronService.isWindowFocused()) {
        this.electronService.notify('上传', result.data?.result?.text || '');
      }
      return result.data?.result;
    } catch (error) {
      if (!this.electronService.isWindowFocused()) {
        this.electronService.notify('上传', '上传失败');
      }
      throw error;
    }
  }

  /**
  * 取消当前编译过程
  */
  cancel() {
    this.actionService.dispatch('upload-cancel', {}, result => {
      if (result.success) {
      } else {
      }
    });
  }
}

