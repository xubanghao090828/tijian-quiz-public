# Perspective Card Deck Shuffle

独立的四卡堆动画原型。原生 HTML、CSS、ES modules、Web Animations API；没有构建步骤、第三方运行依赖、远程资源或学习记录读写。正式刷题页面与 APK 未改动。

## 直接选择中间卡片（第四版）

点露出的中间卡片标题区域，直接将那张卡片抽到最前面，一次 700 ms 动作完成，不通过连续播放下一张来跳转。例如 `A B C D` 中点 C，结果为 `C A B D`，其他卡片相对顺序保留，D 保持原来的最后一层。

只有选中卡前面的卡片各退一层；更深的卡片保持原位。选中卡先向下抽离，在完全无遮挡处提层，然后放大回弹。标题露出区有独立透明可访问按钮，支持触摸与 Enter；动画期间隐藏点击区，避免点到过期位置。拖动露出区仍按上下滑动处理，松手的合成点击不会再选择另一张。

程序接口为 `await deck.select('C')`；选择当前前卡不播放动画。运行中再次选择时，最多保留一个最新目标，并在落定后按卡片身份解析目标。测试结果见 `select-verification.json`。

## 上下滑动（第三版：修复上一张起步停顿）

卡片上**上滑下一张、下滑上一张**，默认关闭自动演示，进入后可直接操作。拖动先锁定纵向意图，卡堆跟随手指给出轻微弹性位移，原生时间线预览最多到交层点之前；松手结合距离与最近 80 ms 的速度决定完成或撤销。下滑使用独立的正向时间轨迹：当前前卡立即向下抽离，在无遮挡处降到后层，再缩小回到后方；回到真正的上一张，保持四层顺序可逆。

