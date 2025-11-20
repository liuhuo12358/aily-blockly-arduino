import { Component, Input, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { ModelStoreService, ModelDetail } from '../model-store.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { ElectronService } from '../../../services/electron.service';
import { UiService } from '../../../services/ui.service';


@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [
    CommonModule,
    NzButtonModule,
    NzSpinModule,
    NzSkeletonModule
  ],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.scss'
})
export class ModelDetailComponent implements OnInit {
  @Input() id: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() deploy = new EventEmitter<ModelDetail>();

  private modelStoreService = inject(ModelStoreService);
  private sanitizer = inject(DomSanitizer);

  modelDetail: ModelDetail | null = null;

  constructor(
    private electronService: ElectronService,
    private uiService: UiService
  ) { }

  ngOnInit(): void {
    if (this.id) {
      this.loadModelDetail();
    }
  }

  loadModelDetail(): void {
    this.modelStoreService.getModelDetail(this.id).subscribe({
      next: (data) => {
        this.modelDetail = data;
      },
      error: (error) => {
        console.error('加载模型详情失败:', error);
      }
    });
  }

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.sanitize(1, html) || '';
  }

  onDeploy(modelDetail): void {
    this.uiService.openWindow({
      path: 'model-deploy',
      title: '模型部署',
      alwaysOnTop: true,
      width: 1200,
      height: 640
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
