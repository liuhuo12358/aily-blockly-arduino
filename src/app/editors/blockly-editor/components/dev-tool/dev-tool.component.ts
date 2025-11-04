import { Component } from '@angular/core';
import { ProjectService } from '../../../../services/project.service';

@Component({
  selector: 'app-dev-tool',
  imports: [],
  templateUrl: './dev-tool.component.html',
  styleUrl: './dev-tool.component.scss'
})
export class DevToolComponent {

  constructor(
    private projectService: ProjectService
  ) {

  }

  reload() {
    this.projectService.projectOpen();
  }

  clear() {

  }

  openWebDevTools() {

  }

  help() {

  }

  close() {

  }
}
