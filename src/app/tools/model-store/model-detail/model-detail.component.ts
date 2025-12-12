import { Component, Input, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { ModelStoreService, ModelDetail } from '../model-store.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { ElectronService } from '../../../services/electron.service';
import { UiService } from '../../../services/ui.service';
import { TranslateModule } from '@ngx-translate/core';
import {
  SupportBoardInfo,
  getSupportedBoards,
  getTaskDescription,
  getModelFormatDescription,
  getPrecisionDescription,
  formatFileSize
} from '../model-constants';


@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [
    CommonModule,
    NzButtonModule,
    NzSpinModule,
    NzSkeletonModule,
    TranslateModule
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
  supportedBoards: SupportBoardInfo[] = [];

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

  // 获取支持的开发板列表
  getSupportedBoards(): SupportBoardInfo[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getSupportedBoards(this.modelDetail.uniform_types);
  }

  // 获取任务类型描述
  getTaskDescription(): string {
    if (!this.modelDetail?.task) return '-';
    return getTaskDescription(this.modelDetail.task);
  }

  // 获取模型格式
  getModelFormat(): string {
    if (!this.modelDetail?.model_format) return '-';
    return getModelFormatDescription(this.modelDetail.model_format);
  }

  // 获取精度描述
  getPrecision(): string {
    if (!this.modelDetail?.precision) return '-';
    return getPrecisionDescription(this.modelDetail.precision);
  }

  // 格式化文件大小
  getFormattedSize(): string {
    if (!this.modelDetail?.model_size) return '-';
    return formatFileSize(this.modelDetail.model_size);
  }

  onDeploy(modelDetail: ModelDetail, page: number = 1): void {
    if (!modelDetail) {
      console.error('模型数据为空，无法部署');
      return;
    }
    
    // 将模型数据存储到 localStorage（用于跨窗口传递）
    localStorage.setItem('current_model_deploy', JSON.stringify(modelDetail));
    // 存储要打开的页面（可选）
    try {
      localStorage.setItem('current_model_deploy_page', String(page));
    } catch (e) {
      // ignore
    }
    
    // 打开部署窗口
    this.uiService.openWindow({
      path: 'model-deploy',
      title: '模型部署 - ' + modelDetail.name,
      alwaysOnTop: true,
      width: 960,
      height: 640
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
