# 酒馆桌面宠物 UI 重设计指南 (明日方舟/二次元手游风)

## 1. 设计理念：罗德岛工业风 (Tech-Industrial)

为了实现**明日方舟 (Arknights)** 风格，我们需要放弃之前的圆角和模糊，转而使用**硬朗的几何线条、高对比度黑白、斜角切割**以及**科技感装饰元素**。

**核心特征：**
*   **形状：** 尖锐的直角或 45 度切角 (`clip-path`)，极少使用圆角。
*   **色彩：** 纯黑/深灰背景，搭配高饱和度的**荧光黄** (`#F4D03F`) 或 **青色** (`#29F1A4`) 作为点缀。
*   **排版：** 强调数字编号、英文装饰字（如 `SYSTEM`、`CAUTION`）、细线条分割。
*   **质感：** 无阴影（Flat），强调边框和色块的拼接。

---

## 2. 视觉规范系统

### 🎨 配色方案 (罗德岛黑黄)

| 元素 | 颜色值 | 说明 |
| :--- | :--- | :--- |
| **背景 (Base)** | `#181818` | 接近纯黑的深灰，不透明 |
| **面板 (Surface)** | `#262626` | 略浅的灰色，用于区分层级 |
| **点缀 (Accent)** | `#FFE100` (黄) / `#00DAC2` (青) | **非常重要**，用于高亮、选中态、Loading 条 |
| **文字 (Main)** | `#FFFFFF` | 纯白标题 |
| **文字 (Sub)** | `#8D8D8D` | 灰色辅助文，常配合全大写英文 |
| **警告 (Danger)** | `#FF3B30` | 鲜红，用于关闭/危险操作 |

---

## 3. 具体组件改造代码 (CSS / SCSS)

### A. 通用基础类 (`ui/styles/arknights.scss`)

我们建议定义一些基础的 CSS 类，模拟手游的 UI 元素。

```scss
// 1. 科技感面板：带切角的矩形
@mixin tech-panel {
  background: #181818;
  border: 1px solid #333;
  position: relative;
  box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  
  // 装饰性线条 (左上角)
  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 40px; height: 2px;
    background: #FFE100; // 标志性黄色
    z-index: 2;
  }
}

// 2. 切角按钮
.btn-ark {
  position: relative;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-family: 'Oswald', sans-serif; // 推荐使用更硬朗的字体
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  clip-path: polygon(
    0 0, 
    100% 0, 
    100% calc(100% - 10px), 
    calc(100% - 10px) 100%, 
    0 100%
  ); // 右下角切角
  
  transition: all 0.2s;

  &:hover {
    background: #fff;
    color: #000;
  }
  
  &.active {
    background: #FFE100;
    color: #000;
    border-color: #FFE100;
  }
}
```

### B. 设置面板改造 ([ui/SettingsPanel.vue](file:///c:/Users/P7XXTM1-G/Downloads/tavern_helper_template-main/%E5%88%9D%E5%A7%8B%E6%A8%A1%E6%9D%BF/%E8%84%9A%E6%9C%AC/%E9%85%92%E9%A6%86%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/ui/SettingsPanel.vue))

彻底抛弃毛玻璃，改用**高密度信息展示板**风格。

```scss
.settings-panel {
  @include tech-panel; // 使用上面的 mixin
  border-radius: 0;    // 必须直角
  
  // 背景装饰网格
  background-image: 
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 20px 20px;
}

.panel-header {
  background: #262626;
  border-bottom: 2px solid #FFE100; // 底部亮黄线条
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: 20px;
    font-style: italic; // 斜体增加动感
    text-transform: uppercase;
    
    // 副标题装饰 (伪元素)
    &::after {
      content: ' // SETTINGS';
      font-size: 10px;
      color: #555;
      font-weight: normal;
      margin-left: 8px;
    }
  }
}

// 分组标题：带有编号的感觉
.setting-section h4 {
  color: #fff;
  background: #000;
  display: inline-block;
  padding: 4px 12px;
  transform: skewX(-15deg); // 倾斜背景
  border-left: 4px solid #FFE100;
  
  span {
    display: block;
    transform: skewX(15deg); // 文字摆正
    font-size: 12px;
  }
}
```

