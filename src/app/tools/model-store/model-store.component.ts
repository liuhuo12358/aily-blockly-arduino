import { Component } from '@angular/core';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-model-store',
  imports: [
    SubWindowComponent,
    ToolContainerComponent,
    FormsModule,
    CommonModule
  ],
  templateUrl: './model-store.component.html',
  styleUrl: './model-store.component.scss'
})
export class ModelStoreComponent {
  currentUrl;

  constructor(
    private uiService: UiService,
    private router: Router
  ) {

  }

  async ngOnInit() {
    this.currentUrl = this.router.url;

  }

  close() {
    this.uiService.closeTool('model-store');
  }
}
