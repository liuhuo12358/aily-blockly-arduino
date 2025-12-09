import { Component, OnInit } from '@angular/core';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UiService } from '../../services/ui.service';
import { Router } from '@angular/router';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ModelStoreService, ModelItem } from './model-store.service';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { ModelDetailComponent } from './model-detail/model-detail.component';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-model-store',
  imports: [
    SubWindowComponent,
    ToolContainerComponent,
    FormsModule,
    CommonModule,
    NzTagModule,
    NzBreadCrumbModule,
    ModelDetailComponent,
    NzButtonModule
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
  
  // 分页相关
  currentPage = 1;  // 当前页码
  totalPages = 1;   // 总页数
  totalCount = 0;   // 总模型数
  pageSize = 12;    // 每页数量
  loading = false;  // 加载状态

  ngOnInit() {
    this.currentUrl = this.router.url;
    this.loadModelList();
  }

  // 加载模型列表
  loadModelList(page: number = 1) {
    this.loading = true;
    this.modelStoreService.getModelList(page).subscribe({
      next: (result) => {
        this.itemList = result.list;
        this.totalCount = result.total;
        this.totalPages = result.totalPages;
        this.currentPage = page;
        this.filterProjects();
        this.loading = false;
      },
      error: (error) => {
        console.error('加载模型列表失败:', error);
        this.loading = false;
      }
    });
  }
  
  // 跳转到指定页
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.loadModelList(page);
  }
  
  // 上一页
  prevPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }
  
  // 下一页
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }
  
  // 第一页
  firstPage() {
    this.goToPage(1);
  }
  
  // 最后一页
  lastPage() {
    this.goToPage(this.totalPages);
  }
  
  // 获取显示的页码列表
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5; // 最多显示5个页码
    
    if (this.totalPages <= maxVisible) {
      // 总页数少于等于最大显示数，显示所有页码
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 总页数多于最大显示数，智能显示
      if (this.currentPage <= 3) {
        // 当前页靠前，显示前5页
        for (let i = 1; i <= maxVisible; i++) {
          pages.push(i);
        }
      } else if (this.currentPage >= this.totalPages - 2) {
        // 当前页靠后，显示后5页
        for (let i = this.totalPages - maxVisible + 1; i <= this.totalPages; i++) {
          pages.push(i);
        }
      } else {
        // 当前页在中间，显示当前页前后各2页
        for (let i = this.currentPage - 2; i <= this.currentPage + 2; i++) {
          pages.push(i);
        }
      }
    }
    
    return pages;
  }

  showDetail;
  modelID: string = '';
  currentModelName;
  loadModelDetail(item: ModelItem) {
    this.modelID = item.id;
    this.currentModelName = item.name;
    this.showDetail = true;
  }

  closeModelDetail() {
    this.showDetail = false;
    this.modelID = null;
    this.currentModelName = null;
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


  onTrain(): void {
    this.uiService.openWindow({
      path: 'model-train',
      title: '模型训练',
      alwaysOnTop: true,
      width: 1200,
      height: 640
    });
  }
}
