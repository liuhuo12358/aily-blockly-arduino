import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { ToolContainerComponent } from '../../components/tool-container/tool-container.component';
import { SubWindowComponent } from '../../components/sub-window/sub-window.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService, LoginRequest, RegisterRequest } from '../../services/auth.service';
import sha256 from 'crypto-js/sha256';
import { Subject, takeUntil } from 'rxjs';
import { ElectronService } from '../../services/electron.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LoginComponent } from '../../components/login/login.component';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-user-center',
  imports: [
    FormsModule,
    CommonModule,
    ToolContainerComponent,
    SubWindowComponent,
    LoginComponent,
    NzButtonModule,
    NzProgressModule
  ],
  templateUrl: './user-center.component.html',
  styleUrl: './user-center.component.scss'
})
export class UserCenterComponent {
  currentUrl = '/user-center';
  windowInfo = '用户中心';
  @ViewChild('menuBox') menuBox: ElementRef;

  private destroy$ = new Subject<void>();
  private message = inject(NzMessageService);
  private authService = inject(AuthService);

  userInfo = {
    username: '',
    password: '',
    email: ''
  }

  isWaiting = false;
  isRegistering = false;
  isLoggedIn = false;
  currentUser: any = null;
  isGitHubAuthWaiting = false;

  constructor(
    private uiService: UiService
  ) {

  }

  async ngOnInit() {
    // 首先检查并同步登录状态
    await this.checkAndSyncAuthStatus();

    // 监听登录状态
    this.authService.isLoggedIn$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isLoggedIn => {
        this.isLoggedIn = isLoggedIn;
      });

    // 监听用户信息
    this.authService.userInfo$
      .pipe(takeUntil(this.destroy$))
      .subscribe(userInfo => {
        this.currentUser = userInfo;
      });

    // 由于app.component已经设置了全局OAuth监听器，这里不需要再设置
    // 但是我们可以监听AuthService的登录状态变化来处理UI状态
  }

  /**
   * 检查并同步认证状态
   */
  private async checkAndSyncAuthStatus(): Promise<void> {
    try {
      await this.authService.checkAndSyncAuthStatus();
    } catch (error) {
      console.error('同步认证状态失败:', error);
    }
  }

  ngAfterViewInit(): void {

  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onRegister() {
    if (!this.userInfo.username || !this.userInfo.password || !this.userInfo.email) {
      this.message.warning('请填写完整的注册信息');
      return;
    }

    this.isWaiting = true;

    try {
      const registerData: RegisterRequest = {
        username: this.userInfo.username,
        password: this.userInfo.password,
        email: this.userInfo.email
      };

      this.authService.register(registerData).subscribe({
        next: (response) => {
          this.message.success('注册成功，请登录');
          this.isRegistering = false;
          // 清空密码，保留用户名用于登录
          this.userInfo.password = '';
          this.userInfo.email = '';
        },
        error: (error) => {
          console.error('注册错误:', error);
          this.message.error('注册失败，请检查网络连接');
        },
        complete: () => {
          this.isWaiting = false;
        }
      });
    } catch (error) {
      console.error('注册过程中出错:', error);
      this.message.error('注册失败');
      this.isWaiting = false;
    }
  }

  async onLogout() {
    this.isWaiting = true;
    try {
      await this.authService.logout();
      this.message.success('已退出登录');
    } catch (error) {
      console.error('退出登录失败:', error);
      this.message.error('退出登录失败');
    } finally {
      this.isWaiting = false;
    }
  }

  toggleRegisterMode() {
    this.isRegistering = !this.isRegistering;
    // 清空表单
    this.userInfo = {
      username: '',
      password: '',
      email: ''
    };
  }

  more() {
    this.message.warning('服务暂不可用');
  }

  close() {
    this.uiService.closeTool('user-center');
  }
}
