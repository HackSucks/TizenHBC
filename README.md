# Tizen Homebrew Channel

A 16:9 recreation of the Wii **Homebrew Channel** for Samsung Tizen TVs, packaged as an ES5 web widget. It keeps the original intro, logo, bubbles, 4×5 channel grid, hand cursor, status icons and button art, then adds a real xterm.js terminal and a small companion service for installing and running homebrew.

![the Tizen Homebrew Channel](app/res/img/logo.png)

## Features

- **Wii-style intro**: water flows up the screen during the quiet opening, then the logo flashes on every drum hit once the bass drops, synced to `intro.mp3`'s own clock. **Exit** / **Start** appear on the drop.
- **Original channel UI**: bubble background, 4×5 grid, list view, hand cursor, page arrows, status icons and Home menu.
- **24-bit xterm.js terminal** with 256-colour ANSI, true colour, scrollback, fit-to-screen resizing and PTY input.
- **Virtual keyboard** with letters, symbols, Ctrl/Alt/Shift, arrows, Home/End, Page Up/Down, F1–F10 and terminal special keys.
- **Samsung remotes**: slim Smart Remote and full remote. Arrows, OK and BACK reach every action; colour buttons are shortcuts.
- **Program catalog** in a documented JSON format for C# `.dll` programs and native ARM ELF executables, run through a bundled managed loader that works around Tizen UEP.
- **Offline-first**: the bundled catalog, built-in channels and READMEs work without internet.
- **Companion `hbc-srv`** for installs, SHA-256 verification, PTY sessions and process lifecycle.
- **Original assets and fonts** from the GPL-2.0 Homebrew Channel release, plus a new vector-text "the Tizen Homebrew Channel" logo (Ubuntu typeface; `tools/gen-logo.py`).
- **Built for weak TV GPUs**: no CSS filters, half-resolution bubbles, a low-res intro canvas, effects that pause under overlays, and an **Effects** setting (Auto / Full / Low) that drops detail automatically if frames run slow.
- **Scrollable text**: README/About text has a visible scroll bar; press UP from the buttons to focus it, then UP/DOWN to scroll (OK = next page, CH▲▼ = page).

## Quick start

Requirements:

- Tizen Studio with the TV profile and an author certificate.
- Node.js (used by the build script for JavaScript and JSON checks).
- A Samsung TV in developer mode with `sdb` access.
- Optional: .NET SDK 9 (or any SDK that can target `netcoreapp3.1`) to build the companion.
- Optional: `dotnet` runtime on the TV for C# programs.

### 1. Build the widget

```sh
./tools/build.sh
```

This checks every JS file, validates the JSON, and packages:

```text
dist/tizenhbc.wgt
```

The signing profile defaults to `tv`; override it with `HBC_PROFILE=myprofile`.

### 2. Install the widget

```sh
./tools/install-hbc.sh 192.168.1.50
```

The script connects `sdb`, then installs `dist/tizenhbc.wgt` with `tizen install`. You can also install the `.wgt` manually through Tizen Studio or `sdb`.

### 3. Build and install the companion (optional)

```sh
./tools/build-companion.sh
```

Output:

```text
dist/hbc-srv/
  hbc-srv.dll
  hbc-srv.deps.json
  hbc-srv.runtimeconfig.json
  programs/
    tvfetch/
```

You normally do not start it yourself. `./tools/build.sh` bundles `dist/hbc-srv` inside the widget, and the app launches it on its own **the moment the intro logo appears** (Settings → *Start hbc-srv automatically*, and *Start hbc-srv now*):

1. It sends the start command to the root shell on `localhost:2323` (the request line itself is the command, `sh <app folder>/hbc-srv/launch.sh`, so the HTTP headers that follow are harmless noise to the shell).
2. If the service is still not answering, it calls `POST localhost:2324/shell/on`, sends the command again, then calls `POST localhost:2324/shell/off`.

The launcher script detaches the service (own session, no stdin), so it keeps running after the widget exits. Use `./tools/install-companion.sh <tv-ip>` only if you want a copy outside the app (set its path in Settings → *hbc-srv folder*), or `hbc-srv.sh run` on the TV to see start-up errors.

If `hbc-srv` still does not start, run `./hbc-srv.sh run` on the TV and read the message: the usual causes are no dotnet runtime on the TV (`HBC_DOTNET=/path/to/dotnet`), a runtime older/newer than the app (the build now rolls forward across major versions), or a read-only data directory (the service now falls back to a writable one automatically).

