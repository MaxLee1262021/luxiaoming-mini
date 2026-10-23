# PPT 反馈修复处理事项报告

## 修复范围

- 反馈来源：`D:/我的文档/Documents/xwechat_files/wxid_sed77jd9sryd22_20f5/msg/file/2026-10/演示文稿1(4).pptx`
- 实际修改项目：`D:/idea/travel-photo/luxiaoming_交付包`
- 当前分支：`main`
- 基线提交：`d21e415`

接口地址已统一为 `https://www.cslxm.cn/api`。开发版默认地址、生产地址默认值、线上私有配置示例和交接说明均已同步，RPC 请求实际访问 `https://www.cslxm.cn/api/rpc/{name}`。

针对本次“内外描述需统一”反馈，已补齐照片单品的真实样片数量：后台首页/预约摘要按启用样片统计并返回 `photoCount`，前端首页卡片、预约数据和详情页统一使用该字段。后台源码已同步修改：`D:/idea/travel-photo/luxiaoming-admin-linux-20261018-current/server/lib/rpc.cjs` 和 `.../luxiaoming-admin-linux-20261018-updater-r2/server/lib/rpc.cjs`；后台部署后首页与详情的数量口径一致。前端在后台尚未部署时也会调用详情接口补齐首页摘要。

按后续界面反馈，首页 Banner 下方的快捷入口整行（全部套餐、城市攻略、旅拍周边、我的订单）已移除，特色专区直接承接 Banner。

本次先将交付包此前未提交工作区保存为 Git stash `backup-before-ppt-rework-delivery-package`，再从基线重新对照 PPT 修改。误改的 `原型文件/luxiaoming` 已恢复为 clean，原有改动保存在 stash `backup-before-ppt-rework-wrong-project` 中。

| 项项 | PPT 反馈 | 修复处理 | 主要文件 |
| --- | --- | --- | --- |
| S1 | 首页不显示城市切换，搜索框上滑后收缩到顶部 | 基线已实现首页无城市控件；首页固定页头在滚动超过 104px 后进入紧凑态，回到 60px 以下恢复，搜索框保留在顶部。 | `miniprogram/pages/index/index.{wxml,js,wxss}` |
| S2 | 热榜按数字、图片、名称排列，点选后在照片留影旁显示点位名称 | 保留基线热榜和点位过滤逻辑；放宽照片留影区外层条件，使所选点暂无照片时仍显示“照片留影”和当前点位名称，同时展示空态提示。 | `miniprogram/pages/index/index.wxml` |
| S3 | 商品卡片规整，照片留影/视频主推标签放左上，套餐卡片不遮挡 | 保留基线的覆盖式照片类型标签、视频营销标签和 480rpx 套餐卡；首页横滑容器使用 540rpx 高度，为卡片和阴影保留空间。 | `miniprogram/components/lxm-album-card/*`、`lxm-video-card/*`、`lxm-package-card/*`、`pages/index/index.wxss` |
| S4 | 取消“查看完整样片”按钮，缩略图横滑，大图全屏，增加相关推荐 | 单张封面图补充 `previewCollection` 点击预览；样片画廊保留大图点击和缩略图横滑，移除旧的预览提示层；保留相关推荐横滑，并在当前单品不在集合列表时回退使用当前单品数据。 | `miniprogram/pages/photoCollection/*`、`components/lxm-sample-gallery/lxm-sample-gallery.wxml` |
| S5 | 视频详情顶部增加大屏视频预览 | 顶部 660rpx `hero-swiper` 在存在视频地址时使用带 poster 的 `video`，无地址时回退封面图；点击仍调用媒体预览。 | `miniprogram/pages/videoProductDetail/videoProductDetail.wxml` |
| S6 | 套餐详情不展示精修、拍摄时长、服装等规格，去掉套餐服务入口，套餐包含商品可点击 | 删除套餐描述/服务标签、套餐服务区、商品规格摘要和拍摄说明组件；保留商品名称、价格及 `goIncludedItem` 跳转。同步删除规格解析逻辑，避免再次生成分钟、精修、底片文案。 | `miniprogram/pages/photoPackageDetail/*`、`miniprogram/service/packageDetail.js` |
| S7 | 打卡点详情商品卡片不能被遮挡 | 套餐横滑区高度调整为 520rpx，卡片顶部对齐；所有横滑区增加右侧安全间距，为卡片阴影留出空间。 | `miniprogram/pages/spotSheet/spotSheet.wxss` |
| S8 | 大图、热度标签、立即定制和风格标签按参考图呈现 | 保留 330rpx 圆角大图和图片左上热度标签；将风格标签放到标题下的独立行，描述继续放在大图下；约拍组件默认文案为“立即定制”。 | `miniprogram/pages/spotSheet/spotSheet.{wxml,wxss}`、`components/lxm-custom-booking-card/lxm-custom-booking-card.js` |
| S9 | 拍摄时间可选择具体时间 | 预约页新增日期 picker 和具体时间 picker；校验日期/时间成对填写；提交 payload 写入 `date` 和 `timePeriod`，预约成功页同步带上这两个字段。 | `miniprogram/pages/bookingInfo/{bookingInfo.js,bookingInfo.wxml,bookingInfo.wxss}`、`miniprogram/utils/booking.js` |
| S10 | 减少平面感，增加悬浮和阴影 | 保留并验证基线设计令牌、卡片阴影、吸底栏阴影和 `lxm-card-lift` 悬浮反馈；本次重点确保套餐横滑容器不会裁掉阴影。 | `miniprogram/app.wxss`、各卡片与页面 wxss |

## 验证结果

- PPT 反馈专项审计：`tools/test-ppt-feedback.cjs`，10/10 项通过。
- JavaScript 语法检查：`tools/test-js-syntax.cjs`，94 个文件通过。
- 套餐包含商品目标数据检查：`tools/test-included-item-targets.cjs`，4 个商品目标通过。
- 预约日期/时间 payload 检查：`tools/test-booking-date-time.cjs` 通过。
- 小程序架构检查退出码为 0；保留既有复杂度提示。
- `git diff --check` 通过，仅有 Git 的 LF/CRLF 警告。
- 当前未安装微信开发者工具，因此 S3、S7 的最终视觉效果仍需在微信开发者工具或真机上复核。
