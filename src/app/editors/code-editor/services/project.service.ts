import { Injectable } from '@angular/core';
import { ActionService } from '../../../services/action.service';

@Injectable({
  providedIn: 'root'
})
export class _ProjectService {

  constructor(
    private actionService: ActionService
  ) { }

  init() {
    this.actionService.listen('saveProject', data => {
      this.save(data.payload.path);
    });
    this.actionService.listen('project-check-unsaved', (action) => {
      let result = this.hasUnsavedChanges();
      return { hasUnsavedChanges: result };
    });
  }


  save(path: string) {

  }


  hasUnsavedChanges(): boolean {

  }
}
