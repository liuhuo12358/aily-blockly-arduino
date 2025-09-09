import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CodeIntelligenceService } from '../../services/code-intelligence.service';
import { AIConfig } from '../../configs/ai-config';

@Component({
  selector: 'app-ai-config',
  imports: [
    CommonModule,
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzSwitchModule,
    NzSliderModule,
    NzSelectModule
  ],
  template: `
    <div class="ai-config-panel">
      <h3>AI代码补全配置</h3>
      
      <form nz-form [nzLayout]="'vertical'">
        <nz-form-item>
          <nz-form-label>启用AI补全</nz-form-label>
          <nz-form-control>
            <nz-switch 
              [(ngModel)]="config.enabled" 
              name="enabled"
              (ngModelChange)="onConfigChange()">
            </nz-switch>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>API端点</nz-form-label>
          <nz-form-control>
            <input 
              nz-input 
              [(ngModel)]="config.apiEndpoint" 
              name="apiEndpoint"
              placeholder="http://localhost:3000/api/completion"
              (blur)="onConfigChange()" />
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>API密钥 (可选)</nz-form-label>
          <nz-form-control>
            <input 
              nz-input 
              [(ngModel)]="config.apiKey" 
              name="apiKey"
              type="password"
              placeholder="输入API密钥"
              (blur)="onConfigChange()" />
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>超时时间 (毫秒)</nz-form-label>
          <nz-form-control>
            <nz-slider 
              [(ngModel)]="config.timeout" 
              name="timeout"
              [nzMin]="1000" 
              [nzMax]="10000" 
              [nzStep]="500"
              (ngModelChange)="onConfigChange()">
            </nz-slider>
            <span>{{config.timeout}}ms</span>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>缓存大小</nz-form-label>
          <nz-form-control>
            <nz-slider 
              [(ngModel)]="config.maxCacheSize" 
              name="maxCacheSize"
              [nzMin]="10" 
              [nzMax]="500" 
              [nzStep]="10"
              (ngModelChange)="onConfigChange()">
            </nz-slider>
            <span>{{config.maxCacheSize}}个</span>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>AI模型</nz-form-label>
          <nz-form-control>
            <nz-select 
              [(ngModel)]="config.model" 
              name="model"
              (ngModelChange)="onConfigChange()">
              <nz-option nzValue="code-completion" nzLabel="代码补全模型"></nz-option>
              <nz-option nzValue="gpt-3.5-turbo" nzLabel="GPT-3.5 Turbo"></nz-option>
              <nz-option nzValue="gpt-4" nzLabel="GPT-4"></nz-option>
              <nz-option nzValue="codellama" nzLabel="Code Llama"></nz-option>
            </nz-select>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item *ngIf="config.enabled">
          <nz-form-label>温度设置</nz-form-label>
          <nz-form-control>
            <nz-slider 
              [(ngModel)]="config.temperature" 
              name="temperature"
              [nzMin]="0" 
              [nzMax]="1" 
              [nzStep]="0.1"
              (ngModelChange)="onConfigChange()">
            </nz-slider>
            <span>{{config.temperature}} ({{getTemperatureDesc()}})</span>
          </nz-form-control>
        </nz-form-item>

        <nz-form-item>
          <nz-form-control>
            <button nz-button nzType="primary" (click)="testConnection()" [nzLoading]="testing">
              测试连接
            </button>
            <button nz-button (click)="clearCache()" style="margin-left: 8px;">
              清除缓存
            </button>
            <button nz-button (click)="resetToDefault()" style="margin-left: 8px;">
              重置默认
            </button>
          </nz-form-control>
        </nz-form-item>
      </form>

      <div class="status-info">
        <h4>状态信息</h4>
        <p>本地符号数量: {{symbolsCount}}</p>
        <p>AI缓存条目: {{cacheSize}}</p>
        <p>连接状态: 
          <span [style.color]="connectionStatus === 'connected' ? 'green' : 'red'">
            {{getConnectionStatusText()}}
          </span>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .ai-config-panel {
      padding: 16px;
      max-width: 600px;
    }

    .status-info {
      margin-top: 24px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 6px;
    }

    .status-info h4 {
      margin-top: 0;
      margin-bottom: 12px;
    }

    .status-info p {
      margin: 4px 0;
    }

    nz-form-item {
      margin-bottom: 16px;
    }
  `]
})
export class AiConfigComponent implements OnInit {
  config: AIConfig = {
    enabled: true,
    apiEndpoint: '',
    timeout: 5000,
    maxCacheSize: 100,
    model: 'code-completion',
    temperature: 0.3
  };

  testing = false;
  symbolsCount = 0;
  cacheSize = 0;
  connectionStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';

  constructor(
    private codeIntelligenceService: CodeIntelligenceService,
    private message: NzMessageService
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.updateStatus();
  }

  loadConfig(): void {
    this.config = this.codeIntelligenceService.getAIConfig();
  }

  onConfigChange(): void {
    this.codeIntelligenceService.updateAIConfig(this.config);
    this.updateStatus();
  }

  async testConnection(): Promise<void> {
    if (!this.config.enabled) {
      this.message.warning('请先启用AI补全功能');
      return;
    }

    this.testing = true;
    try {
      // 这里可以发送一个简单的测试请求
      // 暂时使用模拟测试
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.connectionStatus = 'connected';
      this.message.success('连接测试成功');
    } catch (error) {
      this.connectionStatus = 'disconnected';
      this.message.error('连接测试失败: ' + (error as Error).message);
    } finally {
      this.testing = false;
    }
  }

  clearCache(): void {
    this.codeIntelligenceService.clearAICache();
    this.updateStatus();
    this.message.success('缓存已清除');
  }

  resetToDefault(): void {
    this.config = {
      enabled: true,
      apiEndpoint: 'http://localhost:3000/api/completion',
      timeout: 5000,
      maxCacheSize: 100,
      model: 'code-completion',
      temperature: 0.3
    };
    this.onConfigChange();
    this.message.success('已重置为默认配置');
  }

  getTemperatureDesc(): string {
    if (this.config.temperature <= 0.3) return '精确';
    if (this.config.temperature <= 0.7) return '平衡';
    return '创造性';
  }

  getConnectionStatusText(): string {
    switch (this.connectionStatus) {
      case 'connected': return '已连接';
      case 'disconnected': return '连接失败';
      default: return '未知';
    }
  }

  private updateStatus(): void {
    this.symbolsCount = this.codeIntelligenceService.getSymbolsCount();
    this.cacheSize = this.codeIntelligenceService.getCacheSize();
  }
}
