<div align="center">

<img src="web/public/brand/shard-icon.svg" width="88" height="88" alt="Shard logo">

# Shard

**Un estudio de motion design para vídeo e imágenes con IA, en tu propio ordenador.**

Planifica una película, genera sus escenas y termínala desde un estudio web, la terminal, o Claude Code y Codex.

[![CI](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml)
[![AlexMakesC0de/shard-motion-design-studio MCP server](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio/badges/score.svg)](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E?logo=node.js&logoColor=white)
![macOS](https://img.shields.io/badge/platform-macOS-555)
![Claude Code | Codex](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20Codex-B4471C)

[English](README.md) · [简体中文](README.zh-CN.md) · **Español** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md) · [Deutsch](README.de.md)

<sub>This translation is older than the English README, which is the reference for features, licensing and credits.</sub>

Esto es una traducción. Si difiere de la versión en inglés, la que cuenta es [README.md](README.md).

[Inicio rápido](#inicio-rápido) · [Créditos](#créditos) · [La CLI](cli/README.md) · [El servidor MCP](mcp/README.md) · [El estudio](web/README.md)

</div>

---

Shard nació como un fork de la **[skill motion-design de Chase](https://github.com/cth9191/motion-design)**, diez estilos de motion con muy buen aspecto y los prompts que hay detrás. Muchísimas gracias a Chase: los looks de este repositorio son suyos. Todo lo que está construido a su alrededor es nuevo. Mira los [Créditos](#créditos).

## Qué incluye

| Parte | Qué hace |
|---|---|
| **Estudio** (`web/`) | Una app web local: páginas de Imagen y Vídeo, películas planificadas escena por escena, una Biblioteca de personajes, productos y lugares, Looks, tus skills, gastos y ajustes. |
| **CLI `kie`** (`cli/`) | Genera vídeo, imágenes y audio con [kie.ai](https://kie.ai) (con WaveSpeed como alternativa), calcula el precio de cada trabajo antes de lanzarlo y guarda un registro de cada uno. |
| **Servidor MCP** (`mcp/`) | Da a Claude Code, Codex y Claude Desktop las mismas herramientas que el estudio, para que puedas hacer películas simplemente pidiéndolo. |
| **Render y acabado** (`render/`, `cli/`) | Dibuja con código los gráficos que tienen que ser exactos (títulos, logotipos, cifras) con Remotion, y termina las películas con ffmpeg: música, subtítulos, volumen, otras relaciones de aspecto. |
| **Biblioteca de skills** (`skills/`) | Tus skills de agente favoritas, cada una utilizable como `/slash-command`, como prompt MCP y en el estudio. `motion-design` contiene los looks. |

**El gasto está protegido en todas partes.** Cada trabajo de pago se presupuesta antes de enviarse y se comprueba contra un límite diario y un límite opcional por trabajo, venga del estudio, de la CLI o de un agente. Consultar, planificar y calcular precios es gratis.

## Inicio rápido

Necesitas **Node 22+** y una **clave de API de kie.ai**. ffmpeg solo hace falta para el acabado, y Python 3.10+ solo para reconstruir la galería de looks.

1. **Descarga el código e instala las herramientas.** El instalador añade `kie` a tu PATH, enlaza las skills con Claude Code, Codex y Kimi si están instalados, y registra el servidor MCP.

   ```bash
   git clone https://github.com/AlexMakesC0de/shard-motion-design-studio.git
   cd shard-motion-design-studio
   node install.mjs            # --dry-run shows what it would change first
   ```

2. **Añade tu clave de kie.ai**, legible solo por ti, y comprueba la configuración. `kie doctor` hace una consulta de saldo gratuita y no genera nada.

   ```bash
   mkdir -p ~/.config/kie
   printf '%s' 'YOUR_KIE_KEY' > ~/.config/kie/key && chmod 600 ~/.config/kie/key
   kie doctor
   ```

3. **Fija un presupuesto.** Por ejemplo, como máximo 25 USD al día y 2 USD por trabajo:

   ```bash
   kie limits --daily 25 --per-job 2
   ```

4. **Abre el estudio.** Funciona en http://127.0.0.1:4317 y solo responde a tu propio equipo.

   ```bash
   npm --prefix web install
   npm run studio
   ```

5. **O pídeselo a un agente.** Reinicia Claude Code o Codex y prueba: *"Planifica una película de producto de 15 segundos para mi app, enséñame el precio y no generes nada todavía."* La página MCP del estudio tiene el comando de configuración exacto para cada app.

## Haz algo desde la terminal

```bash
kie presets                                        # the ten looks
kie preflight --model seedance-2-5 --duration 10   # what a job would cost, without spending
kie video    --run launch --preset kinetic-typography --duration 10
kie render   --run launch --template logo-reveal --props brand.json
kie assemble --run launch --shot out.mp4 --shot logo-reveal.mp4 --transition fade:0.5
kie variants --run launch --video film.mp4 --ratios 9:16,1:1
```

El vídeo generado es fotográfico: inventa píxeles verosímiles. Todo lo que tiene que ser exacto, como un titular, un logotipo o un precio, es mejor dibujarlo con `kie render` y superponerlo a la película. [graphic-motion.md](skills/motion-design/references/graphic-motion.md) explica cuándo usar cada opción.

Tus películas, tomas y registros de gasto se quedan en `runs/`, y las referencias guardadas en `library/`. Git ignora ambas carpetas.

## Los looks

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

- **Chase ([@cth9191](https://github.com/cth9191))** creó la skill original [motion-design](https://github.com/cth9191/motion-design) de la que nació este proyecto: los diez looks, sus prompts de origen, las guías de adaptación y las plantillas, la galería reproducible, las imágenes de vista previa y el wordmark "Motion Design". Gracias, Chase. Si te gustan los looks, ve a darle una estrella a su repositorio.
- Los prompts de origen aparecieron por primera vez en un [artículo de Higgsfield Marketing Studio](https://higgsfield.ai/@adilinthewildtempo/blogs/claude-fable-5-1-higgsfield-marketing-studio-300-day).
- Los iconos de marca de Claude y OpenAI en la página MCP son de [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT).

[ATTRIBUTION.md](ATTRIBUTION.md) enumera exactamente qué archivos proceden del repositorio de Chase.

## Licencia

Todo lo que he escrito yo está bajo la [licencia MIT](LICENSE): el estudio, la CLI `kie`, el servidor MCP, los motores de render y acabado, el instalador, las guías de dirección, las pruebas y la documentación.

Los looks y el resto de archivos del repositorio de Chase **no** están cubiertos por la licencia MIT. Son suyos, y se comparten aquí con crédito; su repositorio no tiene licencia propia. [ATTRIBUTION.md](ATTRIBUTION.md) los enumera.

## Pruebas

```bash
npm test             # CLI
npm run test:mcp     # MCP server
npm run test:web     # studio
npm run validate     # the looks: source hashes, templates and gallery
```
