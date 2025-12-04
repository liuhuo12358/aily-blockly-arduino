import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { ModelDetail } from '../../tools/model-store/model-store.service';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  getDeployStepConfig,
  DeployStepConfig,
  getSupportedBoards,
  getTaskDescription,
  getModelFormatDescription,
  getPrecisionDescription,
  formatFileSize,
  getDeployTitle,
  getAuthorLogo,
  getDeviceConnectionImage,
  getDeviceConnectionSteps
} from '../../tools/model-store/model-constants';

@Component({
  selector: 'app-model-deploy',
  imports: [
    CommonModule,
    SubWindowComponent,
    TranslateModule,
    NzStepsModule,
    NzButtonModule
  ],
  templateUrl: './model-deploy.component.html',
  styleUrl: './model-deploy.component.scss'
})
export class ModelDeployComponent implements OnInit, OnDestroy {
  @Input() modelDetail: ModelDetail | null = null;
  
  deployStepConfig: DeployStepConfig | null = null;
  currentStep = 1;

  constructor(private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
    // 从 localStorage 读取模型数据（使用固定 key）
    const storedData = localStorage.getItem('current_model_deploy');
    
    if (storedData) {
      try {
        this.modelDetail = JSON.parse(storedData);
        console.log('模型数据加载成功:', this.modelDetail.name);
        
        // 根据作者名称配置部署步骤
        if (this.modelDetail?.author_name) {
          this.deployStepConfig = getDeployStepConfig(this.modelDetail.author_name);
        }
      } catch (error) {
        console.error('解析模型数据失败:', error);
      }
    } else {
      console.warn('未找到模型数据');
    }
  }
  
  ngOnDestroy(): void {
    // 清理 localStorage 中的临时数据
    const storageKey = 'current_model_deploy';
    localStorage.removeItem(storageKey);
    console.log('🗑️ 已清理 localStorage 数据:', storageKey);
  }

  // 获取支持的开发板列表
  getSupportedBoards(): string[] {
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

  // 获取安全的 HTML 内容
  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.sanitize(1, html) || '';
  }

  getDeployTitle(): string {
    if (!this.modelDetail?.author_name) return 'AI Model Store';
    return getDeployTitle(this.modelDetail.author_name) || 'AI Model Store';
  }

  // 获取作者 Logo
  getAuthorLogo(): string | null {
    if (!this.modelDetail?.author_name) return null;
    return getAuthorLogo(this.modelDetail.author_name);
  }

  // 获取设备连接图片
  getDeviceConnectionImage(): string | null {
    if (!this.modelDetail?.uniform_types) return null;
    return getDeviceConnectionImage(this.modelDetail.uniform_types);
  }

  // 获取设备连接步骤
  getDeviceConnectionSteps(): string[] {
    if (!this.modelDetail?.uniform_types) return [];
    return getDeviceConnectionSteps(this.modelDetail.uniform_types) || [];
  }

  nextStep(){
    if (this.modelDetail?.author_name === 'SenseCraft AI') {
      if (this.currentStep === 1) {
        console.log('部署下载步骤，阻止跳转到下一步');
        return; // 阻止从步骤2到步骤3的跳转
      }
    }
    this.currentStep += 1;
  }
  
  prevStep(){
    if (this.currentStep > 0) {
      this.currentStep -= 1;
    }
  }
}
