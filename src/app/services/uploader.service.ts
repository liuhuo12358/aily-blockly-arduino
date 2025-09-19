import { Injectable } from '@angular/core';
import { ActionService } from './action.service';

@Injectable({
  providedIn: 'root'
})
export class UploaderService {

  constructor(
    private actionService: ActionService
  ) { }

  async upload() {
    new Promise<void>((resolve, reject) => {
      this.actionService.dispatch('upload-begin', {}, result => {
        if (result.success) {
          resolve()
        } else {
          reject()
        }
      });
    })
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

