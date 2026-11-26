<div align="center">

<img src="web/public/brand/shard-icon.svg" width="88" height="88" alt="Shard logo">

# Shard

**Ein Motion-Design-Studio für KI-Video und -Bilder, auf deinem eigenen Computer.**

Plane einen Film, erzeuge seine Szenen und schließe ihn ab, über ein Web-Studio, das Terminal oder Claude Code und Codex.

[![CI](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexMakesC0de/shard-motion-design-studio/actions/workflows/ci.yml)
[![AlexMakesC0de/shard-motion-design-studio MCP server](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio/badges/score.svg)](https://glama.ai/mcp/servers/AlexMakesC0de/shard-motion-design-studio)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E?logo=node.js&logoColor=white)
![macOS](https://img.shields.io/badge/platform-macOS-555)
![Claude Code | Codex](https://img.shields.io/badge/works%20with-Claude%20Code%20%7C%20Codex-B4471C)

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md) · **Deutsch**

<sub>This translation is older than the English README, which is the reference for features, licensing and credits.</sub>

Dies ist eine Übersetzung. Bei Abweichungen gilt die englische Fassung, [README.md](README.md).

[Schnellstart](#schnellstart) · [Danksagung](#danksagung) · [Die CLI](cli/README.md) · [Der MCP-Server](mcp/README.md) · [Das Studio](web/README.md)

</div>

---

Shard begann als Fork von **[Chases motion-design-Skill](https://github.com/cth9191/motion-design)**, zehn richtig gut aussehende Motion-Stile samt den Prompts dahinter. Ein riesiges Dankeschön an Chase: Die Looks in diesem Repo stammen von ihm. Alles, was drumherum gebaut wurde, ist neu. Siehe [Danksagung](#danksagung).

## Was drin steckt

| Teil | Was er macht |
|---|---|
| **Studio** (`web/`) | Eine lokale Web-App: Bild- und Video-Seiten, Filme, Szene für Szene geplant, eine Bibliothek mit Figuren, Produkten und Orten, Looks, deine Skills, Ausgaben und Einstellungen. |
| **`kie`-CLI** (`cli/`) | Erzeugt Video, Bilder und Audio über [kie.ai](https://kie.ai) (mit WaveSpeed als Ausweichlösung), nennt vorab den Preis jedes Jobs und führt Buch über jeden einzelnen. |
| **MCP-Server** (`mcp/`) | Gibt Claude Code, Codex und Claude Desktop dieselben Werkzeuge wie das Studio, damit du Filme einfach per Anfrage machen kannst. |
| **Rendern und Abschließen** (`render/`, `cli/`) | Zeichnet exakte Grafiken im Code (Titel, Logos, Zahlen) mit Remotion und schließt Filme mit ffmpeg ab: Musik, Untertitel, Lautheit, andere Seitenverhältnisse. |
| **Skill-Bibliothek** (`skills/`) | Deine liebsten Agent-Skills, jeder nutzbar als `/slash-command`, als MCP-Prompt und im Studio. `motion-design` enthält die Looks. |

**Ausgaben sind überall abgesichert.** Jeder kostenpflichtige Job wird vor dem Senden bepreist und gegen ein Tageslimit und ein optionales Limit pro Job geprüft, egal ob er aus dem Studio, der CLI oder von einem Agenten kommt. Nachschlagen, Planen und Bepreisen sind kostenlos.

## Schnellstart

Du brauchst **Node 22+** und einen **kie.ai-API-Schlüssel**. ffmpeg wird nur zum Abschließen gebraucht, Python 3.10+ nur, um die Looks-Galerie neu zu bauen.

1. **Hol dir den Code und installiere die Werkzeuge.** Der Installer legt `kie` in deinen PATH, verlinkt die Skills in Claude Code, Codex und Kimi, sofern installiert, und registriert den MCP-Server.

   ```bash
   git clone https://github.com/AlexMakesC0de/shard-motion-design-studio.git
   cd shard-motion-design-studio
   node install.mjs            # --dry-run zeigt vorab, was geändert würde
   ```

2. **Füge deinen kie.ai-Schlüssel hinzu**, nur für dich lesbar, und prüfe dann die Einrichtung. `kie doctor` macht eine kostenlose Guthabenabfrage und erzeugt nichts.

   ```bash
   mkdir -p ~/.config/kie
   printf '%s' 'YOUR_KIE_KEY' > ~/.config/kie/key && chmod 600 ~/.config/kie/key
   kie doctor
   ```

3. **Lege ein Budget fest.** Zum Beispiel höchstens 25 $ pro Tag und 2 $ pro Job:

   ```bash
   kie limits --daily 25 --per-job 2
   ```

4. **Öffne das Studio.** Es läuft auf http://127.0.0.1:4317 und antwortet nur deinem eigenen Rechner.

   ```bash
   npm --prefix web install
   npm run studio
   ```

5. **Oder frag einen Agenten.** Starte Claude Code oder Codex neu und probiere: *"Plane einen 15-sekündigen Produktfilm für meine App, zeig mir den Preis und erzeuge noch nichts."* Die MCP-Seite im Studio zeigt den genauen Einrichtungsbefehl für jede App.

## Etwas im Terminal machen

```bash
kie presets                                        # the ten looks
kie preflight --model seedance-2-5 --duration 10   # what a job would cost, without spending
kie video    --run launch --preset kinetic-typography --duration 10
kie render   --run launch --template logo-reveal --props brand.json
kie assemble --run launch --shot out.mp4 --shot logo-reveal.mp4 --transition fade:0.5
kie variants --run launch --video film.mp4 --ratios 9:16,1:1
```

Erzeugtes Video ist fotografisch: Es erfindet plausible Pixel. Alles, was exakt stimmen muss, etwa eine Schlagzeile, ein Logo oder ein Preis, zeichnest du besser mit `kie render` und legst es über den Film. [graphic-motion.md](skills/motion-design/references/graphic-motion.md) erklärt, wann du was nimmst.

Deine Filme, Takes und Ausgabenprotokolle bleiben in `runs/`, gespeicherte Referenzen in `library/`. Beide werden von git ignoriert.

## Die Looks

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

## Danksagung

- **Chase ([@cth9191](https://github.com/cth9191))** hat den ursprünglichen [motion-design](https://github.com/cth9191/motion-design)-Skill gemacht, aus dem dieses Projekt entstanden ist: die zehn Looks, ihre Quell-Prompts, die Anpassungsleitfäden und Vorlagen, die abspielbare Galerie, die Vorschaubilder und die Wortmarke "Motion Design". Danke, Chase. Wenn dir die Looks gefallen, gib seinem Repo einen Stern.
- Die Quell-Prompts erschienen zuerst in einem [Artikel zum Higgsfield Marketing Studio](https://higgsfield.ai/@adilinthewildtempo/blogs/claude-fable-5-1-higgsfield-marketing-studio-300-day).
- Die Markensymbole für Claude und OpenAI auf der MCP-Seite stammen von [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT).

[ATTRIBUTION.md](ATTRIBUTION.md) listet genau auf, welche Dateien aus Chases Repo stammen.

## Lizenz

Alles, was ich geschrieben habe, steht unter der [MIT-Lizenz](LICENSE): das Studio, die `kie`-CLI, der MCP-Server, die Render- und Abschluss-Engines, der Installer, die Regie-Leitfäden, die Tests und die Dokumentation.

Die Looks und die übrigen Dateien aus Chases Repo sind **nicht** von der MIT-Lizenz abgedeckt. Sie gehören ihm und sind hier mit Namensnennung geteilt; sein Repo hat keine eigene Lizenz. [ATTRIBUTION.md](ATTRIBUTION.md) listet sie auf.

## Tests

```bash
npm test             # CLI
npm run test:mcp     # MCP server
npm run test:web     # studio
npm run validate     # the looks: source hashes, templates and gallery
```
