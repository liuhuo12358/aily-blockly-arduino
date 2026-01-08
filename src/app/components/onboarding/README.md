# Onboarding 新手引导组件

一个通用的新手引导（onboarding）组件，用于在页面上高亮显示目标元素并展示引导提示框。

## 基本用法

```html
<app-onboarding 
  [show]="showOnboarding" 
  [config]="onboardingConfig"
  (closed)="onOnboardingClosed()"
  (completed)="onOnboardingCompleted()">
</app-onboarding>
```

## 输入属性 (Inputs)

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `show` | `boolean` | `false` | 是否显示新手引导 |
| `config` | `OnboardingConfig` | - | 引导配置（必填） |
| `initialStep` | `number` | `0` | 初始步骤索引 |

## 输出事件 (Outputs)

| 事件 | 参数 | 说明 |
|------|------|------|
| `closed` | 无 | 用户跳过/关闭引导时触发 |
| `completed` | 无 | 用户完成所有引导步骤时触发 |
| `stepChange` | `number` | 步骤变化时触发，参数为当前步骤索引 |

## 配置接口

### OnboardingConfig

```typescript
interface OnboardingConfig {
  /** 引导步骤列表（必填） */
  steps: OnboardingStep[];
  
  /** 高亮区域的内边距，默认为 8 */
  padding?: number;
  
  /** 提示框与高亮区域的间距，默认为 20 */
  gap?: number;
  
  /** 提示框宽度，默认为 280 */
  tooltipWidth?: number;
  
  /** 提示框高度（用于初始位置计算），默认为 200 */
  tooltipHeight?: number;
  
  /** 跳过按钮的国际化 key，默认为 'COMMON.ONBOARDING.SKIP' */
  skipKey?: string;
  
  /** 上一步按钮的国际化 key，默认为 'COMMON.ONBOARDING.PREV' */
  prevKey?: string;
  
  /** 下一步按钮的国际化 key，默认为 'COMMON.ONBOARDING.NEXT' */
  nextKey?: string;
  
  /** 完成按钮的国际化 key，默认为 'COMMON.ONBOARDING.DONE' */
  doneKey?: string;
}
```

### OnboardingStep

```typescript
interface OnboardingStep {
  /** 目标元素的 CSS 选择器 */
  target: string;
  
  /** 标题的国际化 key */
  titleKey: string;
  
  /** 描述的国际化 key */
  descKey: string;
  
  /** 提示框相对于高亮元素的位置 */
  position: 'top' | 'bottom' | 'left' | 'right';
}
```

## 完整示例

### 1. 在组件中导入

```typescript
import { OnboardingComponent, OnboardingConfig } from '../../components/onboarding';

@Component({
  // ...
  imports: [OnboardingComponent],
})
export class YourComponent {
  showOnboarding = false;
  
  onboardingConfig: OnboardingConfig = {
    steps: [
      {
        target: '.menu-box .btn:first-child',
        titleKey: 'GUIDE.ONBOARDING.STEP1_TITLE',
        descKey: 'GUIDE.ONBOARDING.STEP1_DESC',
        position: 'right'
      },
      {
        target: '.toolbar .search-btn',
        titleKey: 'GUIDE.ONBOARDING.STEP2_TITLE',
        descKey: 'GUIDE.ONBOARDING.STEP2_DESC',
        position: 'bottom'
      },
      {
        target: '#main-content',
        titleKey: 'GUIDE.ONBOARDING.STEP3_TITLE',
        descKey: 'GUIDE.ONBOARDING.STEP3_DESC',
        position: 'left'
      }
    ],
    // 自定义按钮文本（可选）
    skipKey: 'GUIDE.ONBOARDING.SKIP',
    prevKey: 'GUIDE.ONBOARDING.PREV',
    nextKey: 'GUIDE.ONBOARDING.NEXT',
    doneKey: 'GUIDE.ONBOARDING.DONE'
  };

  // 检查是否需要显示引导
  ngOnInit() {
    const hasSeenOnboarding = localStorage.getItem('onboardingCompleted');
    if (!hasSeenOnboarding) {
      setTimeout(() => {
        this.showOnboarding = true;
      }, 500);
    }
  }

  // 引导关闭或完成时的处理
  onOnboardingClosed() {
    this.showOnboarding = false;
    localStorage.setItem('onboardingCompleted', 'true');
  }

  onOnboardingCompleted() {
    this.showOnboarding = false;
    localStorage.setItem('onboardingCompleted', 'true');
  }
}
```

### 2. 在模板中使用

```html
<!-- 页面内容 -->
<div class="your-content">
  <!-- ... -->
</div>

<!-- 新手引导组件（放在模板末尾） -->
<app-onboarding 
  [show]="showOnboarding" 
  [config]="onboardingConfig"
  (closed)="onOnboardingClosed()"
  (completed)="onOnboardingCompleted()">
</app-onboarding>
```

### 3. 添加国际化文本

在 `public/i18n/zh_cn/zh_cn.json` 中添加：

```json
{
  "GUIDE": {
    "ONBOARDING": {
      "SKIP": "跳过",
      "PREV": "上一步",
      "NEXT": "下一步",
      "DONE": "完成",
      "STEP1_TITLE": "创建项目",
      "STEP1_DESC": "点击这里创建一个新项目",
      "STEP2_TITLE": "搜索功能",
      "STEP2_DESC": "使用搜索快速查找内容",
      "STEP3_TITLE": "主要内容区",
      "STEP3_DESC": "这里是主要的工作区域"
    }
  }
}
```

## 位置说明

`position` 属性决定提示框相对于高亮元素的位置：

- `top`: 提示框在高亮元素**上方**，箭头指向下方
- `bottom`: 提示框在高亮元素**下方**，箭头指向上方
- `left`: 提示框在高亮元素**左边**，箭头指向右边
- `right`: 提示框在高亮元素**右边**，箭头指向左边

> **注意**: 如果指定位置空间不足，组件会自动调整到相反位置。

## 特性

- ✅ 自动高亮目标元素
- ✅ 智能位置调整（空间不足时自动切换方向）
- ✅ 箭头自动指向高亮框中心
- ✅ 响应窗口大小变化
- ✅ 支持国际化
- ✅ 根据实际内容高度动态调整位置
- ✅ 支持上一步/下一步/跳过操作

## 样式自定义

组件使用了以下 CSS 变量和类名，可以通过全局样式覆盖：

```scss
// 高亮框样式
.onboarding-highlight {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7);
}

// 提示框样式
.onboarding-tooltip {
  background: #1e1e1e;
  border: 1px solid #3b82f6;
  border-radius: 12px;
}

// 按钮样式
.btn-next {
  background: #3b82f6;
}
```
