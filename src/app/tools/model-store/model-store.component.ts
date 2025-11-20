import { Component, OnInit } from '@angular/core';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ModelStoreService, ModelItem } from './model-store.service';

@Component({
  selector: 'app-model-store',
  imports: [
    SubWindowComponent,
    ToolContainerComponent,
    FormsModule,
    CommonModule,
    NzTagModule
  ],
  templateUrl: './model-store.component.html',
  styleUrl: './model-store.component.scss'
})
export class ModelStoreComponent implements OnInit {
  currentUrl;

  constructor(
    private uiService: UiService,
    private router: Router,
    private modelStoreService: ModelStoreService
  ) { }

  itemList: ModelItem[] = []
  filteredItemList: ModelItem[] = [] // 过滤后的项目列表
  showSearch = false;
  searchKeyword = ''; // 搜索关键词

  ngOnInit() {
    this.loadModelList();
  }

  // 加载模型列表
  loadModelList() {
    this.modelStoreService.getModelList().subscribe({
      next: (list) => {
        this.itemList = list;
        this.filterProjects();
      },
      error: (error) => {
        console.error('加载模型列表失败:', error);
      }
    });
  }

  openSearch() {
    this.showSearch = true;
  }

  closeSearch() {
    this.showSearch = false;
    this.searchKeyword = '';
    this.filterProjects();
  }

  // 搜索关键词变化时触发
  onSearchChange() {
    this.filterProjects();
  }

  // 过滤项目列表
  filterProjects() {
    if (!this.searchKeyword || this.searchKeyword.trim() === '') {
      this.filteredItemList = [...this.itemList];
    } else {
      const keyword = this.searchKeyword.toLowerCase().trim();
      this.filteredItemList = this.itemList.filter(item => {
        const description = (item.description || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const authorName = (item.author_name || '').toLowerCase();
        return name.includes(keyword) || description.includes(keyword) || authorName.includes(keyword);
      });
    }
    console.log('过滤后的项目列表:', this.filteredItemList);
  }

  close() {
    this.uiService.closeTool('model-store');
  }
}
