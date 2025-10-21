import { Component, inject } from '@angular/core';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BaseDialogComponent, DialogButton } from '../base-dialog/base-dialog.component';
import { FeedbackService } from '../../services/feedback.service';
import { ElectronService } from '../../services/electron.service';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { ProjectService } from '../../services/project.service';
import { LogService } from '../../services/log.service';

import { version } from '../../../../package.json';

@Component({
  selector: 'app-feedback-dialog',
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzInputModule,
    NzSelectModule,
    NzRadioModule,
    BaseDialogComponent
  ],
  templateUrl: './feedback-dialog.component.html',
  styleUrl: './feedback-dialog.component.scss'
})
export class FeedbackDialogComponent {
  readonly modal = inject(NzModalRef);

  // 反馈类型
  feedbackType: string = 'bug';

  feedbackTypes = [
    { label: 'Bug反馈', value: 'bug' },
    { label: '编译/上传问题', value: 'build&upload' },
    { label: '其他问题', value: 'other' },
    { label: '功能建议', value: 'feature' },
  ];

  projectData = [

  ];

  // 表单数据
  feedbackTitle: string = '';
  feedbackContent: string = '';
  contactInfo: string = '';

  // 提交状态
  isSubmitting: boolean = false;

  email: string = '';

  // 配置对话框按钮
  buttons: DialogButton[] = [
    // {
    //   text: '取消',
    //   type: 'default',
    //   action: 'cancel'
    // },
    {
      text: '提交',
      type: 'primary',
      action: 'submit'
    }
  ];

  constructor(
    private message: NzMessageService,
    private feedbackService: FeedbackService,
    private electronService: ElectronService,
    private projectService: ProjectService,
    private logService: LogService
  ) { }

  ngOnInit(): void {
  }

  onCloseDialog(): void {
    this.modal.close({ result: 'cancel' });
  }

  onButtonClick(action: string): void {
    if (action === 'cancel') {
      this.modal.close({ result: 'cancel' });
    } else if (action === 'submit') {
      this.submitFeedback();
    }
  }

  // 获取基本信息
  async getBasicInfo(): Promise<string> {
    const currentPackageJson = await this.projectService.getPackageJson();
    const dependencies = currentPackageJson?.dependencies || {};

    // 如果有依赖项,添加缩进使其在代码块中正确显示
    const dependenciesStr = dependencies && Object.keys(dependencies).length > 0
      ? JSON.stringify(dependencies, null, 2).split('\n').map(line => `  ${line}`).join('\n')
      : "  无";

    return `
**Basic Information/基本信息**
- Operation System Version: ${window['platform'].type}
- Aily Blockly Version: ${version}
- Project Package Json/项目依赖包:
\`\`\`json
${dependenciesStr}
\`\`\`
    `;
  }

  // 获取错误日志
  getErrorLogs(): string {
    // 获取最近十条错误日志
    const errorLogs = this.logService.list
      .filter(log => log.state === 'error')
      .sort((a, b) => b.timestamp! - a.timestamp!)
      .slice(0, 10);
    
    const errorLogsStr = errorLogs.length > 0
      ? errorLogs.map(log => `  - [${log.timestamp}] ${log.detail}`).join('\n')
      : "  无";

    return `
**Error Logs or Bug Descriptions/报错日志内容或者问题描述**
- Error Logs(报错日志):

\`\`\`plaintext
${errorLogsStr}
\`\`\`
    `;
  }

  // 问题描述
  getIssueDescription(): string {
    const descriptionStr = this.feedbackContent
      ? this.feedbackContent.split('\n').map(line => `  ${line}`).join('\n')
      : "  无";

    return `
- Bug Descriptions(问题描述):

\`\`\`plaintext
${descriptionStr}
\`\`\`
    `;
  }

  // 功能建议
  getFeatureSuggestion(): string {
    const descriptionStr = this.feedbackContent
      ? this.feedbackContent.split('\n').map(line => `  ${line}`).join('\n')
      : "  无";

    return `
**Feature Suggestions(功能建议)**
\`\`\`plaintext
${descriptionStr}
\`\`\`
    `;
  }

  // 提交反馈
  async submitFeedback(): Promise<void> {
    // 验证反馈内容
    if (!this.feedbackContent || this.feedbackContent.trim() === '') {
      this.message.warning('请输入反馈内容');
      return;
    }

    if (!this.feedbackTitle || this.feedbackTitle.trim() === '') {
      this.message.warning('请输入反馈标题');
      return;
    }

    if (this.feedbackContent.trim().length < 10) {
      this.message.warning('反馈内容至少需要10个字符');
      return;
    }

    this.isSubmitting = true;

    // 更新按钮状态
    this.buttons = this.buttons.map(btn => ({
      ...btn,
      disabled: btn.action === 'cancel',
      loading: btn.action === 'submit'
    }));

    let basicInfo = '';
    let errorLogs = '';
    let content = '';

    if (this.feedbackType != 'feature') {
      // 获取基本信息
      basicInfo = await this.getBasicInfo();
      // 获取错误日志
      errorLogs = this.getErrorLogs();

      // 获取问题描述
      const issueDescription = this.getIssueDescription();
      content = basicInfo + '\n' + errorLogs + '\n' + issueDescription;
    } else {
      // 获取功能建议内容
      const featureSuggestion = this.getFeatureSuggestion();
      content = featureSuggestion;
    }

    try {
      // 构建反馈数据
      const feedbackData = {
        label: this.feedbackType,
        title: this.feedbackTitle.trim(),
        content: content,
        contact: this.contactInfo.trim(),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        email: this.email.trim()
      };

      this.feedbackService.submitFeedback(feedbackData).subscribe(res => {
        this.message.success('感谢您的反馈！');
        this.modal.close({ result: 'success', data: feedbackData });
        this.isSubmitting = false;
        // 恢复按钮状态
        this.buttons = this.buttons.map(btn => ({
          ...btn,
          disabled: false,
          loading: false
        }));
      }, err => {
        console.warn('提交反馈失败:', err);
        this.message.error('提交失败，请稍后重试');
        this.isSubmitting = false;
        // 恢复按钮状态
        this.buttons = this.buttons.map(btn => ({
          ...btn,
          disabled: false,
          loading: false
        }));
      });
    } catch (error) {
      console.warn('提交反馈失败:', error);
      this.message.error('提交失败，请稍后重试');
      this.isSubmitting = false;
      // 恢复按钮状态
      this.buttons = this.buttons.map(btn => ({
        ...btn,
        disabled: false,
        loading: false
      }));
    }
  }

  openUrl() {
    this.electronService.openUrl('https://github.com/ailyProject/aily-blockly/issues');
  }
}
