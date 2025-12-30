import { Component, OnInit, AfterViewInit } from '@angular/core';
import { GUIDE_MENU } from '../../configs/menu.config';
import { UiService } from '../../services/ui.service';
import { ProjectService } from '../../services/project.service';
import { ConfigService } from '../../services/config.service';
import { version } from '../../../../package.json';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { ElectronService } from '../../services/electron.service';
import Splide from '@splidejs/splide';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-guide',
  imports: [TranslateModule, CommonModule],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.scss'
})
export class GuideComponent implements OnInit, AfterViewInit {
  version = version;
  guideMenu = GUIDE_MENU;
  showMenu = true;
  showMore = false;
  sponsors: any[] = [];
  showImgUrl: string | null = null;

  // 新手引导相关
  showOnboarding = false;
  currentStep = 0;
  onboardingSteps = [
    {
      target: '.menu-box .btn:first-child',
      titleKey: 'GUIDE.ONBOARDING.STEP1_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP1_DESC',
      position: 'right'
    },
    {
      target: '.menu-box .btn:nth-child(2)',
      titleKey: 'GUIDE.ONBOARDING.STEP2_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP2_DESC',
      position: 'right'
    },
    {
      target: '.menu-box .btn:nth-child(3)',
      titleKey: 'GUIDE.ONBOARDING.STEP3_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP3_DESC',
      position: 'right'
    },
    {
      target: '.menu-box .btn:nth-child(4)',
      titleKey: 'GUIDE.ONBOARDING.STEP4_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP4_DESC',
      position: 'right'
    },
    {
      target: '.right-box .item:first-child',
      titleKey: 'GUIDE.ONBOARDING.STEP5_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP5_DESC',
      position: 'left'
    },
    {
      target: '.right-box .item:nth-child(2)',
      titleKey: 'GUIDE.ONBOARDING.STEP6_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP6_DESC',
      position: 'left'
    },
    {
      target: '.right-box .item:nth-child(3)',
      titleKey: 'GUIDE.ONBOARDING.STEP7_TITLE',
      descKey: 'GUIDE.ONBOARDING.STEP7_DESC',
      position: 'left'
    }
  ];
  highlightStyle: any = {};
  tooltipStyle: any = {};

  showImg(url: string) {
    this.showImgUrl = url;
  }

  hideImg() {
    this.showImgUrl = null;
  }

  get recentlyProjects() {
    return this.projectService.recentlyProjects
  }

  constructor(
    private uiService: UiService,
    private projectService: ProjectService,
    private router: Router,
    private electronService: ElectronService,
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  /**
   * 获取微信二维码 URL（根据当前 region 动态生成）
   */
  get wechatQrcodeUrl(): string {
    const resourceUrl = this.configService.getCurrentResourceUrl();
    return `${resourceUrl}/wechat.jpg`;
  }

  get qqQrcodeUrl(): string {
    const resourceUrl = this.configService.getCurrentResourceUrl();
    return `${resourceUrl}/qq.jpg`
  }

  ngOnInit() {
    this.loadSponsors();
    this.checkFirstLaunch();
  }

  // 检查是否是第一次启动
  private checkFirstLaunch() {
    const hasSeenOnboarding = this.configService.data.onboardingCompleted;
    if (!hasSeenOnboarding) {
      // 延迟显示引导，确保页面已渲染
      setTimeout(() => {
        this.showOnboarding = true;
        this.updateHighlight();
      }, 500);
    }
  }

  // 更新高亮区域位置
  private updateHighlight() {
    const step = this.onboardingSteps[this.currentStep];
    const element = document.querySelector(step.target) as HTMLElement;
    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = 8;
      this.highlightStyle = {
        top: `${rect.top - padding}px`,
        left: `${rect.left - padding}px`,
        width: `${rect.width + padding * 2}px`,
        height: `${rect.height + padding * 2}px`
      };
      // 计算提示框位置
      this.calculateTooltipPosition(rect, step.position);
    }
  }

