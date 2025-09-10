import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService, LoginRequest, RegisterRequest } from '../../../services/auth.service';
import { ElectronService } from '../../../services/electron.service';
import { Subject, takeUntil } from 'rxjs';
import sha256 from 'crypto-js/sha256';

// 声明 electronAPI 类型
declare const window: any;

@Component({
  selector: 'app-user',
  imports: [
    CommonModule,
    FormsModule,
    NzButtonModule,
    NzInputModule,
    NzSpinModule,
    NzDividerModule,
    NzIconModule
  ],
  templateUrl: './user.component.html',
  styleUrl: './user.component.scss'
})
export class UserComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('menuBox') menuBox: ElementRef;

  @Input() position = {
    x: 0,
    y: 40,
  };

  @Input() width = 300;

  @Output() closeEvent = new EventEmitter<void>();

  private destroy$ = new Subject<void>();
  private message = inject(NzMessageService);
  private authService = inject(AuthService);
  private electronService = inject(ElectronService);

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
  
  private oauthResultListener: (() => void) | null = null;

  ngOnInit() {
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

    // 设置 GitHub OAuth 结果监听
    this.setupGitHubOAuthListener();
  }

  ngAfterViewInit(): void {
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('contextmenu', this.handleDocumentClick);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('contextmenu', this.handleDocumentClick);
    
    // 清理 OAuth 监听器
    if (this.oauthResultListener) {
      this.oauthResultListener();
    }
  }

  handleDocumentClick = (event: MouseEvent) => {
    event.preventDefault();
    const target = event.target as Node;

    // 检查点击是否在用户组件内
    const isClickInUserBox = this.menuBox && this.menuBox.nativeElement.contains(target);

    if (!isClickInUserBox) {
      this.closeEvent.emit();
    }
  };

  async onLogin() {
    if (!this.userInfo.username || !this.userInfo.password) {
      this.message.warning('请输入用户名和密码');
      return;
    }

    this.isWaiting = true;

    try {
      const loginData: LoginRequest = {
        username: this.userInfo.username,
        password: sha256(this.userInfo.password).toString()
      };

      this.authService.login(loginData).subscribe({
        next: (response) => {
          if (response.status === 200 && response.data) {
            this.message.success('登录成功');
            this.closeEvent.emit();
          } else {
            this.message.error(response.message || '登录失败');
          }
        },
        error: (error) => {
          console.error('登录错误:', error);
          this.message.error('登录失败，请检查网络连接');
        },
        complete: () => {
          this.isWaiting = false;
        }
      });
    } catch (error) {
      console.error('登录过程中出错:', error);
      this.message.error('登录失败');
      this.isWaiting = false;
    }
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
      this.closeEvent.emit();
    } catch (error) {
      console.error('退出登录失败:', error);
      this.message.error('退出登录失败');
    } finally {
      this.isWaiting = false;
    }
  }

  onSettings() {
    console.log('用户设置');
    // 这里可以添加设置逻辑
    this.closeEvent.emit();
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

  /**
   * 设置 GitHub OAuth 协议回调监听
   */
  private setupGitHubOAuthListener() {
    if (window.electronAPI?.oauth?.onCallback) {
      this.oauthResultListener = window.electronAPI.oauth.onCallback(async (callbackData: any) => {
        this.isGitHubAuthWaiting = false;
        
        try {
          // 使用 AuthService 处理协议回调
          const result = await this.authService.handleOAuthCallback(callbackData);
          
          if (result.success) {
            console.log('GitHub OAuth 成功:', result.data);
            this.message.success('GitHub 登录成功');
            this.closeEvent.emit();
          } else {
            // OAuth 失败
            console.error('GitHub OAuth 失败:', result);
            let errorMessage = 'GitHub 登录失败';
            
            switch (result.error) {
              case 'timeout':
              case 'invalid_state':
                errorMessage = '登录状态无效或已超时，请重试';
                break;
              case 'missing_parameters':
                errorMessage = '授权参数缺失，请重试';
                break;
              case 'access_denied':
                errorMessage = '您取消了授权';
                break;
              case 'callback_processing_failed':
                errorMessage = result.message || '处理授权回调失败';
                break;
              default:
                errorMessage = result.message || 'GitHub 登录失败';
            }
            
            this.message.error(errorMessage);
          }
        } catch (error) {
          console.error('处理 OAuth 回调异常:', error);
          this.message.error('登录处理失败，请重试');
        }
      });
    }
  }

  /**
   * 开始 GitHub 浏览器 OAuth 登录
   */
  async onGitHubLogin() {
    if (this.isGitHubAuthWaiting) return;

    this.isGitHubAuthWaiting = true;

    try {
      // 直接通过 HTTP 请求启动 GitHub OAuth 流程
      this.authService.startGitHubOAuth().subscribe({
        next: (response) => {
          // 使用 ElectronService 在系统浏览器中打开授权页面
          if (this.electronService.isElectron) {
            this.electronService.openUrl(response.authorization_url);
            this.message.info('正在跳转到 GitHub 授权页面...');
          } else {
            // 如果不在 Electron 环境中，使用 window.open 作为降级方案
            window.open(response.authorization_url, '_blank');
            this.message.info('正在跳转到 GitHub 授权页面...');
          }
        },
        error: (error) => {
          console.error('启动 GitHub OAuth 失败:', error);
          this.message.error('启动 GitHub 登录失败，请检查网络连接');
          this.isGitHubAuthWaiting = false;
        }
      });
    } catch (error) {
      console.error('GitHub 登录出错:', error);
      this.message.error('GitHub 登录失败');
      this.isGitHubAuthWaiting = false;
    }
  }

}
