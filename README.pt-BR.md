<div align="center">

<img src="web/public/brand/shard-icon.svg" width="88" height="88" alt="Shard logo">

# Shard

**Um estúdio de motion design para vídeo e imagens com IA, no seu próprio computador.**

Planeje um filme, gere as cenas e finalize tudo, por um estúdio web, pelo terminal ou pelo Claude Code e pelo Codex.

[![CI](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml)
[![AlexMakesC0de/shard-motion-design-studio MCP server](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio/badges/score.svg)](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E?logo=node.js&logoColor=white)
![macOS](https://img.shields.io/badge/platform-macOS-555)
![Claude Code | Codex](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20Codex-B4471C)

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Português (Brasil)** · [Deutsch](README.de.md)

<sub>This translation is older than the English README, which is the reference for features, licensing and credits.</sub>

Esta é uma tradução. Em caso de divergência, vale a versão em inglês, [README.md](README.md).

[Início rápido](#início-rápido) · [Créditos](#créditos) · [A CLI](cli/README.md) · [O servidor MCP](mcp/README.md) · [O estúdio](web/README.md)

</div>

---

O Shard nasceu como um fork da **[skill motion-design do Chase](https://github.com/cth9191/motion-design)**, dez estilos de motion lindíssimos com os prompts por trás deles. Muito obrigado, Chase: os looks deste repositório são dele. Tudo o que foi construído em volta é novo. Veja os [Créditos](#créditos).

## O que tem aqui

| Parte | O que faz |
|---|---|
| **Estúdio** (`web/`) | Um app web local: páginas de Imagem e Vídeo, filmes planejados cena por cena, uma Biblioteca de personagens, produtos e lugares, Looks, suas skills, gastos e configurações. |
| **CLI `kie`** (`cli/`) | Gera vídeo, imagens e áudio pela [kie.ai](https://kie.ai) (com a WaveSpeed como reserva), mostra o preço de cada job antes e guarda o registro de cada um. |
| **Servidor MCP** (`mcp/`) | Dá ao Claude Code, ao Codex e ao Claude Desktop as mesmas ferramentas do estúdio, para você fazer filmes só pedindo. |
| **Render e finalização** (`render/`, `cli/`) | Desenha gráficos exatos em código (títulos, logos, números) com o Remotion e finaliza os filmes com o ffmpeg: música, legendas, volume, outras proporções de tela. |
| **Biblioteca de skills** (`skills/`) | Suas skills de agente favoritas, cada uma usável como `/slash-command`, como prompt MCP e no estúdio. `motion-design` guarda os looks. |

**Os gastos são protegidos em todo lugar.** Todo job pago tem o preço calculado antes de ser enviado e é checado contra um limite diário e um limite opcional por job, venha ele do estúdio, da CLI ou de um agente. Consultar, planejar e calcular preços é de graça.

## Início rápido

Você precisa do **Node 22+** e de uma **chave de API da kie.ai**. O ffmpeg só é necessário para finalizar, e o Python 3.10+ só para reconstruir a galeria de looks.

1. **Baixe o código e instale as ferramentas.** O instalador coloca o `kie` no seu PATH, liga as skills ao Claude Code, ao Codex e ao Kimi quando estiverem instalados, e registra o servidor MCP.

   ```bash
   git clone https://github.com/AlexMakesC0de/shard-motion-design-studio.git
   cd shard-motion-design-studio
   node install.mjs            # --dry-run mostra antes o que ele mudaria
   ```

2. **Adicione sua chave da kie.ai**, legível só por você, e depois confira a configuração. O `kie doctor` faz uma consulta de saldo gratuita e não gera nada.

   ```bash
   mkdir -p ~/.config/kie
   printf '%s' 'YOUR_KIE_KEY' > ~/.config/kie/key && chmod 600 ~/.config/kie/key
   kie doctor
   ```

3. **Defina um orçamento.** Por exemplo, no máximo US$ 25 por dia e US$ 2 por job:

   ```bash
   kie limits --daily 25 --per-job 2
   ```

4. **Abra o estúdio.** Ele roda em http://127.0.0.1:4317 e só responde à sua própria máquina.

   ```bash
   npm --prefix web install
   npm run studio
   ```

5. **Ou peça a um agente.** Reinicie o Claude Code ou o Codex e experimente: *"Planeje um filme de produto de 15 segundos para o meu app, mostre o preço e não gere nada ainda."* A página MCP do estúdio tem o comando de configuração exato para cada app.

## Faça algo pelo terminal

```bash
kie presets                                        # the ten looks
kie preflight --model seedance-2-5 --duration 10   # what a job would cost, without spending
kie video    --run launch --preset kinetic-typography --duration 10
kie render   --run launch --template logo-reveal --props brand.json
kie assemble --run launch --shot out.mp4 --shot logo-reveal.mp4 --transition fade:0.5
kie variants --run launch --video film.mp4 --ratios 9:16,1:1
```

O vídeo gerado é fotográfico: ele inventa pixels plausíveis. Tudo o que precisa estar exatamente certo, como um título, um logo ou um preço, é melhor desenhar com `kie render` e colocar por cima do filme. O [graphic-motion.md](skills/motion-design/references/graphic-motion.md) explica quando usar cada um.

Seus filmes, takes e registros de gastos ficam em `runs/`, e as referências salvas em `library/`. Os dois são ignorados pelo git.

## Os looks

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

## Créditos

- **Chase ([@cth9191](https://github.com/cth9191))** criou a skill [motion-design](https://github.com/cth9191/motion-design) original da qual este projeto nasceu: os dez looks, seus prompts de origem, os guias de adaptação e templates, a galeria reproduzível, as imagens de prévia e o logotipo "Motion Design". Obrigado, Chase. Se você gostou dos looks, vá dar uma estrela no repositório dele.
- Os prompts de origem apareceram primeiro em um [artigo sobre o Higgsfield Marketing Studio](https://higgsfield.ai/@adilinthewildtempo/blogs/claude-fable-5-1-higgsfield-marketing-studio-300-day).
- Os ícones de marca do Claude e da OpenAI na página MCP vêm do [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT).

O [ATTRIBUTION.md](ATTRIBUTION.md) lista exatamente quais arquivos vieram do repositório do Chase.

## Licença

Tudo o que eu escrevi está sob a [licença MIT](LICENSE): o estúdio, a CLI `kie`, o servidor MCP, os motores de render e finalização, o instalador, os guias de direção, os testes e a documentação.

Os looks e os demais arquivos do repositório do Chase **não** são cobertos pela licença MIT. Eles são dele, compartilhados aqui com crédito, e o repositório dele não tem licença própria. O [ATTRIBUTION.md](ATTRIBUTION.md) os lista.

## Testes

```bash
npm test             # CLI
npm run test:mcp     # MCP server
npm run test:web     # studio
npm run validate     # the looks: source hashes, templates and gallery
```
