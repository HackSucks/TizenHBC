# Program catalog format

The Homebrew Channel reads a single JSON catalog. The same document can be:

- bundled inside the widget at `app/res/programs.json`;
- cached in `localStorage` after a refresh;
- served by `hbc-srv` at `GET /catalog`;
- published by the SamPwn-Programs repository and fetched from a URL.

The formal schema is [`schemas/programs.schema.json`](../schemas/programs.schema.json).

## Minimal catalog

```json
{
  "schema": "tizen-hbc/catalog@1",
  "name": "SamPwn Programs",
  "updated": "2026-10-30",
  "installRoot": "/opt/usr/home/hbc/programs",
  "baseUrl": "https://raw.githubusercontent.com/HackSucks/SamPwn-Programs/main/",
  "programs": []
}
```

`baseUrl` is prefixed to relative `icon`, `readme`, `entry` and `files[].url` values. A program may override it with its own `baseUrl`. Bundled catalogs normally leave it empty.

## Program fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable lowercase identifier, also used as the install directory. |
| `name` | yes | Display name. |
| `author` | no | Author or maintainer. |
| `version` | no | Free-form version string. |
| `description` | no | One or two sentences shown on the tile and details page. |
| `dir` | no | Directory in the programs repository. Defaults to `id`. |
| `readme` | no | README path relative to the program directory. |
| `language` | yes | `csharp` or `native`. |
| `runtime` | yes | `dotnet` (run the entry with the dotnet host) or `elf` (load it with the bundled `elf-run` helper). |
| `entry` | yes | Program-relative path to the `.dll` or ELF executable. |
| `args` | no | Default argument array. |
| `terminal` | no | `true` (default) opens the xterm.js terminal. |
| `keyboard` | no | `true` opens the virtual keyboard after launch. |
| `output` | no | `terminal` or `log`; defaults to `terminal`. |
| `icon` | no | Tile/detail icon path. |
| `bundled` | no | Install from the service's local `programs/<id>` directory. |
| `baseUrl` | no | Per-program URL base override. |
| `files` | yes | Files copied or downloaded during installation. |

## File fields

| Field | Required | Meaning |
| --- | --- | --- |
| `path` | yes | Destination path inside the program install directory. |
| `url` | no | Source URL, or a path relative to `baseUrl`. Defaults to `path`. |
| `sha256` | no | 64-character SHA-256 checksum verified by `hbc-srv`. |
| `size` | no | Exact byte size verified by `hbc-srv`. |
| `executable` | no | Run `chmod +x` after installation. |

Paths are validated so they cannot escape the program's install directory.

## C# program

```json
{
  "id": "tvfetch",
  "name": "TVFetch",
  "author": "HackSucks",
  "version": "1.0.0",
  "description": "A fastfetch-like system information viewer.",
  "dir": "tvfetch",
  "readme": "README.md",
  "language": "csharp",
  "runtime": "dotnet",
  "entry": "tvfetch.dll",
  "terminal": true,
  "keyboard": false,
  "icon": "tvfetch/icon.png",
  "files": [
    {
      "path": "tvfetch.dll",
      "url": "tvfetch/tvfetch.dll",
      "sha256": "618c514e9e7df4ad4e136f1b37c21ffee0fb3a18ca6d7d84d8c392281cd7831b",
      "size": 17408
    },
    {
      "path": "tvfetch.deps.json",
      "url": "tvfetch/tvfetch.deps.json",
      "sha256": "986c5c095329157bfaf4b03324ca8ea7142843fcab88f778fda499b3a5f0e407",
      "size": 447
    },
    {
      "path": "tvfetch.runtimeconfig.json",
      "url": "tvfetch/tvfetch.runtimeconfig.json",
      "sha256": "73b656f50d97f1d252c3ece1aa6cc9114f8a6fb4cc90e4a6731c0b947916d391",
      "size": 249
    }
  ]
}
```

`hbc-srv` launches:

```text
dotnet /opt/usr/home/hbc/programs/tvfetch/tvfetch.dll
```

inside `script -q -f -c ...`, so the program sees a real PTY with `TERM=xterm-256color` and `COLORTERM=truecolor`.

Build the C# program for the TV runtime:

```sh
dotnet publish -c Release -r linux-arm --self-contained false
```

The target framework used by SamPwn-Programs is `netcoreapp3.1`.

## Native program

```json
{
  "id": "hello",
  "name": "Hello",
  "author": "Example",
  "language": "native",
  "runtime": "elf",
  "entry": "hello",
  "terminal": true,
  "keyboard": false,
  "files": [
    {
      "path": "hello",
      "url": "hello/hello",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "size": 12345,
      "executable": true
    }
  ]
}
```

