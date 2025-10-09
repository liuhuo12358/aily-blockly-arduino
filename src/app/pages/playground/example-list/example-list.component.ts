import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfigService } from '../../../services/config.service';
import { ActivatedRoute } from '@angular/router';
import { PlaygroundService } from '../playground.service';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
@Component({
  selector: 'app-example-list',
  imports: [
    RouterModule,
    CommonModule,
    FormsModule,
    NzInputModule,
    NzButtonModule,
    TranslateModule,
    NzPaginationModule,
    NzToolTipModule
  ],
  templateUrl: './example-list.component.html',
  styleUrl: './example-list.component.scss'
})
export class ExampleListComponent implements OnInit {
  exampleList: any[] = [];
  resourceUrl: string = '';
  keyword: string = '';

  pageIndex: number = 1; // 当前页码
  total: number = 500; // 总条目数
  loadingExampleIndex: number | null = null; // 当前正在加载的示例索引

  constructor(
    private configService: ConfigService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private playgroundService: PlaygroundService,
  ) {
    // 从URL参数中获取搜索关键词（如果有）
    this.route.queryParams.subscribe(params => {
      if (params['keyword']) {
        this.keyword = params['keyword'];
      }
    });
  }

  ngOnInit() {
    this.resourceUrl = this.configService.data.resource[0] + "/imgs/examples/";

    // 如果数据已经加载，直接使用
    if (this.playgroundService.isLoaded) {
      this.exampleList = this.playgroundService.processedExamplesList;
      console.log(this.exampleList);

      // 如果URL中有关键词，执行搜索
      if (this.keyword) {
        this.search(this.keyword);
      }
    } else {
      // 如果数据未加载，等待加载完成
      this.playgroundService.loadExamplesList().then(() => {
        this.exampleList = this.playgroundService.processedExamplesList;
        console.log(this.exampleList);

        // 如果URL中有关键词，执行搜索
        if (this.keyword) {
          this.search(this.keyword);
        }
      });
    }
  }

  search(keyword = this.keyword) {
    this.exampleList = this.playgroundService.searchExamples(keyword);
  }

  onImgError(event) {
    (event.target as HTMLImageElement).src = 'imgs/subject.webp';
  }

  clearSearch() {
    this.keyword = '';
    this.search();
  }

  loadExample(index: number) {
    // 设置当前加载的示例索引
    this.loadingExampleIndex = index;
    
    // 模拟加载过程（这里替换为实际的加载逻辑）
    setTimeout(() => {
      console.log('加载示例:', this.exampleList[index]);
      // 加载完成后重置loading状态
      this.loadingExampleIndex = null;
    }, 2000);
  }

  isLoading(index: number): boolean {
    return this.loadingExampleIndex === index;
  }

  isDisabled(index: number): boolean {
    return this.loadingExampleIndex !== null && this.loadingExampleIndex !== index;
  }
}
