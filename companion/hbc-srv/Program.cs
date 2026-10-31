using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace HbcSrv
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            var port = 2325;
            var envPort = Environment.GetEnvironmentVariable("HBC_PORT");
            if (!string.IsNullOrEmpty(envPort))
            {
                int parsed;
                if (int.TryParse(envPort, out parsed) && parsed > 0 && parsed < 65536) port = parsed;
            }
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--port")
                {
                    int parsed;
                    if (int.TryParse(args[i + 1], out parsed) && parsed > 0 && parsed < 65536) port = parsed;
                }
            }

            try
            {
                var server = new HbcServer(port);
                server.RunAsync().GetAwaiter().GetResult();
                return 0;
            }
            catch (HttpListenerException ex)
            {
                Log.Error("cannot listen on 127.0.0.1:" + port + " -> " + ex.Message +
                          " (is another hbc-srv already running? try: HBC_PORT=2326)");
                return 2;
            }
            catch (Exception ex)
            {
                Log.Error("fatal: " + ex);
                return 1;
            }
        }
    }

    /// <summary>Console + best-effort file logging, so a TV start failure leaves a trace.</summary>
    internal static class Log
    {
        private static readonly object Gate = new object();
        private static string _file;

        public static string FilePath { get { return _file; } }

        public static void SetFile(string path)
        {
            _file = path;
        }

        public static void Info(string message) { Write("INFO ", message); }
        public static void Error(string message) { Write("ERROR", message); }

        private static void Write(string level, string message)
        {
            var line = DateTime.UtcNow.ToString("u") + " " + level + " " + message;
            try { Console.WriteLine(line); } catch { }
            if (_file == null) return;
            try
            {
                lock (Gate)
                {
                    var info = new FileInfo(_file);
                    if (info.Exists && info.Length > 512 * 1024) File.Delete(_file);
                    File.AppendAllText(_file, line + Environment.NewLine);
                }
            }
            catch
            {
                // Logging must never take the service down.
            }
        }
    }

    internal sealed class Session
    {
        public string Id;
        public Process Process;
        public readonly MemoryStream Buffer = new MemoryStream();
        public readonly object Gate = new object();
        public volatile bool Done;
        public volatile bool Truncated;
        public int ExitCode;
        public DateTime Last = DateTime.UtcNow;

        private int _pumpsLeft;
        private bool _exited;

        /* The process can exit before the stdout/stderr pumps have drained
           their final bytes. Only report Done once both are finished, or a
           fast program's output races the first poll and is lost. */
        public void BeginPumps(int count)
        {
            lock (Gate) _pumpsLeft = count;
        }

        public void PumpFinished()
        {
            lock (Gate)
            {
                if (_pumpsLeft > 0) _pumpsLeft--;
                MaybeDone();
            }
        }

        public void MarkExited(int exitCode)
        {
            lock (Gate)
            {
                ExitCode = exitCode;
                _exited = true;
                MaybeDone();
            }
        }

        private void MaybeDone()
        {
            if (_exited && _pumpsLeft <= 0)
            {
                Done = true;
                Last = DateTime.UtcNow;
            }
        }

        public void Append(byte[] data, int count)
        {
            lock (Gate)
            {
                if (Buffer.Length + count > 8 * 1024 * 1024)
                {
                    Truncated = true;
                    return;
                }
                Buffer.Write(data, 0, count);
            }
        }

        public Dictionary<string, object> Poll(long since, int max)
        {
            byte[] chunk;
            long next;
            bool done;
            int code;
            bool truncated;
            var take = 0;
            lock (Gate)
            {
                if (since < 0) since = 0;
                if (since > Buffer.Length) since = Buffer.Length;
                var available = (int)(Buffer.Length - since);
                take = Math.Min(available, max);
                chunk = new byte[take];
                if (take > 0) Array.Copy(Buffer.GetBuffer(), (int)since, chunk, 0, take);
                next = since + take;
                done = Done && next >= Buffer.Length;
                code = ExitCode;
                truncated = Truncated;
            }
            return new Dictionary<string, object>
            {
                ["b64"] = take > 0 ? Convert.ToBase64String(chunk) : "",
                ["next"] = next,
                ["done"] = done,
                ["code"] = code,
                ["truncated"] = truncated
            };
        }

        public void Input(byte[] bytes)
        {
            lock (Gate)
            {
                if (Done || Process == null) return;
                try
                {
                    var stream = Process.StandardInput.BaseStream;
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush();
                }
                catch
                {
                    // The program may have exited between the check and the write.
                }
            }
        }

        public void Kill()
        {
            try
            {
                if (Process != null && !Process.HasExited) Process.Kill();
            }
            catch
            {
                // Already gone.
            }
        }
    }

    internal sealed class HbcServer
    {
        private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
        {
            WriteIndented = true
        };

        private readonly int _port;
        private readonly string _installRoot;
        private readonly string _bundleRoot;
        private readonly string _dataRoot;
        private readonly string _catalogPath;
        private readonly Dictionary<string, Session> _sessions = new Dictionary<string, Session>();
        private readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
        private HttpListener _listener;

        public HbcServer(int port)
        {
            _port = port;
            var explicitData = Environment.GetEnvironmentVariable("HBC_DATA_ROOT");
            var explicitInstall = Environment.GetEnvironmentVariable("HBC_INSTALL_ROOT");

            _dataRoot = PickWritableRoot(explicitData, new[]
            {
                "/opt/usr/home/hbc",
                "/opt/usr/home/owner/share/hbc",
                "/opt/usr/home/owner/content/hbc",
                Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? "/tmp", "hbc"),
                "/tmp/hbc"
            });
            _installRoot = !string.IsNullOrEmpty(explicitInstall)
                ? explicitInstall
                : Path.Combine(_dataRoot, "programs");
            _bundleRoot = Env("HBC_BUNDLE_ROOT", Path.Combine(AppContext.BaseDirectory, "programs"));
            _catalogPath = Path.Combine(_dataRoot, "catalog.json");

            Directory.CreateDirectory(_installRoot);
            Log.SetFile(Path.Combine(_dataRoot, "hbc-srv.log"));
        }

        /// <summary>
        /// Returns the first directory we can actually create and write to. The stock
        /// /opt/usr/home/hbc is not writable for the normal TV user, which used to make
        /// the service exit before it ever opened its port.
        /// </summary>
        private static string PickWritableRoot(string explicitRoot, string[] fallbacks)
        {
            var list = new List<string>();
            if (!string.IsNullOrEmpty(explicitRoot)) list.Add(explicitRoot);
            list.AddRange(fallbacks);
            foreach (var dir in list)
            {
                try
                {
                    Directory.CreateDirectory(dir);
                    var probe = Path.Combine(dir, ".hbc-write-test");
                    File.WriteAllText(probe, "ok");
                    File.Delete(probe);
                    return dir;
                }
                catch (Exception ex)
                {
                    Console.WriteLine("data root not writable: " + dir + " (" + ex.GetType().Name + ")");
                }
            }
            throw new IOException("no writable data directory; set HBC_DATA_ROOT");
        }

        public async Task RunAsync()
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add("http://127.0.0.1:" + _port + "/");
            _listener.Start();

            Log.Info("hbc-srv 1.0.0 (" + RuntimeInformation.FrameworkDescription + ", " +
                     RuntimeInformation.ProcessArchitecture + ")");
            Log.Info("listening on http://127.0.0.1:" + _port + "/");
            Log.Info("data root:    " + _dataRoot);
            Log.Info("install root: " + _installRoot);
            Log.Info("bundle root:  " + _bundleRoot);
            Log.Info("dotnet host:  " + ResolveDotnet());
            Log.Info("elf loader:   " + (ResolveElfRun() ?? "(missing; native entry points exec directly)"));

            while (true)
            {
                var ctx = await _listener.GetContextAsync().ConfigureAwait(false);
                _ = Task.Run(() => HandleAsync(ctx));
            }
        }

        private async Task HandleAsync(HttpListenerContext ctx)
        {
            try
            {
                AddCors(ctx);
                if (string.Equals(ctx.Request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    ctx.Response.StatusCode = 204;
                    return;
                }

                var path = ctx.Request.Url.AbsolutePath.Trim('/');
                var seg = path.Length == 0
                    ? new string[0]
                    : path.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);

                if (seg.Length == 0)
                {
                    await WriteJson(ctx, 200, new Dictionary<string, object>
                    {
                        ["service"] = "hbc-srv",
                        ["version"] = "1.0.0",
                        ["endpoints"] = new[]
                        {
                            "GET /status", "GET /programs", "GET /program/{id}",
                            "GET /catalog", "POST /catalog", "POST /install",
                            "POST /uninstall", "POST /run", "GET /session/{id}",
                            "POST /session/{id}/input", "POST /session/{id}/resize",
                            "POST /session/{id}/kill"
                        }
                    });
                    return;
                }

                if (seg[0] == "status" && seg.Length == 1) { await HandleStatus(ctx); return; }
                if (seg[0] == "programs" && seg.Length == 1) { await HandlePrograms(ctx); return; }
                if (seg[0] == "program" && seg.Length == 2) { await HandleProgram(ctx, seg[1]); return; }
                if (seg[0] == "catalog" && seg.Length == 1) { await HandleCatalog(ctx); return; }
                if (seg[0] == "install" && seg.Length == 1) { await HandleInstall(ctx); return; }
                if (seg[0] == "uninstall" && seg.Length == 1) { await HandleUninstall(ctx); return; }
                if (seg[0] == "run" && seg.Length == 1) { await HandleRun(ctx); return; }
                if (seg[0] == "kill" && seg.Length == 1) { await HandleKill(ctx); return; }
                if (seg[0] == "session" && seg.Length >= 2)
                {
                    var id = seg[1];
                    if (seg.Length == 2 && ctx.Request.HttpMethod == "GET") { await HandleSessionPoll(ctx, id); return; }
                    if (seg.Length == 3 && seg[2] == "input") { await HandleSessionInput(ctx, id); return; }
                    if (seg.Length == 3 && seg[2] == "resize") { await HandleSessionResize(ctx, id); return; }
                    if (seg.Length == 3 && seg[2] == "kill") { await HandleSessionKill(ctx, id); return; }
                }

                await WriteJson(ctx, 404, Error("unknown endpoint"));
            }
            catch (Exception ex)
            {
                try { await WriteJson(ctx, 500, Error(ex.Message)); } catch { }
            }
            finally
            {
                try { ctx.Response.Close(); } catch { }
            }
        }

        private async Task HandleStatus(HttpListenerContext ctx)
        {
            CleanupSessions();
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["service"] = "hbc-srv",
                ["version"] = "1.0.0",
                ["platform"] = RuntimeInformation.OSDescription,
                ["architecture"] = RuntimeInformation.ProcessArchitecture.ToString(),
                ["installRoot"] = _installRoot,
                ["bundleRoot"] = _bundleRoot,
                ["programs"] = Installed().Count,
                ["sessions"] = _sessions.Count,
                ["time"] = DateTime.UtcNow.ToString("o")
            });
        }

        private async Task HandlePrograms(HttpListenerContext ctx)
        {
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["installed"] = Installed()
            });
        }

        private async Task HandleProgram(HttpListenerContext ctx, string id)
        {
            var dir = SafeCombine(_installRoot, SafeId(id));
            if (!Directory.Exists(dir))
            {
                await WriteJson(ctx, 404, Error("program not installed"));
                return;
            }
            var program = ReadInstalled(dir);
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["program"] = program,
                ["readme"] = DictString(program, "readme", "")
            });
        }

        private async Task HandleCatalog(HttpListenerContext ctx)
        {
            if (ctx.Request.HttpMethod == "GET")
            {
                object catalog = null;
                try
                {
                    if (File.Exists(_catalogPath))
                    {
                        using (var doc = JsonDocument.Parse(File.ReadAllText(_catalogPath)))
                        {
                            catalog = doc.RootElement.Clone();
                        }
                    }
                }
                catch
                {
                    catalog = null;
                }
                await WriteJson(ctx, 200, new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["catalog"] = catalog,
                    ["installed"] = Installed()
                });
                return;
            }

            if (ctx.Request.HttpMethod != "POST")
            {
                await WriteJson(ctx, 405, Error("method not allowed"));
                return;
            }

            var body = ParseJson(await ReadBody(ctx));
            JsonElement catalogElement;
            if (body.ValueKind == JsonValueKind.Object &&
                body.TryGetProperty("json", out var jsonValue))
            {
                if (jsonValue.ValueKind == JsonValueKind.String)
                {
                    using (var doc = JsonDocument.Parse(jsonValue.GetString()))
                    {
                        catalogElement = doc.RootElement.Clone();
                    }
                }
                else
                {
                    catalogElement = jsonValue.Clone();
                }
            }
            else
            {
                catalogElement = body.Clone();
            }

            File.WriteAllText(_catalogPath, JsonSerializer.Serialize(catalogElement, JsonOpts));
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["saved"] = _catalogPath
            });
        }

        private async Task HandleInstall(HttpListenerContext ctx)
        {
            if (ctx.Request.HttpMethod != "POST")
            {
                await WriteJson(ctx, 405, Error("method not allowed"));
                return;
            }

            var body = ParseJson(await ReadBody(ctx));
            var program = body.ValueKind == JsonValueKind.Object &&
                          body.TryGetProperty("program", out var p) &&
                          p.ValueKind == JsonValueKind.Object
                ? p.Clone()
                : default(JsonElement);

            var id = Str(body, "id");
            if (string.IsNullOrEmpty(id)) id = Str(program, "id");
            if (string.IsNullOrEmpty(id)) throw new InvalidOperationException("missing program id");

            var source = Str(body, "source", "remote");
            var baseUrl = Str(body, "baseUrl");
            if (string.IsNullOrEmpty(baseUrl)) baseUrl = Str(program, "baseUrl");

            var safeId = SafeId(id);
            var dest = SafeCombine(_installRoot, safeId);
            if (Directory.Exists(dest)) Directory.Delete(dest, true);
            Directory.CreateDirectory(dest);

            if (string.Equals(source, "bundle", StringComparison.OrdinalIgnoreCase))
            {
                var bundle = SafeCombine(_bundleRoot, safeId);
                if (!Directory.Exists(bundle))
                    throw new FileNotFoundException("bundled program not found: " + bundle);
                CopyDirectory(bundle, dest);
            }
            else
            {
                await DownloadProgram(program, dest, baseUrl);
            }

            var meta = program.ValueKind == JsonValueKind.Object
                ? ToDict(program)
                : new Dictionary<string, object>();
            meta["id"] = id;
            meta["installPath"] = dest;
            meta["installedAt"] = DateTime.UtcNow.ToString("o");
            meta["source"] = source;
            File.WriteAllText(Path.Combine(dest, "program.json"), JsonSerializer.Serialize(meta, JsonOpts));

            var installed = ReadInstalled(dest);
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["program"] = installed
            });
        }

        private async Task HandleUninstall(HttpListenerContext ctx)
        {
            if (ctx.Request.HttpMethod != "POST")
            {
                await WriteJson(ctx, 405, Error("method not allowed"));
                return;
            }
            var body = ParseJson(await ReadBody(ctx));
            var id = Str(body, "id");
            if (string.IsNullOrEmpty(id)) throw new InvalidOperationException("missing program id");
            var dir = SafeCombine(_installRoot, SafeId(id));
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["id"] = id,
                ["removed"] = true
            });
        }

        private async Task HandleRun(HttpListenerContext ctx)
        {
            if (ctx.Request.HttpMethod != "POST")
            {
                await WriteJson(ctx, 405, Error("method not allowed"));
                return;
            }

            var body = ParseJson(await ReadBody(ctx));
            var id = Str(body, "id");
            if (string.IsNullOrEmpty(id)) throw new InvalidOperationException("missing program id");

            var dir = SafeCombine(_installRoot, SafeId(id));
            if (!Directory.Exists(dir))
            {
                await WriteJson(ctx, 404, Error("program not installed: " + id));
                return;
            }

            var program = ReadInstalled(dir);
            var entry = DictString(program, "entry", "");
            if (string.IsNullOrEmpty(entry)) throw new InvalidOperationException("program has no entry point");

            var runtime = DictString(program, "runtime", "elf").ToLowerInvariant();
            var entryPath = SafeCombine(dir, entry);
            if (!File.Exists(entryPath)) throw new FileNotFoundException("entry point not found: " + entryPath);

            var cols = Clamp(IntValue(body, "cols", 80), 20, 400);
            var rows = Clamp(IntValue(body, "rows", 24), 5, 200);

            string exe;
            var args = new List<string>();
            if (runtime == "dotnet" && entry.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                exe = ResolveDotnet();
                args.Add(entryPath);
            }
            else if (runtime == "elf")
            {
                // Retail Tizen firmware enforces UEP: execve() and file-backed
                // mmap() of unsigned binaries fail with EPERM. The signed dotnet
                // host is allowed to map the image itself and jump to it from
                // anonymous RWX memory, so hand native programs to elf-run.
                var loader = ResolveElfRun();
                if (!string.IsNullOrEmpty(loader))
                {
                    exe = ResolveDotnet();
                    args.Add(loader);
                    args.Add(entryPath);
                }
                else
                {
                    Chmod(entryPath);
                    exe = entryPath;
                }
            }
            else
            {
                Chmod(entryPath);
                exe = entryPath;
            }

            foreach (var a in DictStringArray(program, "args")) args.Add(a);
            foreach (var a in ReadStringArray(body, "args")) args.Add(a);

            var session = StartSession(exe, args, dir, cols, rows);
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["session"] = session.Id,
                ["command"] = exe + " " + string.Join(" ", args.Select(Quote))
            });
        }

        private async Task HandleSessionPoll(HttpListenerContext ctx, string id)
        {
            Session session;
            if (!_sessions.TryGetValue(id, out session))
            {
                await WriteJson(ctx, 404, Error("unknown session"));
                return;
            }
            long since = 0;
            long.TryParse(ctx.Request.QueryString["since"], out since);
            var result = session.Poll(since, 65536);
            result["ok"] = true;
            result["session"] = id;
            await WriteJson(ctx, 200, result);
        }

        private async Task HandleSessionInput(HttpListenerContext ctx, string id)
        {
            Session session;
            if (!_sessions.TryGetValue(id, out session))
            {
                await WriteJson(ctx, 404, Error("unknown session"));
                return;
            }
            var body = ParseJson(await ReadBody(ctx));
            var b64 = Str(body, "b64");
            var bytes = Convert.FromBase64String(b64 ?? "");
            session.Input(bytes);
            await WriteJson(ctx, 200, new Dictionary<string, object> { ["ok"] = true });
        }

        private async Task HandleSessionResize(HttpListenerContext ctx, string id)
        {
            Session session;
            if (!_sessions.TryGetValue(id, out session))
            {
                await WriteJson(ctx, 404, Error("unknown session"));
                return;
            }
            await WriteJson(ctx, 200, new Dictionary<string, object>
            {
                ["ok"] = true,
                ["note"] = "PTY size is fixed at launch by this service"
            });
        }

        private async Task HandleSessionKill(HttpListenerContext ctx, string id)
        {
            Session session;
            if (_sessions.TryGetValue(id, out session)) session.Kill();
            await WriteJson(ctx, 200, new Dictionary<string, object> { ["ok"] = true });
        }

        private async Task HandleKill(HttpListenerContext ctx)
        {
            var body = ParseJson(await ReadBody(ctx));
            var id = Str(body, "session");
            Session session;
            if (!string.IsNullOrEmpty(id) && _sessions.TryGetValue(id, out session)) session.Kill();
            await WriteJson(ctx, 200, new Dictionary<string, object> { ["ok"] = true });
        }

        private Session StartSession(string exe, List<string> args, string workdir, int cols, int rows)
        {
            var psi = new ProcessStartInfo("/bin/sh")
            {
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = workdir
            };
            var shellCommand = BuildShellCommand(exe, args, cols, rows);
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add(shellCommand);
            psi.Environment["TERM"] = "xterm-256color";
            psi.Environment["COLORTERM"] = "truecolor";
            psi.Environment["LANG"] = "C.UTF-8";
            psi.Environment["LC_ALL"] = "C.UTF-8";
            if (!psi.Environment.ContainsKey("HOME")) psi.Environment["HOME"] = _dataRoot;

            var proc = new Process { StartInfo = psi };
            if (!proc.Start()) throw new InvalidOperationException("failed to start process");

            var session = new Session
            {
                Id = Guid.NewGuid().ToString("N").Substring(0, 12),
                Process = proc
            };
            lock (_sessions) _sessions[session.Id] = session;

            session.BeginPumps(2);
            _ = PumpAsync(session, proc.StandardOutput.BaseStream);
            _ = PumpAsync(session, proc.StandardError.BaseStream);
            _ = Task.Run(() =>
            {
                try { proc.WaitForExit(); } catch { }
                var code = -1;
                try { code = proc.ExitCode; } catch { }
                session.MarkExited(code);
            });

            return session;
        }

        private static async Task PumpAsync(Session session, Stream stream)
        {
            var buffer = new byte[8192];
            try
            {
                while (true)
                {
                    var read = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
                    if (read <= 0) break;
                    session.Append(buffer, read);
                }
            }
            catch
            {
                // Stream closed when the program exited.
            }
            finally
            {
                session.PumpFinished();
            }
        }

        private static string BuildShellCommand(string exe, List<string> args, int cols, int rows)
        {
            var sb = new StringBuilder();
            sb.Append("stty cols ").Append(cols).Append(" rows ").Append(rows).Append(" 2>/dev/null; exec ");
            sb.Append(Quote(exe));
            foreach (var arg in args) sb.Append(' ').Append(Quote(arg));
            var inner = sb.ToString();

            string script = null;
            if (File.Exists("/usr/bin/script")) script = "/usr/bin/script";
            else if (File.Exists("/bin/script")) script = "/bin/script";
            if (script == null) return inner;
            // -e makes script(1) return the child's exit code instead of 0.
            return Quote(script) + " -q -e -f -c " + Quote(inner) + " /dev/null";
        }

        private async Task DownloadProgram(JsonElement program, string dest, string baseUrl)
        {
            var files = new List<JsonElement>();
            if (program.ValueKind == JsonValueKind.Object &&
                program.TryGetProperty("files", out var fileArray) &&
                fileArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in fileArray.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.Object) files.Add(item.Clone());
                }
            }

            if (files.Count == 0)
            {
                var entry = Str(program, "entry");
                if (string.IsNullOrEmpty(entry)) throw new InvalidOperationException("program has no files and no entry");
                var bytes = await _http.GetByteArrayAsync(CombineUrl(baseUrl, entry)).ConfigureAwait(false);
                var target = SafeCombine(dest, entry);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.WriteAllBytes(target, bytes);
            }
            else
            {
                foreach (var file in files)
                {
                    var rel = Str(file, "path");
                    var url = Str(file, "url", rel);
                    if (string.IsNullOrEmpty(rel)) rel = Path.GetFileName(url);
                    if (string.IsNullOrEmpty(rel)) throw new InvalidOperationException("file has no path");

                    var bytes = await _http.GetByteArrayAsync(CombineUrl(baseUrl, url)).ConfigureAwait(false);

                    var size = LongValue(file, "size", 0);
                    if (size > 0 && bytes.LongLength != size)
                        throw new InvalidOperationException("size mismatch for " + rel);

                    var sha = Str(file, "sha256");
                    if (!string.IsNullOrEmpty(sha))
                    {
                        var actual = Sha256(bytes);
                        if (!string.Equals(actual, sha, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidOperationException("sha256 mismatch for " + rel);
                    }

                    var target = SafeCombine(dest, rel);
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    File.WriteAllBytes(target, bytes);
                    if (Bool(file, "executable")) Chmod(target);
                }
            }

            var readme = Str(program, "readme");
            if (!string.IsNullOrEmpty(readme))
            {
                try
                {
                    var target = SafeCombine(dest, readme);
                    if (!File.Exists(target))
                    {
                        var bytes = await _http.GetByteArrayAsync(CombineUrl(baseUrl, readme)).ConfigureAwait(false);
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        File.WriteAllBytes(target, bytes);
                    }
                }
                catch
                {
                    // A README is optional.
                }
            }
        }

        private List<Dictionary<string, object>> Installed()
        {
            var result = new List<Dictionary<string, object>>();
            if (!Directory.Exists(_installRoot)) return result;
            foreach (var dir in Directory.GetDirectories(_installRoot).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var program = ReadInstalled(dir);
                    if (program != null) result.Add(program);
                }
                catch
                {
                    // Skip a damaged install rather than failing the whole list.
                }
            }
            return result;
        }

        private static Dictionary<string, object> ReadInstalled(string dir)
        {
            var metaPath = Path.Combine(dir, "program.json");
            Dictionary<string, object> program;
            if (File.Exists(metaPath))
            {
                using (var doc = JsonDocument.Parse(File.ReadAllText(metaPath)))
                {
                    program = ToDict(doc.RootElement);
                }
            }
            else
            {
                program = new Dictionary<string, object>();
            }

            program["installPath"] = dir;
            if (!program.ContainsKey("id")) program["id"] = Path.GetFileName(dir);
            if (!program.ContainsKey("name")) program["name"] = Path.GetFileName(dir);

            var readme = ReadReadme(dir, program);
            if (readme != null) program["readme"] = readme;
            else if (!program.ContainsKey("readme")) program["readme"] = "";

            return program;
        }

        private static string ReadReadme(string dir, Dictionary<string, object> program)
        {
            var candidates = new List<string>();
            var declared = DictString(program, "readme", "");
            if (!string.IsNullOrEmpty(declared)) candidates.Add(declared);
            candidates.Add("README.md");
            candidates.Add("readme.md");
            candidates.Add("README.txt");

            foreach (var candidate in candidates)
            {
                try
                {
                    var path = SafeCombine(dir, candidate);
                    if (File.Exists(path)) return File.ReadAllText(path);
                }
                catch
                {
                    // Ignore unsafe or missing readme paths.
                }
            }
            return null;
        }

        private void CleanupSessions()
        {
            var cutoff = DateTime.UtcNow.AddMinutes(-30);
            lock (_sessions)
            {
                foreach (var key in _sessions.Keys.ToList())
                {
                    var s = _sessions[key];
                    if (s.Done && s.Last < cutoff) _sessions.Remove(key);
                }
            }
        }

        private static void CopyDirectory(string source, string dest)
        {
            Directory.CreateDirectory(dest);
            foreach (var file in Directory.GetFiles(source))
            {
                File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), true);
            }
            foreach (var dir in Directory.GetDirectories(source))
            {
                CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)));
            }
        }

        private static void Chmod(string path)
        {
            try
            {
                var psi = new ProcessStartInfo("/bin/chmod") { UseShellExecute = false };
                psi.ArgumentList.Add("+x");
                psi.ArgumentList.Add(path);
                using (var proc = Process.Start(psi))
                {
                    if (proc != null) proc.WaitForExit(3000);
                }
            }
            catch
            {
                // Non-fatal: the entry may already be executable.
            }
        }

        private static string ResolveElfRun()
        {
            var env = Environment.GetEnvironmentVariable("HBC_ELF_RUN");
            if (!string.IsNullOrEmpty(env) && File.Exists(env)) return env;
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "elf-run", "elf-run.dll"),
                Path.Combine(AppContext.BaseDirectory, "elf-run.dll")
            };
            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }

        private static string ResolveDotnet()
        {
            var env = Environment.GetEnvironmentVariable("HBC_DOTNET");
            if (!string.IsNullOrEmpty(env) && File.Exists(env)) return env;
            var root = Environment.GetEnvironmentVariable("DOTNET_ROOT");
            if (!string.IsNullOrEmpty(root) && File.Exists(Path.Combine(root, "dotnet")))
                return Path.Combine(root, "dotnet");
            var candidates = new[]
            {
                "/usr/share/dotnet.tizen/dotnet",
                "/usr/share/dotnet/dotnet",
                "/opt/usr/home/owner/share/dotnet/dotnet",
                "/opt/usr/share/dotnet/dotnet",
                "/usr/local/bin/dotnet",
                "/usr/bin/dotnet"
            };
            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate)) return candidate;
            }
            return "dotnet";
        }

        private static string SafeId(string id)
        {
            var value = (id ?? "").Trim().ToLowerInvariant();
            var sb = new StringBuilder(value.Length);
            foreach (var ch in value)
            {
                if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ||
                    ch == '.' || ch == '_' || ch == '-')
                {
                    sb.Append(ch);
                }
                else
                {
                    sb.Append('-');
                }
            }
            var result = sb.ToString().Trim('.', '-');
            return string.IsNullOrEmpty(result) ? "program" : result;
        }

        private static string SafeCombine(string root, string relative)
        {
            var rootFull = Path.GetFullPath(root);
            var rel = (relative ?? "").Replace('\\', '/').TrimStart('/');
            var full = Path.GetFullPath(Path.Combine(rootFull, rel));
            var prefix = rootFull.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal)
                ? rootFull
                : rootFull + Path.DirectorySeparatorChar;
            if (!full.StartsWith(prefix, StringComparison.Ordinal) &&
                !string.Equals(full, rootFull, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("path escapes install root: " + relative);
            }
            return full;
        }

        private static string CombineUrl(string baseUrl, string relative)
        {
            if (string.IsNullOrEmpty(relative)) return baseUrl ?? "";
            if (relative.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                relative.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return relative;
            }
            if (string.IsNullOrEmpty(baseUrl)) return relative;
            return baseUrl.TrimEnd('/') + "/" + relative.TrimStart('/');
        }

        private static string Sha256(byte[] bytes)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(bytes);
                var sb = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private static string Quote(string value)
        {
            if (value == null) value = "";
            return "'" + value.Replace("'", "'\\''") + "'";
        }

        private static string Env(string name, string fallback)
        {
            var value = Environment.GetEnvironmentVariable(name);
            return string.IsNullOrEmpty(value) ? fallback : value;
        }

        private static async Task<string> ReadBody(HttpListenerContext ctx)
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            {
                return await reader.ReadToEndAsync().ConfigureAwait(false);
            }
        }

        private static JsonElement ParseJson(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return default(JsonElement);
            try
            {
                using (var doc = JsonDocument.Parse(text))
                {
                    return doc.RootElement.Clone();
                }
            }
            catch (JsonException)
            {
                throw new InvalidOperationException("invalid JSON body");
            }
        }

        private static Dictionary<string, object> ToDict(JsonElement element)
        {
            var result = new Dictionary<string, object>();
            if (element.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in element.EnumerateObject())
                {
                    result[property.Name] = property.Value.Clone();
                }
            }
            return result;
        }

        private static string Str(JsonElement element, string name, string fallback = "")
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.String)
            {
                return value.GetString();
            }
            return fallback;
        }

        private static bool Bool(JsonElement element, string name, bool fallback = false)
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value))
            {
                if (value.ValueKind == JsonValueKind.True) return true;
                if (value.ValueKind == JsonValueKind.False) return false;
            }
            return fallback;
        }

        private static int IntValue(JsonElement element, string name, int fallback)
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.Number &&
                value.TryGetInt32(out var parsed))
            {
                return parsed;
            }
            return fallback;
        }

        private static long LongValue(JsonElement element, string name, long fallback)
        {
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.Number &&
                value.TryGetInt64(out var parsed))
            {
                return parsed;
            }
            return fallback;
        }

        private static IEnumerable<string> ReadStringArray(JsonElement element, string name)
        {
            var result = new List<string>();
            if (element.ValueKind == JsonValueKind.Object &&
                element.TryGetProperty(name, out var value) &&
                value.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in value.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String) result.Add(item.GetString());
                }
            }
            return result;
        }

        private static IEnumerable<string> DictStringArray(Dictionary<string, object> dict, string key)
        {
            var result = new List<string>();
            object value;
            if (!dict.TryGetValue(key, out value) || value == null) return result;
            var element = value as JsonElement?;
            if (!element.HasValue) return result;
            var e = element.Value;
            if (e.ValueKind != JsonValueKind.Array) return result;
            foreach (var item in e.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String) result.Add(item.GetString());
            }
            return result;
        }

        private static string DictString(Dictionary<string, object> dict, string key, string fallback = "")
        {
            object value;
            if (!dict.TryGetValue(key, out value) || value == null) return fallback;
            var element = value as JsonElement?;
            if (element.HasValue)
            {
                var e = element.Value;
                if (e.ValueKind == JsonValueKind.String) return e.GetString();
                if (e.ValueKind == JsonValueKind.Number) return e.ToString();
                return fallback;
            }
            return value.ToString();
        }

        private static int Clamp(int value, int min, int max)
        {
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        private static Dictionary<string, object> Error(string message)
        {
            return new Dictionary<string, object>
            {
                ["ok"] = false,
                ["error"] = message ?? "error"
            };
        }

        private static void AddCors(HttpListenerContext ctx)
        {
            ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
            ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-HBC";
            ctx.Response.Headers["Access-Control-Max-Age"] = "86400";
        }

        private static async Task WriteJson(HttpListenerContext ctx, int status, object value)
        {
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, JsonOpts));
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.ContentLength64 = bytes.Length;
            await ctx.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
        }
    }
}