Build with the Tizen or SamPwn ARM toolchain. `hbc-srv` does **not** `exec()`
the ELF. It launches the bundled managed loader instead:

```text
dotnet .../hbc-srv/elf-run/elf-run.dll /opt/usr/home/hbc/programs/hello/hello
```

The loader validates the image, maps its `PT_LOAD` segments into anonymous
read/write/execute memory owned by the signed dotnet process, builds the initial
stack (`argc`, `argv`, `envp`, auxv) and jumps to the entry point. The target then
runs with a normal PTY, arguments, environment and exit code.

### Why the loader exists

Retail Tizen firmware enforces User Execution Prevention (UEP). Both
`execve()` and file-backed `mmap()` of an unsigned binary fail with
`Operation not permitted`, even for `root` with the correct SMACK label.
Anonymous RWX mappings and JIT execution are still allowed. Because the signed
`/usr/bin/dotnet` process maps the file itself and executes it from anonymous
memory, UEP is never consulted. No kernel modification or Samsung certificate
is required.

### Supported images

- little-endian ELF32, `e_machine = EM_ARM` (ARMv7);
- `ET_EXEC` (non-PIE) and `ET_DYN` (PIE) executables;
- static images, and dynamic images whose interpreter and libraries the TV
  already has as signed system files.

**Link statically unless you only use the TV's own libraries.** For a dynamic
program the kernel is bypassed, but the real `ld.so` still maps `NEEDED`
libraries from disk, so every shared library you add must be Samsung-signed.
The loader resolves `PT_INTERP` (falling back to `/lib/ld-linux.so.3`) and can
run dynamic system binaries such as `/bin/true`. Build against the TV's glibc
version or use a static toolchain to avoid `GLIBC_2.xx not found` errors.

A convenient static build:

```sh
zig cc -target arm-linux-musleabihf -static -O2 -o hello hello.c
```

The loader is 32-bit ARM only; an AArch64 TV would need an equivalent loader
built for arm64. The bundled **Fastfetch** entry is a working example: a
statically linked ARMv7 fastfetch binary installed from the widget and launched
through `elf-run`.

If a native program was launched through `script`, a direct `exec` failure can
look like a silent success: `script` reports exit code 0 even when the inner
command fails. With the loader, read the captured stderr for `elf-run:` lines.

## Bundled programs

A program with `"bundled": true` is installed from the service's own bundle:

```text
hbc-srv/
  elf-run/
    elf-run.dll
    elf-run.deps.json
    elf-run.runtimeconfig.json
  programs/
    tvfetch/
      tvfetch.dll
      tvfetch.deps.json
      tvfetch.runtimeconfig.json
      tvfetch
      README.md
```

The widget sends `source: "bundle"` to `POST /install`; `hbc-srv` copies the directory and writes `program.json`. This is how the included TVFetch entry works without internet access. `elf-run` is staged next to `hbc-srv.dll` and is used for every `runtime: "elf"` program.

Remote programs use `source: "remote"` and are downloaded from `baseUrl` + `files[].url`.

## Publishing a catalog

1. Put each program in its own directory under the repository.
2. Publish C# output or the native executable.
3. Compute checksums:

   ```sh
   sha256sum tvfetch/tvfetch.dll
   stat -c '%s' tvfetch/tvfetch.dll
   ```

4. Add the entry to `programs.json`.
5. Commit. The channel's default URL is:

   ```text
   https://raw.githubusercontent.com/HackSucks/SamPwn-Programs/main/programs.json
   ```

6. In the channel, open **Settings → Catalog URL** to point at a fork, then use **Refresh catalog**.

The bundled catalog is deliberately offline-first. If the remote manifest is missing or invalid, the built-in entries and the last cached catalog still work.

## Terminal and keyboard flags

- `terminal: true` opens xterm.js. The terminal supports 24-bit colour, 256-colour ANSI, resize fitting, scrollback and PTY input.
- `terminal: false` / `output: "log"` starts the program without the terminal UI and shows a toast. Use it for GUI or fire-and-forget helpers.
- `keyboard: true` automatically opens the virtual keyboard after the terminal starts. The user can also toggle it with the Green button, F2, the terminal header button, or the Red button.
- The virtual keyboard sends Esc, Tab, Ctrl, Alt, arrows, Home/End, Page Up/Down, F1–F10, symbols and text to the PTY.

## Security notes

- `hbc-srv` listens on `127.0.0.1` only.
- Install paths are normalised and checked against the install root.
- SHA-256 and size checks are enforced when present.
- The service never executes a path outside the program's install directory.
- The channel does not need internet access for bundled programs.
