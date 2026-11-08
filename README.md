# 百科导航

一个给日常使用的中文网址导航。页面、样式和脚本都是普通文件，没有构建步骤，也没有后端。推到 GitHub 仓库的 `main` 分支后，由 GitHub Pages 从仓库根目录发布。

线上地址：[https://yuelin-codes.github.io/](https://yuelin-codes.github.io/)

现在收录的是一批常用、公开的网站，分在六个栏目里：常用工具、开发者、AI 工具、学习资料、设计素材、影音娱乐。链接都可以在管理页里改。

## 文件结构

```text
index.html            前台目录
admin.html            浏览器里的编辑器
404.html              找不到页面时的提示（GitHub Pages 会用它）
.nojekyll             让 Pages 按原文件发布，不经过 Jekyll
robots.txt            允许搜索引擎收录
favicon.svg           矢量图标
favicon.ico           兼容用图标
assets/css/style.css  前台样式
assets/css/admin.css  编辑器样式
assets/js/model.js    读取和整理数据
assets/js/app.js      前台逻辑
assets/js/admin.js    编辑器逻辑，口令也写在这里
assets/img/mark.svg   备用图形
data/sites.json       全部站点内容
```

样式、脚本和 `data/sites.json` 都用相对路径，站点放在域名根目录即可。`404.html` 里有一行 `<base href="/">`，这样访客打开一个不存在的深层地址时，样式和「返回首页」仍然指向网站根。

## 本地预览

不要直接双击 `index.html`。在项目目录里起一个静态服务：

```bash
python3 -m http.server 8741
```

然后访问：

- 前台：<http://127.0.0.1:8741/>
- 编辑器：<http://127.0.0.1:8741/admin.html>
- 找不到页面：<http://127.0.0.1:8741/404.html>

## 修改内容

### 用管理页

1. 打开 `admin.html`。
2. 修改站点标题、分类、链接、友情链接和左右公告位。
3. 点「预览草稿」看效果。草稿只存在这台浏览器里。
4. 点「导出 sites.json」（或按 Ctrl+S / ⌘S）下载新文件。
5. 用它覆盖仓库里的 `data/sites.json`，提交并推送到 `main`。

「导入 JSON」可以把以前导出的文件读回编辑器。编辑器不会自己写回仓库。

分类、子分类、链接和友链可以用上移、下移调整顺序。两个公告位可以用「左右对调」。取消「显示」，或者标题、文字、图片都空着，前台就不渲染那一列；屏幕较窄时，这两列也会隐藏。

| 字段 | 说明 |
| --- | --- |
| 名称 | 卡片标题 |
| 地址 | 建议写完整的 `https://`。只写域名时，前台会补上 `https://` |
| 图标地址 | 可留空。留空时用名称的第一个字。图片懒加载，地址失效就退回文字 |
| 简介 | 短说明，卡片里大约两行 |
| 标签 | 用逗号分隔。站内搜索会匹配名称、简介和标签 |

### 直接改 data/sites.json

文件是 UTF-8、无 BOM 的 JSON。改完保存，提交到 `main` 即可。结构：

```json
{
  "site": {
    "title": "百科导航",
    "subtitle": "常用网站，随手打开",
    "description": "首页导语，也会写进页面描述。",
    "footerNote": "页脚说明。"
  },
  "categories": [
    {
      "id": "tools",
      "name": "常用工具",
      "blurb": "分类下面的一句说明。",
      "links": [
        {
          "name": "维基百科",
          "url": "https://zh.wikipedia.org",
          "icon": "",
          "description": "开放的中文百科全书。",
          "tags": ["百科"]
        }
      ],
      "subcategories": []
    }
  ],
  "friends": [
    { "name": "MDN Web Docs", "url": "https://developer.mozilla.org/zh-CN/", "description": "Web 文档" }
  ],
  "ads": {
    "left": { "enabled": false, "title": "", "text": "", "image": "", "url": "" },
    "right": { "enabled": false, "title": "", "text": "", "image": "", "url": "" }
  }
}
```

`id` 用在页内锚点上，同一份文件里不要重复。

### 管理口令

`assets/js/admin.js` 靠近顶部：

```js
var ADMIN_PASSPHRASE = "";
```

留空表示不询问口令。要启用就写成你自己的字符串，不要包含未转义的英文双引号或反斜杠，然后把这个文件一起提交。

这不是安全措施。口令以明文写在脚本里，任何人查看源码都能绕过，也能直接改 `data/sites.json`。它只能挡住随手点开编辑页的人。

同一标签页里通过一次之后，会暂时记在 `sessionStorage`，关掉标签页就失效。

## 前台功能

- 宽屏左侧是分类菜单，窄屏变成顶部横滑条。点击会平滑滚动，当前分类会高亮。
- 搜索框边打边筛名称、简介和标签。回车或点「外部搜索」，用右侧引擎打开新标签页。可选 Google、Bing、百度、DuckDuckGo，选择记在 `localStorage`（键名 `baike-engine`）。
- 右上角切换深色 / 浅色，记在 `baike-theme`。
- 页脚是友情链接。滚动后右下角出现「回到顶部」。

## 部署到 GitHub Pages

仓库是 `yuelin-codes/yuelin-codes.github.io`，页面从 `main` 分支的根目录发布。

1. 把站点文件放在仓库根目录（不要再套一层文件夹），并保留空的 `.nojekyll`。
2. 推送到 `main`。
3. 打开仓库的 Settings → Pages。
4. Build and deployment 里，Source 选 **Deploy from a branch**。
5. Branch 选 **main**，Folder 选 **/ (root)**，保存。
6. 等一分钟左右，打开 [https://yuelin-codes.github.io/](https://yuelin-codes.github.io/)。

之后每次把更新推到 `main`，Pages 会重新发布。如果刚改完 `data/sites.json` 却还是旧内容，强制刷新一次。

本地的 `python3 -m http.server` 不会像 GitHub 那样用 `404.html` 接住任意错误地址。要看这个页面，直接打开 `/404.html`。

## 许可

MIT，见 [LICENSE](LICENSE)。