### C. 输入框与控件

手游输入框通常很“平”，有明确的底线或边框。

```scss
input[type='text'], select {
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-bottom: 2px solid #444;
  border-radius: 0; // 直角
  color: #FFE100;   // 输入文字高亮
  font-family: monospace; // 等宽字体增加代码感
  
  &:focus {
    background: rgba(255, 225, 0, 0.05);
    border-color: #FFE100;
  }
}

// 进度条 / 滑块
input[type='range'] {
  height: 4px;
  background: #444;
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: #FFE100;
    border: 2px solid #000;
    transform: rotate(45deg); // 菱形滑块
  }
}
```

### D. 功能菜单 ([ui/FunctionMenu.vue](file:///c:/Users/P7XXTM1-G/Downloads/tavern_helper_template-main/%E5%88%9D%E5%A7%8B%E6%A8%A1%E6%9D%BF/%E8%84%9A%E6%9C%AC/%E9%85%92%E9%A6%86%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/ui/FunctionMenu.vue))

做一个类似“战术指令”的菜单。

```scss
.menu-panel {
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid #444;
  border-left: 4px solid #FFE100; // 左侧醒目黄条
  border-radius: 0;
  box-shadow: 4px 4px 0 rgba(0,0,0,0.5); // 硬阴影
  
  padding: 0; // 去除内边距，让按钮填满
}

.action-grid .btn {
  border: none;
  background: transparent;
  color: #ccc;
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  position: relative;
  
  &:hover {
    background: #FFE100;
    color: #000;
    padding-left: 24px; // 悬停时文字右移
    
    // 悬停时左侧出现小箭头
    &::before {
      content: '▶';
      position: absolute;
      left: 8px;
    }
  }
}
```

### E. 对话气泡 (HUD 风格)

```scss
.chat-bubble {
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #FFE100;
  border-radius: 0;
  color: #fff;
  // 切角
  clip-path: polygon(
    10px 0, 100% 0, 
    100% calc(100% - 10px), 
    calc(100% - 10px) 100%, 
    0 100%, 0 10px
  );
  
  // 装饰线
  &::after {
    content: '';
    position: absolute;
    bottom: -2px; right: 20px;
    width: 30px; height: 4px;
    background: #FFE100;
  }
}
```

---

## 4. 字体建议

要达到这种风格，字体非常关键。建议引入以下 Web Font (如有条件)，或者使用系统备选：

*   **英文字体：** `Oswald`, `Teko`, `Orbitron` (科幻感)
*   **中文字体：** 思源黑体 (Source Han Sans) - Bold / Heavy

## 5. 实现建议

1.  创建一个新的 `ui/styles/theme-arknights.scss` 文件，存放上述 mixin 和变量。
2.  在 [SettingsPanel.vue](file:///c:/Users/P7XXTM1-G/Downloads/tavern_helper_template-main/%E5%88%9D%E5%A7%8B%E6%A8%A1%E6%9D%BF/%E8%84%9A%E6%9C%AC/%E9%85%92%E9%A6%86%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/ui/SettingsPanel.vue) 和 [FunctionMenu.vue](file:///c:/Users/P7XXTM1-G/Downloads/tavern_helper_template-main/%E5%88%9D%E5%A7%8B%E6%A8%A1%E6%9D%BF/%E8%84%9A%E6%9C%AC/%E9%85%92%E9%A6%86%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9/ui/FunctionMenu.vue) 中引入并替换原有样式。
3.  添加一些特定的装饰性 DOM 元素（如 `div.decoration-line`）来增强视觉复杂度。

