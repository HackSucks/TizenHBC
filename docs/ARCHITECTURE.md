# Architecture

Tizen Homebrew Channel is split into two pieces:

1. **The widget** (`app/`) — an ES5 Tizen TV web application packaged as `.wgt`. It draws the Homebrew Channel, plays music, handles remotes, renders xterm.js and owns the UI.
2. **The companion** (`companion/hbc-srv/`) — an optional .NET Core 3.1 service on `127.0.0.1:2325`. It installs programs, starts PTY sessions and returns their output.

The widget works as a catalog browser without the service. Installing or launching a program requires `hbc-srv`.

## Widget layout

```text
app/
  index.html            markup and script order
  config.xml            Tizen widget manifest
  css/hbc.css           all channel, overlay, terminal and keyboard styling
  js/
    util.js             ES5 DOM, XHR, storage, base64 and Markdown helpers
    audio.js            one shared <audio> for intro + bgm (TV pipeline limit), synthesized sfx
    remote.js           Samsung remote key map, key registration and routing
    bridge.js           hbc-srv HTTP client
    catalog.js          bundled/cached/remote catalog merging and built-ins
    ui.js               toast, modal dialog and Home/terminal menus
    keyboard.js         virtual keyboard and remote navigation
    terminal.js         xterm.js, fit addon and PTY session polling
    intro.js            water canvas, beat-timeline logo flashes, Exit/Start and cursor
    main.js             grid/list channel, details, settings and catalog UI
    app.js              settings persistence, boot, global input routing, exit
  res/
    audio/              intro.mp3 and bgm.mp3
    font/               Droid Sans/Bold and Adwaita Mono
    icons/              generated program tiles and app icon
    img/                original Homebrew Channel art
    programs.json       bundled catalog
    programs/           bundled READMEs used by the widget
  vendor/xterm/         xterm.js 4.19.0 + fit addon 0.5.0
```

Scripts load in dependency order from `index.html`. Everything is ES5: `var`, functions, prototypes, no modules, no arrow functions, no promises in application code.

## Boot sequence

`app.js` runs at the end of the document:

1. Load `hbc.settings` from `localStorage` and merge defaults.
2. Initialise audio, terminal, main UI, remote and intro.
3. Register Tizen TV input keys (`ColorF0Red`, `MediaPlayPause`, `Info`, etc.).
4. Load the cached catalog, then `res/programs.json`.
5. Render the built-in channels immediately.
6. Show the intro and start the intro music.
7. Ping `hbc-srv`; if it becomes online, reload installed programs and its catalog.
8. Poll `/status` every 30 seconds.

The intro is intentionally independent of the catalog so the channel always opens quickly.

## Input routing

All keydown events pass through `app.js`'s `routeRemote` in this priority:

```text
Dialog > Keyboard > Menu > Terminal > Main overlay > Intro > Channel grid
```

This lets a modal block everything below it, lets the virtual keyboard own printable keys while it is open, and lets BACK in a terminal open the terminal menu instead of leaving the channel.

Remote actions are abstracted in `remote.js`:

- arrows → `left/right/up/down`
- OK/Enter → `enter`
- BACK/Exit → `back` / `exit`
- Red/Green/Yellow/Blue → colour actions
- channel up/down → page navigation in the channel, scroll in lists
- play/pause → view toggle or terminal Escape
- digits → page jump / terminal text

Both the slim Samsung Smart Remote and the full remote work. Every action is reachable with arrows, OK and BACK.

## Channel UI

`main.js` keeps:

- `view`: `grid` (4×5 tiles) or `list` (5 rows)
- `page`, `col`, `row`, `selectedId`
- overlay state: `detail`, `settings`, `catalog`

Tiles are absolutely positioned inside `#grid`. The hand cursor follows the focused tile with a CSS transition. Page changes slide the grid, wrap at the ends, and update the original `apps_previous` / `apps_next` arrows.

The built-in channels are always present:

| Channel | Action |
| --- | --- |
| Welcome | README with controls and install notes |
| Programs | Catalog overlay |
| Settings | Service URL, catalog URL, music, sounds, view, service check, reset |
| About | Version, runtime, licenses and font notes |

Catalog entries follow the format in [`PROGRAMS.md`](PROGRAMS.md). Installed state comes from `hbc-srv` and is merged into the same tile list.

## Terminal

`terminal.js` creates xterm.js on first use with:

- 24-bit true colour theme
- `convertEol: false`
- 5000 lines of scrollback
- fit addon resizing
- `HBCMono` (Adwaita Mono) as the font

Input path:

```text
xterm.onData -> POST /session/<id>/input { b64 }
virtual keyboard -> terminal.sendInput -> same endpoint
remote arrows/Enter -> terminal.handleRemote -> ANSI sequences
```

Output path:

```text
GET /session/<id>?since=N -> base64 chunk -> TextDecoder -> xterm.write
```

The server returns `done` only after the whole buffer has been delivered. The widget stops polling when the process exits, appends an exit-code line, and keeps the terminal visible until the user closes it.

If the service is offline, the terminal still opens and explains how to start `hbc-srv`. The widget never pretends a program ran.

## Companion service

