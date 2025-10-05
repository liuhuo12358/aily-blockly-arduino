/**
 * CloudService getProjectArchive 方法使用示例
 * 
 * 此文件展示了如何使用修改后的 getProjectArchive 方法
 * 该方法现在可以下载归档文件并自动解压到临时目录
 */

import { Component, OnDestroy } from '@angular/core';
import { CloudService } from './cloud.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-example',
  template: ''
})
export class ExampleComponent implements OnDestroy {
  private subscription: Subscription;

  constructor(private cloudService: CloudService) {}

  /**
   * 使用示例：下载并解压云端项目归档
   */
  async downloadAndExtractProject(archiveUrl: string): Promise<void> {
    try {
      // 调用新的 getProjectArchive 方法
      this.subscription = this.cloudService.getProjectArchive(archiveUrl).subscribe({
        next: (extractPath: string) => {
          console.log('项目归档解压成功！');
          console.log('解压路径:', extractPath);
          
          // 现在可以使用解压后的文件
          this.processExtractedFiles(extractPath);
        },
        error: (error: any) => {
          console.error('下载或解压失败:', error);
          // 处理错误情况
        }
      });
    } catch (error) {
      console.error('操作失败:', error);
    }
  }

  /**
   * 处理解压后的文件
   */
  private processExtractedFiles(extractPath: string): void {
    try {
      // 列出解压后的文件
      const files = window['fs'].readDirSync(extractPath);
      console.log('解压后的文件列表:', files);

      // 可以在这里进行进一步的处理，比如：
      // - 复制文件到项目目录
      // - 读取配置文件
      // - 验证文件完整性等

      // 使用完毕后，可以清理临时文件
      // 注意：清理是可选的，系统重启时临时文件也会被清理
      // this.cloudService.cleanupExtractedFiles(extractPath);
    } catch (error) {
      console.error('处理解压文件时出错:', error);
    }
  }

  ngOnDestroy(): void {
    // 组件销毁时取消订阅
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

/**
 * 方法说明：
 * 
 * getProjectArchive(archiveUrl: string): Observable<string>
 * 
 * 参数：
 * - archiveUrl: 归档文件的下载URL
 * 
 * 返回值：
 * - Observable<string>: 解压后的目录路径
 * 
 * 功能：
 * 1. 从指定URL下载归档文件（支持任何格式，但推荐.7z）
 * 2. 创建临时目录保存下载的文件
 * 3. 使用7za.exe解压归档文件
 * 4. 返回解压后的目录路径
 * 5. 如果出错，会自动清理临时文件
 * 
 * 清理方法：
 * cleanupExtractedFiles(extractPath: string): void
 * - 用于手动清理由getProjectArchive创建的临时文件
 * - 只能清理由该服务创建的临时目录（安全措施）
 * 
 * 注意事项：
 * 1. 解压后的文件位于临时目录，请及时处理或备份重要文件
 * 2. 临时文件可以手动清理，也会在系统重启时自动清理
 * 3. 确保系统中存在7za.exe（位于child/7za.exe）
 * 4. 该方法支持任何7za.exe支持的压缩格式
 */