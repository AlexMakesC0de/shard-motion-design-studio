<div align="center">

<img src="web/public/brand/shard-icon.svg" width="88" height="88" alt="Shard logo">

# Shard

**一个在你自己电脑上运行的 AI 视频与图像动态设计工作室。**

规划影片、生成分镜画面并完成成片，可以在网页工作室、终端里，或通过 Claude Code 和 Codex 来完成。

[![CI](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml)
[![AlexMakesC0de/shard-motion-design-studio MCP server](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio/badges/score.svg)](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E?logo=node.js&logoColor=white)
![macOS](https://img.shields.io/badge/platform-macOS-555)
![Claude Code | Codex](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20Codex-B4471C)

[English](README.md) · **简体中文** · [Español](README.es.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md) · [Deutsch](README.de.md)

<sub>This translation is older than the English README, which is the reference for features, licensing and credits.</sub>

这是一份翻译。如与英文版有出入，以 [README.md](README.md) 为准。

[快速开始](#快速开始) · [致谢](#致谢) · [命令行工具](cli/README.md) · [MCP 服务器](mcp/README.md) · [工作室](web/README.md)

</div>

---

Shard 最初是 **[Chase 的 motion-design skill](https://github.com/cth9191/motion-design)** 的一个分支，里面有十种好看的动态风格和它们背后的提示词。非常感谢 Chase：这个仓库里的这些风格都出自他之手，围绕它们搭建的其余部分则是全新的。详见[致谢](#致谢)。

## 里面有什么

| 部分 | 作用 |
|---|---|
| **工作室**（`web/`） | 本地网页应用：图像页和视频页、按分镜逐场景规划的影片、存放角色/产品/场景的资料库、Looks（风格）、你的 skills、花费与设置。 |
| **`kie` 命令行**（`cli/`） | 通过 [kie.ai](https://kie.ai) 生成视频、图像和音频（WaveSpeed 作为备用），每个任务先报价，并为每个任务留下记录。 |
| **MCP 服务器**（`mcp/`） | 让 Claude Code、Codex 和 Claude Desktop 使用与工作室相同的工具，你只要开口，就能做出影片。 |
| **渲染与成片**（`render/`、`cli/`） | 用 Remotion 以代码精确绘制图形（标题、标志、数字），再用 ffmpeg 完成成片：配乐、字幕、响度、其他画面比例。 |
| **Skill 库**（`skills/`） | 你喜欢的 agent skills，每个都可以当作 `/slash-command`、MCP prompt，也能在工作室里使用。`motion-design` 里放的就是这些 looks。 |

**每一处都有花费保护。** 每个付费任务在发出前都会先报价，并对照每日上限和可选的单任务上限进行检查，不论它来自工作室、命令行还是 agent。查询、规划和报价都是免费的。

## 快速开始

你需要 **Node 22+** 和一个 **kie.ai API key**。只有在成片时才需要 ffmpeg，只有重新生成 looks 图库时才需要 Python 3.10+。

1. **获取代码并安装工具。** 安装程序会把 `kie` 放进你的 PATH，在已安装 Claude Code、Codex 和 Kimi 时把 skills 链接进去，并注册 MCP 服务器。

   ```bash
   git clone https://github.com/AlexMakesC0de/shard-motion-design-studio.git
   cd shard-motion-design-studio
   node install.mjs            # --dry-run shows what it would change first
   ```

2. **添加你的 kie.ai key**，只有你自己可读，然后检查配置。`kie doctor` 会发出一次免费的余额查询，不会生成任何内容。

   ```bash
   mkdir -p ~/.config/kie
   printf '%s' 'YOUR_KIE_KEY' > ~/.config/kie/key && chmod 600 ~/.config/kie/key
   kie doctor
   ```

3. **设定预算。** 比如每天最多 25 美元，每个任务最多 2 美元：

   ```bash
   kie limits --daily 25 --per-job 2
   ```

4. **打开工作室。** 它运行在 http://127.0.0.1:4317，只响应你自己的这台电脑。

   ```bash
   npm --prefix web install
   npm run studio
   ```

5. **或者直接问 agent。** 重启 Claude Code 或 Codex，试试：*“为我的 app 规划一支 15 秒的产品影片，告诉我价格，先不要生成任何东西。”* 工作室里的 MCP 页面写有每个应用的具体设置命令。

## 在终端里做点东西

```bash
kie presets                                        # the ten looks
kie preflight --model seedance-2-5 --duration 10   # what a job would cost, without spending
kie video    --run launch --preset kinetic-typography --duration 10
kie render   --run launch --template logo-reveal --props brand.json
kie assemble --run launch --shot out.mp4 --shot logo-reveal.mp4 --transition fade:0.5
kie variants --run launch --video film.mp4 --ratios 9:16,1:1
```

生成的视频是照片式的：它会编造出看似合理的像素。凡是必须一字不差的内容，比如标题、标志或价格，最好用 `kie render` 绘制，再叠加到影片上。什么时候用哪一个，[graphic-motion.md](skills/motion-design/references/graphic-motion.md) 里有说明。

你的影片、各次生成结果和花费记录都保存在 `runs/`，保存的参考素材在 `library/`。这两个目录都被 git 忽略。

## 风格（The looks）

<table>
  <tr>
    <td width="16%" valign="top"><img src="docs/images/looks/golden-hour-drama.jpg" alt="Golden hour drama look preview" width="160"><br><sub>Golden hour drama</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/neo-noir.jpg" alt="Neo-noir night look preview" width="160"><br><sub>Neo-noir night</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/epic-scale.jpg" alt="Epic scale look preview" width="160"><br><sub>Epic scale</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/studio-hero.jpg" alt="Studio hero look preview" width="160"><br><sub>Studio hero</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/clean-tech.jpg" alt="Clean tech look preview" width="160"><br><sub>Clean tech</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/appetite-macro.jpg" alt="Appetite macro look preview" width="160"><br><sub>Appetite macro</sub></td>
  </tr>
  <tr>
    <td width="16%" valign="top"><img src="docs/images/looks/hyper-promo.jpg" alt="Hyper promo look preview" width="160"><br><sub>Hyper promo</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/phone-selfie.jpg" alt="Phone selfie look preview" width="160"><br><sub>Phone selfie</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/sunny-lifestyle.jpg" alt="Sunny lifestyle look preview" width="160"><br><sub>Sunny lifestyle</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/verite.jpg" alt="Vérité look preview" width="160"><br><sub>Vérité</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/fashion-editorial.jpg" alt="Fashion editorial look preview" width="160"><br><sub>Fashion editorial</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/intimate-portrait.jpg" alt="Intimate portrait look preview" width="160"><br><sub>Intimate portrait</sub></td>
  </tr>
  <tr>
    <td width="16%" valign="top"><img src="docs/images/looks/claymation.jpg" alt="Claymation look preview" width="160"><br><sub>Claymation</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/anime-cel.jpg" alt="Anime cel look preview" width="160"><br><sub>Anime cel</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/soft-3d-toon.jpg" alt="Soft 3D toon look preview" width="160"><br><sub>Soft 3D toon</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/vintage-16mm.jpg" alt="Vintage 16mm look preview" width="160"><br><sub>Vintage 16mm</sub></td>
    <td width="16%" valign="top"><img src="docs/images/looks/retro-camcorder.jpg" alt="Retro camcorder look preview" width="160"><br><sub>Retro camcorder</sub></td>
  </tr>
</table>

<sub>The 17 Looks made for Shard (`kie looks`). The ten Ad templates from Chase's original skill are listed by `kie presets`; see the <a href="README.md#the-looks">English README</a>.</sub>

## 致谢

- **Chase（[@cth9191](https://github.com/cth9191)）** 制作了最初的 [motion-design](https://github.com/cth9191/motion-design) skill，本项目正是由它发展而来：十种风格、它们的源提示词、改编指南和模板、可播放的图库、预览静帧，以及 “Motion Design” 字标。谢谢你，Chase。如果你喜欢这些风格，请去给他的仓库点个 star。
- 源提示词最早出现在一篇 [Higgsfield Marketing Studio 文章](https://higgsfield.ai/@adilinthewildtempo/blogs/claude-fable-5-1-higgsfield-marketing-studio-300-day)中。
- MCP 页面上 Claude 和 OpenAI 的品牌图标来自 [LobeHub Icons](https://github.com/lobehub/lobe-icons)（MIT）。

[ATTRIBUTION.md](ATTRIBUTION.md) 准确列出了哪些文件来自 Chase 的仓库。

## 许可

我写的所有内容都采用 [MIT 许可证](LICENSE)：工作室、`kie` 命令行、MCP 服务器、渲染与成片引擎、安装程序、导演指南、测试和文档。

这些 looks 以及来自 Chase 仓库的其他文件**不**在 MIT 许可证的范围内。它们属于他，在此注明出处后分享，而他的仓库本身没有许可证。具体清单见 [ATTRIBUTION.md](ATTRIBUTION.md)。

## 测试

```bash
npm test             # CLI
npm run test:mcp     # MCP server
npm run test:web     # studio
npm run validate     # the looks: source hashes, templates and gallery
```