`hbc-srv` is a small `HttpListener` server. It has no ASP.NET dependency, which keeps it usable on a TV runtime that only ships the base .NET runtime.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | Version, platform, roots, installed count, session count |
| GET | `/programs` | Installed programs with README text |
| GET | `/program/{id}` | One installed program and its README |
| GET | `/catalog` | Last saved catalog plus installed programs |
| POST | `/catalog` | Save a catalog JSON document |
| POST | `/install` | Bundle copy or remote download |
| POST | `/uninstall` | Remove an install directory |
| POST | `/run` | Start a program in a PTY |
| GET | `/session/{id}?since=N` | Poll output |
| POST | `/session/{id}/input` | Send base64 bytes to stdin |
| POST | `/session/{id}/resize` | Accepted for compatibility; PTY size is fixed at launch |
| POST | `/session/{id}/kill` | Kill a session |
| POST | `/kill` | Kill by `session` id |

All responses are JSON. CORS is open because the widget origin is local.

### PTY strategy

.NET's `Process` cannot attach a child to a pseudo-terminal directly. The service wraps the program in:

```sh
script -q -f -c "stty cols COLS rows ROWS; exec 'program' 'args'" /dev/null
```

`script` allocates a PTY, so programs see a TTY and can use colours, cursor movement, line editing and terminal detection. Environment:

```text
TERM=xterm-256color
COLORTERM=truecolor
LANG=C.UTF-8
LC_ALL=C.UTF-8
HOME=/opt/usr/home/hbc
```

If `script` is unavailable, the service falls back to a normal pipe; output still works but interactive line editing may not.

### Install roots

| Path | Meaning |
| --- | --- |
| `/opt/usr/home/hbc/programs` | Installed programs (override with `HBC_INSTALL_ROOT`) |
| `<service dir>/programs` | Bundled program sources (override with `HBC_BUNDLE_ROOT`) |
| `/opt/usr/home/hbc/catalog.json` | Last catalog saved by the widget (override with `HBC_DATA_ROOT`) |

Each install receives a `program.json` written by the service, plus the program's README. Installed programs survive widget updates.

### Security

- Binds to loopback only; it is not reachable from the LAN.
- Program IDs and file paths are sanitised and checked against the install root.
- SHA-256 and byte size are verified when supplied.
- Remote downloads use a two-minute timeout.
- The service runs with the TV user's permissions; it does not try to escalate.
- A program is only launched from its own install directory.

## Assets and fonts

The channel uses the original GPL-2.0 Homebrew Channel art from `fail0verflow/hbc`:

- `logo.png`, `background_wide.png`, `bubble1–3.png`
- `apps_grid*.png`, `apps_list*.png`, `apps_previous/next*.png`
- `button*.png`, `cursor_pic.png`, `dialog_background.png`, `dlg_*.png`
- `icon_network*.png`, `icon_usbgecko*.png`, `throbber.png`

The open-source release ships Droid Sans and Droid Sans Bold as its redistributable substitute for Horatio D Medium. This port uses those exact files, so spacing and weights match the released channel rather than a system font. The logo is the original PF Square Sans Pro bitmap artwork, not a re-render.

TVFetch's icon, the built-in channel icons and the app icon are generated by `tools/gen-icons.py`.

## Limitations

- `hbc-srv` is required for installs and launches.
- PTY resize is fixed at launch; most TV programs do not need dynamic resize.
- The service has no authentication because it is loopback-only.
- Remote catalogs require the TV to reach the manifest and file URLs.
- The widget is ES5 by design; no transpiler or bundler is required.
- xterm.js is vendored; the widget does not load code from a CDN.

## Intro timeline

`intro.js` embeds the drum-hit times of `intro.mp3` (measured offline: bass drop at 3.43 s, 8th-note grid of 0.263 s). Each frame reads `HBC.Audio.introTime()`; if sound is audible the picture follows it (minus **Intro A/V sync**), otherwise it runs on its own clock. When the track ends the intro fades and replays until Start.

## Performance model

`HBC.Fx` holds an effects level (2 full, 1 reduced, 0 minimal). In *Auto* it steps down when the average frame time of the animated scene exceeds ~52 ms. Level 1 shrinks the intro canvas and halves bubbles, level 0 disables the canvases. CSS uses no `filter`; cursors move by `transform`.

## Scroll bars

`HBC.Scroll` draws a track/thumb beside any scrollable element (native bars are hidden). The detail overlay has two focus zones, buttons and text; UP from the buttons focuses the text.

## Starting the companion from the widget

`launcher.js` runs when the intro logo appears. A web widget cannot spawn processes, so it talks to the TV's root shell (`127.0.0.1:2323`): the XHR method is `sh` and the path is the bundled `hbc-srv/launch.sh`, which makes the shell's first received line `sh /opt/usr/apps/<pkg>/res/wgt/hbc-srv/launch.sh HTTP/1.1`. A plain-POST fallback sends the command as the request body. If that fails, the control port is used: `POST :2324/shell/on`, retry, `POST :2324/shell/off`. Success is judged only by `GET /status` on hbc-srv. The cross-origin request relies on the widget's `<access origin="*">`; the browser never gets a readable reply, which is expected.
