import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelDetail } from '../../tools/model-store/model-store.service';
import { SscmaDeployComponent } from './sscma-deploy/sscma-deploy.component';
import { NotificationComponent } from '../../components/notification/notification.component';

/**
 * 模型部署主容器组件
 * 职责：根据模型类型路由到对应的部署子组件
 */
@Component({
  selector: 'app-model-deploy',
  standalone: true,
  imports: [
    CommonModule,
    SscmaDeployComponent,
    NotificationComponent
  ],
  templateUrl: './model-deploy.component.html',
  styleUrl: './model-deploy.component.scss'
})
export class ModelDeployComponent implements OnInit, OnDestroy {
  modelDetail: ModelDetail | null = null;
  initialStep: number = 0;
  deployType: 'sscma' | 'other' = 'sscma';

  constructor() { }

  ngOnInit(): void {
    // 从 localStorage 读取模型数据
    const storedData = localStorage.getItem('current_model_deploy');
    
    if (storedData) {
      try {
        this.modelDetail = JSON.parse(storedData);
        
        // 读取要打开的页面（可选）
        try {
          const pageStr = localStorage.getItem('current_model_deploy_page');
          if (pageStr !== null) {
            const pageNum = parseInt(pageStr, 10);
            if (!isNaN(pageNum)) {
              this.initialStep = pageNum;
            }
            localStorage.removeItem('current_model_deploy_page');
          }
        } catch (e) {
          // ignore
        }
        
        // 根据模型类型确定部署类型
        this.deployType = this.determineDeployType(this.modelDetail);
        
      } catch (error) {
        console.error('解析模型数据失败:', error);
      }
    } else {
      console.warn('未找到模型数据');
    }
  }

  ngOnDestroy(): void {
    // 清理 localStorage
    localStorage.removeItem('current_model_deploy');
  }

  /**
   * 根据模型信息确定部署类型
   */
  private determineDeployType(model: ModelDetail): 'sscma' | 'other' {
    // 根据 author_name 或 uniform_types 判断
    if (model.author_name === 'SenseCraft AI' || 
        model.author_name === 'Seeed Studio') {
      return 'sscma';
    }
    
    // 根据 uniform_types 判断
    if (model.uniform_types?.includes('xiao_esp32s3')) {
      return 'sscma';
    }
    
    // 默认为其他类型
    return 'other';
  }

  /**
   * 处理部署完成事件
   */
  onDeployComplete(): void {
    console.log('部署完成');
  }

  /**
   * 处理部署错误事件
   */
  onDeployError(error: Error): void {
    console.error('部署错误:', error);
  }
}
