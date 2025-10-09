import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
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
import { fromEvent, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CloudService } from '../../../tools/cloud-space/services/cloud.service';
import { ProjectService } from '../../../services/project.service';
import { CmdService } from '../../../services/cmd.service';

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
export class ExampleListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('contentBox', { static: false }) contentBox!: ElementRef;
  
  exampleList: any[] = [];
  resourceUrl: string = '';
  keyword: string = '';

  pageIndex: number = 1; // 当前页码
  pageSize: number = 10; // 每页显示数量，默认值
  total: number = 500; // 总条目数
  loadingExampleIndex: number | null = null; // 当前正在加载的示例索引
  
  private destroy$ = new Subject<void>();

  constructor(
    private configService: ConfigService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private playgroundService: PlaygroundService,
    private cloudService: CloudService,
    private projectService: ProjectService,
    private cmdService: CmdService
  ) {
    // 从URL参数中获取搜索关键词（如果有）
    this.route.queryParams.subscribe(params => {
      if (params['keyword']) {
        this.keyword = params['keyword'];
      }
    });
  }

  ngOnInit() {
    this.getExamples();
    // this.resourceUrl = this.configService.data.resource[0] + "/imgs/examples/";

    // // 如果数据已经加载，直接使用
    // if (this.playgroundService.isLoaded) {
    //   this.exampleList = this.playgroundService.processedExamplesList;
    //   console.log(this.exampleList);

    //   // 如果URL中有关键词，执行搜索
    //   if (this.keyword) {
    //     this.search(this.keyword);
    //   }
    // } else {
    //   // 如果数据未加载，等待加载完成
    //   this.playgroundService.loadExamplesList().then(() => {
    //     this.exampleList = this.playgroundService.processedExamplesList;
    //     console.log(this.exampleList);

    //     // 如果URL中有关键词，执行搜索
    //     if (this.keyword) {
    //       this.search(this.keyword);
    //     }
    //   });
    // }
  }

  getExamples() {
    this.cloudService.getPublicProjects(this.pageIndex, this.pageSize).subscribe(res => {
      if (res && res.status === 200) {
        this.exampleList = []
        this.total = res.data.total;
        
        res.data.list.forEach(prj => {
          // 图片url
          let imageUrl = '';
          if (prj.image_url) {
            imageUrl = this.cloudService.baseUrl + prj.image_url;
          } else {
            imageUrl = 'imgs/subject.webp';
          }

          // archive_url
          if (prj.archive_url) {
            prj.archive_url = this.cloudService.baseUrl + prj.archive_url;
          } else {
            prj.archive_url = '';
          }

          this.exampleList.push(prj);
        });
        console.log('获取公开项目列表:', this.exampleList);
      }
    });
  }

  ngAfterViewInit() {
    // 初始计算可显示的数量
    setTimeout(() => {
      this.calculatePageSize();
    }, 100);

    // 监听窗口大小变化
    fromEvent(window, 'resize')
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.calculatePageSize();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 计算容器中可以显示多少个示例项
   * 每个示例项：280px x 280px，间距10px
   */
  calculatePageSize() {
    if (!this.contentBox) return;

    const container = this.contentBox.nativeElement;
    const containerWidth = container.clientWidth - 30; // 减去padding (15px * 2)
    const containerHeight = container.clientHeight - 30; // 减去padding (15px * 2)

    const itemWidth = 280;
    const itemHeight = 280;
    const gap = 15; // 根据scss中的gap值

    // 计算每行可以显示多少个
    const itemsPerRow = Math.floor((containerWidth + gap) / (itemWidth + gap));
    
    // 计算可以显示多少行
    const rows = Math.floor((containerHeight + gap) / (itemHeight + gap));

    // 总共可以显示的数量
    const calculatedPageSize = itemsPerRow * rows;

    // 至少显示1个
    this.pageSize = Math.max(1, calculatedPageSize);
    
    console.log('Container size:', containerWidth, 'x', containerHeight);
    console.log('Items per row:', itemsPerRow, 'Rows:', rows, 'Page size:', this.pageSize);
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

    const item = this.exampleList[index];
    console.log('加载示例项目:', item);
    this.cloudService.getProjectArchive(item.archive_url).subscribe(async res => {
      // 直接添加随机数避免重名
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const uniqueName = `${item.nickname || item.name || 'cloud_project'}_${randomNum}`;
      const targetPath = this.projectService.projectRootPath + '\\' + uniqueName;

      await this.cmdService.runAsync(`Copy-Item -Path "${res}" -Destination "${targetPath}" -Recurse -Force`);
      this.projectService.projectOpen(targetPath);
      this.loadingExampleIndex = null;
    });
  }

  isLoading(index: number): boolean {
    return this.loadingExampleIndex === index;
  }

  isDisabled(index: number): boolean {
    return this.loadingExampleIndex !== null && this.loadingExampleIndex !== index;
  }
}
