import { Component, OnInit } from '@angular/core';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { AppStoreService, AppItem } from './app-store.service';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-app-store',
  imports: [
    ToolContainerComponent,
    SubWindowComponent,
    CommonModule,
    TranslateModule,
    FormsModule,
    NzToolTipModule,
    DragDropModule
  ],
  templateUrl: './app-store.component.html',
  styleUrl: './app-store.component.scss'
})
export class AppStoreComponent implements OnInit {
  currentUrl: string;
  windowInfo = 'MENU.APP_STORE';
  
  // 分成两个区域的 apps
  headerZoneApps: AppItem[] = [];
  otherZoneApps: AppItem[] = [];

  constructor(
    private uiService: UiService,
    private router: Router,
    private appStoreService: AppStoreService
  ) { }

  ngOnInit() {
    this.currentUrl = this.router.url;
    this.loadApps();
  }

  loadApps() {
    const allApps = this.appStoreService.getAllApps();
    this.headerZoneApps = allApps.slice(0, this.headerAppLimit);
    this.otherZoneApps = allApps.slice(this.headerAppLimit);
  }

  // 打开 app
  openApp(app: AppItem) {
    this.uiService.openTool(app.data.data);
  }

  // 拖拽排序
  drop(event: CdkDragDrop<AppItem[]>) {
    if (event.previousContainer === event.container) {
      // 同一区域内移动
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // 跨区域移动
      // 如果目标是 header 区域且已满，则需要交换
      if (event.container.data === this.headerZoneApps && this.headerZoneApps.length >= this.headerAppLimit) {
        // 将 header 区域最后一个移到 other 区域开头
        const lastItem = this.headerZoneApps.pop();
        if (lastItem) {
          this.otherZoneApps.unshift(lastItem);
        }
      }
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    this.saveAppsOrder();
  }

  // 保存排序
  saveAppsOrder() {
    const allApps = [...this.headerZoneApps, ...this.otherZoneApps];
    this.appStoreService.updateAppsOrder(allApps);
  }

  // 获取 header 上显示的 app 数量
  get headerAppLimit(): number {
    return this.appStoreService.HEADER_APP_LIMIT;
  }

  // 计算空槽位
  get emptySlots(): number[] {
    const count = this.headerAppLimit - this.headerZoneApps.length;
    return count > 0 ? Array(count).fill(0).map((_, i) => i) : [];
  }

  // 重置为默认配置
  resetToDefault() {
    this.appStoreService.resetToDefault();
    this.loadApps();
  }

  close() {
    this.uiService.closeTool('app-store');
  }
}