The service listens on `127.0.0.1:2325` only. `HBC_PORT`, `HBC_INSTALL_ROOT`, `HBC_BUNDLE_ROOT` and `HBC_DATA_ROOT` override the defaults.

### 4. Install a program

Open **Programs** in the channel, choose an entry, then **Install**. The service copies bundled programs or downloads remote files into `/opt/usr/home/hbc/programs/<id>`, verifies checksums and writes `program.json` plus the README.

Launching a program opens the terminal when `terminal: true`. Programs with `keyboard: true` open the virtual keyboard automatically.

## Controls

| Action | Remote | Keyboard |
| --- | --- | --- |
| Move selection | Arrows | Arrows |
| Start / open | OK / Enter | Enter |
| Home menu | BACK | Escape |
| Program info | Red | F1 |
| Start / install | Green | F2 |
| Grid / list view | Yellow | F3 |
| Refresh catalog | Blue | F4 |
| Previous / next page | Channel Up/Down | Page Up/Down |
| Terminal keyboard | Green or Red | F2 |
| Terminal actions menu | Info / Menu | — |
| Terminal header buttons | Tools (or Up after the program exits) | — |
| Terminal close / return to channel | BACK | Escape |
| Terminal hide | Yellow | — |
| Terminal kill | Blue | — |
| Terminal Escape | Play/Pause | — |
| Exit to TV | Home menu → Exit to TV | — |

## Catalog format

Programs are described by `app/res/programs.json` and the schema in [`schemas/programs.schema.json`](schemas/programs.schema.json). A program declares:

- its directory and README;
- `language`: `csharp` or `native`;
- `runtime`: `dotnet` or `elf`. Retail Tizen firmware blocks unsigned native
  execution with UEP, so `elf` programs are loaded by the bundled `elf-run`
  helper inside the signed dotnet host instead of being `exec()`d;
- its `.dll` or executable entry point; static ARM binaries are the most
  portable choice;
- `terminal` and `keyboard` flags;
- files with `path`, `url`, `sha256`, `size` and `executable`.

The full field reference, examples and publishing steps are in [`docs/PROGRAMS.md`](docs/PROGRAMS.md).

The default remote manifest URL is:

```text
https://raw.githubusercontent.com/HackSucks/SamPwn-Programs/main/programs.json
```

Change it in **Settings → Catalog URL** to use a fork. The bundled TVFetch and Fastfetch entries use `"bundled": true`, so they install from `hbc-srv/programs/<id>` without network access. Fastfetch is the native demo: a static ARM ELF run through the bundled `elf-run` loader.

## Project layout

```text
app/                    Tizen widget (ES5)
  index.html
  config.xml
  css/hbc.css
  js/                   util, audio, remote, bridge, catalog, ui, keyboard,
                        terminal, intro, main, app
  res/                  audio, fonts, icons, original art, programs.json
  vendor/xterm/         xterm.js 4.19.0 + fit addon 0.5.0
companion/hbc-srv/      .NET Core 3.1 companion service
programs/tvfetch/       bundled TVFetch build, source and README
schemas/                catalog JSON Schema
docs/                   program format and architecture
tools/                  build, install, icon and packaging scripts
dist/                   generated .wgt, service output and zip
```

## Music

The intro uses `app/res/audio/intro.mp3` (31 s). The background track `app/res/audio/bgm.mp3` is the supplied installer music re-cut into a 32-bar loop (67 s, bar-aligned, with the seam cross-faded) so it repeats without the old fade-to-silence and hard restart. Both play through one shared audio element, which is what Samsung TVs need. Both are the files supplied for this personal port and are not relicensed by the project. Music and sound effects can be disabled in Settings.

## Credits

- Original Homebrew Channel art, layout and fonts: **Team Twiizers / fail0verflow**, GPL-2.0.
- Logo lettering: **Ubuntu** (Ubuntu Font Licence 1.0, `tools/fonts/`). The original HBC wordmark's font is not freely available; Ubuntu is the closest match.
- Droid Sans and Droid Sans Bold: the redistributable fonts shipped with the open-source HBC release.
- Adwaita Mono: used by SamPwn as its terminal font.
- xterm.js: MIT.
- TVFetch and SamPwn-Programs: **HackSucks**.
- Tizen port, ES5 widget, companion service and documentation: Tizen HBC contributors.

The Homebrew Channel name and logo belong to their original authors. This is a fan port, not an official Nintendo, Team Twiizers or Samsung product.

## License

GPL-2.0. See [`COPYING`](COPYING). The original Homebrew Channel assets are distributed under the same license. The supplied music files remain the property of their respective owners.
