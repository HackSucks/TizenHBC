# hbc-srv

Local companion service for Tizen Homebrew Channel.

It installs programs, runs them in a PTY and streams their output to the widget. It listens on **127.0.0.1:2325** only.

## Build

```sh
dotnet publish -c Release -r linux-arm --self-contained false
```

Or from the repository root:

```sh
./tools/build-companion.sh
```

## Run

```sh
./hbc-srv
# or
dotnet hbc-srv.dll
```

The published directory contains a `programs/` folder with bundled entries such as `tvfetch`. Keep it next to `hbc-srv.dll` or set `HBC_BUNDLE_ROOT`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `HBC_PORT` | `2325` | Loopback HTTP port. |
| `HBC_INSTALL_ROOT` | `/opt/usr/home/hbc/programs` | Installed program directories. |
| `HBC_BUNDLE_ROOT` | `<service dir>/programs` | Bundled program sources. |
| `HBC_DATA_ROOT` | `/opt/usr/home/hbc` | Catalog and home directory. |
| `HBC_DOTNET` | auto-detect | Path to the dotnet host used for `.dll` entries. |

## Endpoints

```text
GET  /status
GET  /programs
GET  /program/{id}
GET  /catalog
POST /catalog
POST /install
POST /uninstall
POST /run
GET  /session/{id}?since=N
POST /session/{id}/input
POST /session/{id}/resize
POST /session/{id}/kill
POST /kill
```

See [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the protocol and security notes, and [`../../docs/PROGRAMS.md`](../../docs/PROGRAMS.md) for the catalog format.

## PTY

Programs are wrapped in `script -q -f -c ...`, which allocates a pseudo-terminal. The child sees `TERM=xterm-256color` and `COLORTERM=truecolor`.

If `script` is not present, a normal pipe is used. Output still works, but interactive line editing and full-screen programs may not.

## License

GPL-2.0. See [`../../COPYING`](../../COPYING).