参考 [Motion 拖拽方向锁定与取消](https://motion.dev/docs/react-use-drag-controls) 和 [use-gesture 距离、速度阈值及 rubberband](https://use-gesture.netlify.app/docs/options/) 的原理；没有引入 React 或手势依赖。实现采用 Pointer Events 与原生动画控制，手势识别独立于动画和内容。

- 8 px 意图阈值；水平意图忽略，未达切换阈值回弹。快速轻甩可使用速度触发。
- 同一次手势方向锁定，拖回起点会撤销；指针取消、第二根手指、窗口失焦安全回弹。
- 只有卡片区域保留纵向触摸，卡片外页面正常滚动；不再通过轻点卡片切换，避免拖动后的合成 click 重复执行。
- 当前动画运行时的新手势最多排队一次，待办采用最新方向；键盘上/下键与上一张/下一张按钮等价。
- [真实触摸录像](playback.html) 含触点指示；`?touch=1` 可显示演示触点。
- 新增 `deck-gestures.js`，用 `new DeckGestures(deck)` 接入，卸载时先调用 `gestures.destroy()`，再调用 `deck.destroy()`。
- 新增 `deck.next()`、`deck.previous()`、`deck.shuffle(-1)`；旧的 `shuffle()` 仍然向下一张切换。

`gesture-verification.json` 记录真实触摸、反向循环、速度触发、撤销、多指取消和区域外滚动的验证。主动画的性能与原循环回归仍见 `verification.json`。

运行：在本目录执行 `python -m http.server 4180 --bind 127.0.0.1`，打开 `http://127.0.0.1:4180/`。默认可手势操作，`?autoplay=1` 开启自动演示。浏览器须支持 WAAPI 和 ResizeObserver；当前项目使用的 Android System WebView / Chromium 支持这些能力。

### 上一张的修正

旧版直接倒放下一张的弹簧，起步前约 100 ms 位移不足 1 px，后段突然加速。第三版为上一张单独建立 `previousPoseAt`，完整返回动作始终使用正播放速率；前卡先下移、完全抽离后降层，再缩回后方。下拉预览幅度也减小，使全尺寸前卡更贴近手指。单独的响应时序、正播放速率、无遮挡降层和压力数据见 `previous-verification.json`。

## 调研与选择（2026-11-19）

| 候选 | 当前情况 | 可参考之处 | 不采用的部分 |
| --- | --- | --- | --- |
| [Appllama/animated-card-stack](https://github.com/Appllama/animated-card-stack) | MIT；7 stars；最后推送 2026-08-17，规模小、专用演示 | `motion.ts` 的纯轨迹数据、四层身份与顺序分离、可确定检查的进度和层级交接 | 原版是前卡横向扇出后退；固定 1240 逻辑画布、WebGL、旋转、玻璃与品牌素材均不适合本需求 |
| [mirayavandiepen/hero-card-stack](https://github.com/mirayavandiepen/hero-card-stack) | 11 stars；最后推送 2026-03-19；未声明许可证 | `time-machine.tsx` 展示每层缩小 8%、向上露边，以及物理弹簧的设计原则 | 不复制代码；滚动映射、React 19 / Motion / Tailwind、模糊与淡出不能满足底部抽卡验收 |
| [HyperFrames spring-stack-shuffle](https://github.com/heygen-com/hyperframes/tree/main/registry/components/spring-stack-shuffle) | 仓库 Apache-2.0；86,533 stars；2026-11-19 仍维护；Star 数针对整个仓库 | 后卡升前、其他卡退层、轨迹分段、带初速度的 Hermite 重定向、落地缓冲 | 原版后卡向上带侧移、切换开始即提层；GSAP、视频时间线与整套运行时不移植 |

GitHub API 与对应源码逐一核对；星数仅记录调研时状态，未据此认定质量。第三个项目工程维护更完整，但整体直接移植会增加依赖与改造成本。选择从零编写小型原生控制器，借鉴上述原理，不包含它们的代码或资产，不需要引入其运行依赖或传播许可证；原仓库各自许可证义务仍适用于未来直接复用的代码。当前项目已有 WAAPI 能力，直接复用整个组件反而需要框架/时间线适配，自研此范围的控制器更容易维护和验证。

## 运动约定

- 四张水平卡片，共享正中心轴，不使用 rotateX、rotateY、横向位移、模糊或淡入淡出。
- 默认前后比例 `1.00 / 0.92 / 0.84 / 0.76`，向上露边 22 px，正面居中观察。
- 前 38% 时间：最后方卡片保持其小尺寸向下抽出，直到其上沿低于其余卡片的全部下沿。
- 在完全不相交处提到前层。z-index 使用与 transform 同起点、同时长的原生时间线和离散 keyframe，避免 JS 定时器延迟造成错层。
- 后 62%：小卡逐渐放大，沿中心轴向上弹回。归一化阻尼弹簧带轻微过冲，尾部平滑归零；其余卡片同时退一层，落地时有极小压缩。
- 结束时写入新稳定姿态，再撤掉原生 fill effect；四个 DOM 节点不重建、不重新插入。顺序只在完整落地时提交。
- 初始前后顺序 A B C D；每次最后一张升到最前：D A B C、C D A B、B C D A、A B C D。

## 使用

```js
import { PerspectiveCardDeck } from './perspective-deck.js';

const deck = new PerspectiveCardDeck(document.querySelector('#deck'), {
  cards: [{id:'a'}, {id:'b'}, {id:'c'}, {id:'d'}],
  renderCard(card) {
    const content = document.createElement('div');
    content.textContent = card.id;
    return content;
  },
  gap: 22,
  scaleStep: 0.08,
  duration: 700,
  elasticity: 0.55
});

await deck.shuffle();
deck.pause();
deck.resume();
deck.configure({duration: 950});
deck.seek(0.38);       // 原生时间线暂停在抽离点，供检查
deck.resume();
deck.cancelQueued();  // 取消等待中的切换，当前动作完整落定
deck.reset();         // 明确的立即重置操作；不用于切题
deck.destroy();
```

`renderCard` 返回 Node；内容、`order` 身份数组、纯几何 `poseAt`、动画运行实例彼此分离。渲染外部数据时应使用 `textContent` 或调用方自己的安全模板。

快速点击采用“当前动作 + 最多一个待办”的合并策略；相同待办返回相同 Promise，避免长队列。不在遮挡过程中强行重定向另一张卡片。中断可原位暂停/继续，取消排队后当前动作仍完整落定；只有显式 reset 立即回到初始堆叠。页面隐藏时自动暂停，恢复可见后继续；卸载取消所有原生动画及监听器。

窗口缩放时保留归一化动画进度，在相同位置建立新尺寸轨迹，再移除旧动画，不提交或重复循环。动画期间修改参数推迟到落定后生效。普通播放只改变 transform，加一次不相交处的离散层级切换；没有每帧布局读写、透明度动画和模糊。演示的进度标签采样独立于组件运行。

## 文件

- `perspective-deck.js`：可复用组件与纯轨迹函数。
- `perspective-deck.css`：仅 `pcd-*` 样式。
- `demo.js`、`demo.css`、`index.html`：独立示例内容与控制面板。
- `verification.json`、`verification.md`：实际浏览器测量与验证结果（生成后提供）。

桌面测试的帧数据不能替代荣耀实体机结果；当前原型不声称已在荣耀 WIN RT 上达到稳定 60 FPS。