  // 计算提示框位置
  private calculateTooltipPosition(rect: DOMRect, position: string) {
    const tooltipWidth = 280;
    const tooltipHeight = 150;
    const gap = 20;
    const verticalOffset = -12; // 向上偏移12px

    switch (position) {
      case 'right':
        this.tooltipStyle = {
          top: `${rect.top + verticalOffset}px`,
          left: `${rect.right + gap}px`
        };
        break;
      case 'left':
        this.tooltipStyle = {
          top: `${rect.top + verticalOffset}px`,
          left: `${rect.left - tooltipWidth - gap}px`
        };
        break;
      case 'bottom':
        this.tooltipStyle = {
          top: `${rect.bottom + gap + verticalOffset}px`,
          left: `${rect.left}px`
        };
        break;
      case 'top':
        this.tooltipStyle = {
          top: `${rect.top - tooltipHeight - gap + verticalOffset}px`,
          left: `${rect.left}px`
        };
        break;
    }
  }

  // 下一步
  nextStep() {
    if (this.currentStep < this.onboardingSteps.length - 1) {
      this.currentStep++;
      this.updateHighlight();
    } else {
      this.finishOnboarding();
    }
  }

  // 上一步
  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateHighlight();
    }
  }

  // 跳过引导
  skipOnboarding() {
    this.finishOnboarding();
  }

  // 完成引导
  private finishOnboarding() {
    this.showOnboarding = false;
    this.configService.data.onboardingCompleted = true;
    this.configService.save();
  }

  ngAfterViewInit() {
    // 延迟初始化轮播，确保DOM已渲染
    setTimeout(() => {
      this.initSplide();
    }, 100);
  }

  private loadSponsors() {
    this.http.get<any[]>('sponsor/sponsor.json').subscribe({
      next: (data) => {
        // 对获取到的数据进行随机排序
        this.sponsors = this.shuffleArray([...data]);
        // 数据加载完成后重新初始化轮播
        setTimeout(() => {
          this.initSplide();
        }, 100);
      },
      error: (error) => {
        console.error('Failed to load sponsors:', error);
      }
    });
  }

  private shuffleArray(array: any[]): any[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private initSplide() {
    const splideElement = document.querySelector('#sponsor-splide');
    if (splideElement && this.sponsors.length > 0) {
      const splide = new Splide('#sponsor-splide', {
        type: 'loop',
        autoplay: true,
        interval: 3000,
        perPage: 3,
        perMove: 1,
        gap: '10px',
        arrows: false,
        pagination: false,
        breakpoints: {
          400: {
            perPage: 2,
          },
          300: {
            perPage: 1,
          }
        }
      });
      splide.mount();
    }
  }

  onMenuClick(e: any) {
    this.process(e);
  }

  async selectFolder() {
    const folderPath = await window['ipcRenderer'].invoke('select-folder', {
      path: '',
    });
    console.log('选中的文件夹路径：', folderPath);
    return folderPath;
  }

  async openProject(data) {
    const path = await this.selectFolder();
    if (path) {
      await this.projectService.projectOpen(path);
    }
  }

  async openProjectByPath(data) {
    await this.projectService.projectOpen(data.path);
  }

  process(item) {
    switch (item.action) {
      case 'project-new':
        this.router.navigate(['/main/project-new']);
        // this.uiService.openWindow(item.data);
        break;
      case 'project-open':
        this.openProject(item.data);
        break;
      case 'browser-open':
        this.electronService.openUrl(item.data.url);
        break;
      case 'playground-open':
        this.router.navigate(['/main/playground']);
        break;
      case 'tool-open':
        this.uiService.turnTool(item.data);
        break;
      default:
        break;
    }
  }

  openUrl(url: string) {
    this.electronService.openUrl(url);
  }

  gotoPlayground() {
    this.router.navigate(['/main/playground']);
  }

  // 重新加载微信二维码图片
  // retryLoadImage() {
  //   setTimeout(() => {
  //     const img = document.querySelector('.qrcode') as HTMLImageElement;
  //     if (img) {
  //       const originalSrc = 'https://dl.diandeng.tech/blockly/wechat.jpg';
  //       img.src = `${originalSrc}?t=${Date.now()}`;
  //     }
  //   }, 1000);
  // }

  // test() {
  //   console.log(this.electronService.isWindowFocused());
  //   setTimeout(() => {
  //     // if (!this.electronService.isWindowFocused()) {
  //     // }
  //   }, 12000)
  // }

  openFeedback() {
    this.uiService.openFeedback();
  }
}
