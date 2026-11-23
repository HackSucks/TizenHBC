using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Threading;

internal static class Program
{
    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------

    private const int PROT_NONE = 0;
    private const int PROT_READ = 1;
    private const int PROT_WRITE = 2;
    private const int PROT_EXEC = 4;

    private const int MAP_PRIVATE = 2;
    private const int MAP_FIXED = 0x10;
    private const int MAP_ANONYMOUS = 0x20;
    private const int MAP_32BIT = 0x40;

    private const uint PT_LOAD = 1;
    private const uint PT_INTERP = 3;

    private const uint PF_X = 1;
    private const uint PF_W = 2;
    private const uint PF_R = 4;

    private const int ELFCLASS32 = 1;
    private const int ELFDATA2LSB = 1;
    private const int EM_ARM = 40;
    private const int ET_EXEC = 2;
    private const int ET_DYN = 3;

    private const uint AT_NULL = 0;
    private const uint AT_PHDR = 3;
    private const uint AT_PHENT = 4;
    private const uint AT_PHNUM = 5;
    private const uint AT_PAGESZ = 6;
    private const uint AT_BASE = 7;
    private const uint AT_FLAGS = 8;
    private const uint AT_ENTRY = 9;
    private const uint AT_UID = 11;
    private const uint AT_EUID = 12;
    private const uint AT_GID = 13;
    private const uint AT_EGID = 14;
    private const uint AT_PLATFORM = 15;
    private const uint AT_HWCAP = 16;
    private const uint AT_CLKTCK = 17;
    private const uint AT_SECURE = 23;
    private const uint AT_RANDOM = 25;
    private const uint AT_EXECFN = 31;

    // Open flags (Linux/ARM, same as x86 legacy ABI)
    private const int O_RDONLY = 0;
    private const int O_WRONLY = 1;
    private const int O_RDWR = 2;
    private const int O_ACCMODE = 3;
    private const int O_CREAT = 0x40;
    private const int O_EXCL = 0x80;
    private const int O_NOCTTY = 0x100;
    private const int O_TRUNC = 0x200;
    private const int O_APPEND = 0x400;
    private const int O_NONBLOCK = 0x800;
    private const int O_DIRECTORY = 0x10000;
    private const int O_CLOEXEC = 0x80000;

    // ARM EABI syscall numbers (passed in r7).
    private const uint SYS_exit = 1;
    private const uint SYS_fork = 2;
    private const uint SYS_read = 3;
    private const uint SYS_write = 4;
    private const uint SYS_open = 5;
    private const uint SYS_close = 6;
    private const uint SYS_wait4 = 7;
    private const uint SYS_creat = 8;
    private const uint SYS_link = 9;
    private const uint SYS_unlink = 10;
    private const uint SYS_execve = 11;
    private const uint SYS_chdir = 12;
    private const uint SYS_time = 13;
    private const uint SYS_mknod = 14;
    private const uint SYS_chmod = 15;
    private const uint SYS_lchown = 16;
    private const uint SYS_lseek = 19;
    private const uint SYS_getpid = 20;
    private const uint SYS_getuid = 24;
    private const uint SYS_geteuid = 25;
    private const uint SYS_getgid = 26;
    private const uint SYS_getegid = 27;
    private const uint SYS_access = 33;
    private const uint SYS_sync = 36;
    private const uint SYS_mkdir = 39;
    private const uint SYS_brk = 45;
    private const uint SYS_ioctl = 54;
    private const uint SYS_fcntl = 55;
    private const uint SYS_dup = 41;
    private const uint SYS_dup2 = 63;
    private const uint SYS_pipe = 42;
    private const uint SYS_fstat = 108;
    private const uint SYS_newfstatat = 296;
    private const uint SYS_openat = 295;
    private const uint SYS_mmap = 90;
    private const uint SYS_mprotect = 125;
    private const uint SYS_munmap = 91;
    private const uint SYS_mmap2 = 192;
    private const uint SYS_rt_sigaction = 174;
    private const uint SYS_rt_sigprocmask = 175;
    private const uint SYS_rt_sigreturn = 173;
    private const uint SYS_sigaltstack = 181;
    private const uint SYS_sigprocmask = 64;
    private const uint SYS_sigpending = 73;
    private const uint SYS_sigsuspend = 72;
    private const uint SYS_getrlimit = 65;
    private const uint SYS_getrusage = 67;
    private const uint SYS_setrlimit = 66;
    private const uint SYS_gettimeofday = 76;
    private const uint SYS_uname = 147;
    private const uint SYS_clock_gettime = 111;
    private const uint SYS_nanosleep = 35;
    private const uint SYS_pause = 29;
    private const uint SYS_getdents64 = 280;
    private const uint SYS_prctl = 157;
    private const uint SYS_set_robust_list = 248;
    private const uint SYS_futex = 140;
    private const uint SYS_sched_yield = 167;
    private const uint SYS_getrandom = 318;
    private const uint SYS_exit_group = 247;

    private const int ECHILD = 10;
    private const int ENOENT = 2;
    private const int EBADF = 9;
    private const int EACCES = 13;
    private const int EFAULT = 14;
    private const int EINVAL = 22;
    private const int ENOMEM = 12;
    private const int ENOSPC = 28;
    private const int ESPIPE = 29;
    private const int EROFS = 30;
    private const int ENOSYS = 38;
    private const int ENOTEMPTY = 39;
    private const int ELOOP = 40;
    private const int EOPNOTSUPP = 95;
    private const int ENOTTY = 25;
    private const int EINTR = 4;
    private const int EIO = 5;

    private const uint TCGETS = 0x5401;
    private const uint TCSETS = 0x5402;
    private const uint TCSETSW = 0x5403;
    private const uint TCSETSF = 0x5404;
    private const uint TIOCGWINSZ = 0x5411;
    private const uint FIONREAD = 0x541B;

    private const int AT_FDCWD = -100;

    private const int Quantum = 20000;

    private static readonly bool Verbose =
        string.Equals(Environment.GetEnvironmentVariable("HBC_ELF_RUN_VERBOSE"), "1",
            StringComparison.OrdinalIgnoreCase);

    private static readonly string Rootfs =
        Environment.GetEnvironmentVariable("HBC_ELF_RUN_ROOTFS") ?? "";

    // ------------------------------------------------------------------
    // P/Invoke into host libc (we run on the same ARMv7 userspace as the guest)
    // ------------------------------------------------------------------

    [DllImport("libc", SetLastError = true)]
    private static extern IntPtr mmap(IntPtr addr, UIntPtr length, int prot, int flags, int fd, IntPtr offset);

    [DllImport("libc", SetLastError = true)]
    private static extern int munmap(IntPtr addr, UIntPtr length);

    [DllImport("libc", SetLastError = true)]
    private static extern int mprotect(IntPtr addr, UIntPtr length, int prot);

    [DllImport("libc")]
    private static extern uint getauxval(uint type);

    [DllImport("libc")]
    private static extern uint getuid();

    [DllImport("libc")]
    private static extern uint geteuid();

    [DllImport("libc")]
    private static extern uint getgid();

    [DllImport("libc")]
    private static extern uint getegid();

    private static readonly IntPtr Invalid = new IntPtr(-1);
    private static readonly IntPtr Zero = IntPtr.Zero;

    private static IntPtr Ptr(uint value) => new IntPtr(unchecked((int)value));

    // ------------------------------------------------------------------
    // Guest memory model
    // ------------------------------------------------------------------
    //
    // Each emulated process owns a list of segments. A segment maps a guest
    // virtual address range onto a host anonymous mapping. Guest VA and host
    // VA are usually identical, but fork()ed children get their own host
    // copies at different host addresses, so every guest access is translated
    // through GuestBase -> HostBase. mmap/mprotect/munmap/brk are emulated
    // and never reach the host kernel, so UEP (which checks file-backed exec
    // and PROT_EXEC file mappings) is never consulted for guest memory.

    private sealed class Segment
    {
        public uint GuestBase;
        public uint Size;
        public IntPtr Host;
        public int Prot;
    }

    private sealed class FdEntry
    {
        public Stream Stream;
        public string Path;
        public bool Cloexec;
    }

    internal sealed class Pipe
    {
        private readonly byte[] buf = new byte[32768];
        private int rd;
        private int wr;
        private int cnt;
        private bool writeClosed;

        public int Read(byte[] b, int off, int len)
        {
            lock (this)
            {
                while (cnt == 0 && !writeClosed)
                    Monitor.Wait(this, Timeout.Infinite);
                if (cnt == 0) return 0;
                int n = Math.Min(len, cnt);
                for (int i = 0; i < n; i++)
                {
                    b[off + i] = buf[rd];
                    rd = (rd + 1) % buf.Length;
                }
                cnt -= n;
                Monitor.PulseAll(this);
                return n;
            }
        }

        public void Write(byte[] b, int off, int len)
        {
            lock (this)
            {
                while (cnt + len > buf.Length)
                    Monitor.Wait(this, Timeout.Infinite);
                for (int i = 0; i < len; i++)
                {
                    buf[wr] = b[off + i];
                    wr = (wr + 1) % buf.Length;
                }
                cnt += len;
                Monitor.PulseAll(this);
            }
        }

        public void CloseWrite()
        {
            lock (this)
            {
                writeClosed = true;
                Monitor.PulseAll(this);
            }
        }
    }

    private sealed class EmulatedProcess
    {
        public int Pid;
        public int PPid;
        public uint[] R = new uint[16]; // R[15] = PC (bit0 = Thumb flag)
        public uint Pc { get => R[15]; set => R[15] = value; }
        public uint Cpsr;
        public uint TcbBase;            // synthetic thread pointer base (guest VA)
        public List<Segment> Segments = new List<Segment>();
        public uint Brk;                // current program break (guest VA)
        public List<FdEntry> Fds = new List<FdEntry>();
        public List<EmulatedProcess> Children = new List<EmulatedProcess>();

        public enum EpState { Running, Exited, Waiting }
        public EpState State = EpState.Running;
        public int ExitCode;
        // wait4 blocking state
        public int WaitPid;
        public uint WaitStatPtr;

        // IT (if-then) block state for Thumb
        public int ItRemaining;
        public uint ItMask;
        public uint ItCond;
    }

    // ------------------------------------------------------------------
    // Memory access
    // ------------------------------------------------------------------

    private static Segment FindSegment(EmulatedProcess ep, uint va)
    {
        foreach (var seg in ep.Segments)
            if (va >= seg.GuestBase && va < seg.GuestBase + seg.Size)
                return seg;
        return null;
    }

    // Resolve a guest VA to a host address, faulting in a fresh anonymous
    // page when nothing is mapped there (lazy brk/stack growth).
    private static bool ResolveVa(EmulatedProcess ep, uint va, out Segment seg, out IntPtr host)
    {
        seg = FindSegment(ep, va);
        if (seg != null)
        {
            host = IntPtr.Add(seg.Host, (int)(va - seg.GuestBase));
            return true;
        }

        uint page = va & 0xfffff000u;
        IntPtr h = mmap(Ptr(page), (UIntPtr)4096, PROT_READ | PROT_WRITE | PROT_EXEC,
            MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED | MAP_32BIT, -1, Zero);
        if (h == Invalid)
        {
            h = mmap(Zero, (UIntPtr)4096, PROT_READ | PROT_WRITE | PROT_EXEC,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, Zero);
            if (h == Invalid) { host = Zero; return false; }
        }
        seg = new Segment { GuestBase = page, Host = h, Size = 4096, Prot = PROT_READ | PROT_WRITE | PROT_EXEC };
        ep.Segments.Add(seg);
        host = IntPtr.Add(h, (int)(va - page));
        return true;
    }

    private static byte ReadU8(EmulatedProcess ep, uint va)
    {
        if (!ResolveVa(ep, va, out var seg, out var host))
            Crash(ep, "memory read fault at 0x" + va.ToString("x8"));
        return Marshal.ReadByte(host);
    }

    private static ushort ReadU16(EmulatedProcess ep, uint va)
    {
        return (ushort)(ReadU8(ep, va) | (ReadU8(ep, va + 1) << 8));
    }

    private static uint ReadU32(EmulatedProcess ep, uint va)
    {
        return (uint)(ReadU8(ep, va) | (ReadU8(ep, va + 1) << 8) |
            (ReadU8(ep, va + 2) << 16) | (ReadU8(ep, va + 3) << 24));
    }

    private static void WriteU8(EmulatedProcess ep, uint va, byte value)
    {
        if (!ResolveVa(ep, va, out var seg, out var host))
            Crash(ep, "memory write fault at 0x" + va.ToString("x8"));
        Marshal.WriteByte(host, value);
    }

    private static void WriteU16(EmulatedProcess ep, uint va, ushort value)
    {
        WriteU8(ep, va, (byte)(value & 0xFF));
        WriteU8(ep, va + 1, (byte)((value >> 8) & 0xFF));
    }

    private static void WriteU32(EmulatedProcess ep, uint va, uint value)
    {
        WriteU8(ep, va, (byte)(value & 0xFF));
        WriteU8(ep, va + 1, (byte)((value >> 8) & 0xFF));
        WriteU8(ep, va + 2, (byte)((value >> 16) & 0xFF));
        WriteU8(ep, va + 3, (byte)((value >> 24) & 0xFF));
    }

    private static string ReadCString(EmulatedProcess ep, uint va, int max = 4096)
    {
        var sb = new StringBuilder(max);
        for (int i = 0; i < max; i++)
        {
            byte b = ReadU8(ep, va + (uint)i);
            if (b == 0) return sb.ToString();
            sb.Append((char)b);
        }
        return sb.ToString();
    }

    private static uint WriteCString(EmulatedProcess ep, uint va, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value + "\0");
        for (int i = 0; i < bytes.Length; i++) WriteU8(ep, va + (uint)i, bytes[i]);
        return va + (uint)bytes.Length;
    }

    private static void Crash(EmulatedProcess ep, string reason)
    {
        ep.State = EmulatedProcess.EpState.Exited;
        ep.ExitCode = 139;
        Console.Error.WriteLine("elf-run: pid " + ep.Pid +
            " crashed at pc=0x" + ep.R[15].ToString("x8") + ": " + reason);
    }

    // ------------------------------------------------------------------
    // ELF loading (into an EmulatedProcess)
    // ------------------------------------------------------------------

    private static uint U32(byte[] data, int offset) => BitConverter.ToUInt32(data, offset);
    private static ushort U16(byte[] data, int offset) => BitConverter.ToUInt16(data, offset);

    private static void Validate(byte[] image, string label)
    {
        if (image.Length < 52 ||
            image[0] != 0x7f || image[1] != (byte)'E' || image[2] != (byte)'L' || image[3] != (byte)'F')
            throw new Exception(label + ": not an ELF file");
        if (image[4] != ELFCLASS32 || image[5] != ELFDATA2LSB)
            throw new Exception(label + ": only little-endian ELF32 is supported");
        if (U16(image, 18) != EM_ARM)
            throw new Exception(label + ": not an ARM ELF (e_machine=" + U16(image, 18) + ")");
        var type = U16(image, 16);
        if (type != ET_EXEC && type != ET_DYN)
            throw new Exception(label + ": unsupported ELF type " + type);
    }

    private static uint AlignUp(uint value, uint align) => (value + align - 1) & ~(align - 1);
    private static uint PageDown(uint value) => value & 0xfffff000u;

    private struct ElfSegment
    {
        public uint Offset;
        public uint Vaddr;
        public uint FileSize;
        public uint MemSize;
        public uint Flags;
    }

    private struct LoadResult
    {
        public uint Base;
        public uint Entry;
        public uint Phdr;
        public ushort PhEntSize;
        public ushort PhNum;
    }

    // Load an ELF image into ep. When replaceImage is true any previous image
    // belonging to this process is unmapped first. Returns load info.
    private static LoadResult LoadImageInto(EmulatedProcess ep, byte[] image, string label, uint requestedBase,
        bool replaceImage)
    {
        Validate(image, label);

        if (replaceImage) UnmapSegments(ep);

        var type = U16(image, 16);
        var phoff = U32(image, 28);
        var phentsize = U16(image, 42);
        var phnum = U16(image, 44);
        if (phentsize < 32 || phnum == 0)
            throw new Exception(label + ": missing program headers");

        var segments = new List<ElfSegment>();
        uint span = 0;
        for (var i = 0; i < phnum; i++)
        {
            var at = (int)(phoff + (uint)i * phentsize);
            if (at + 32 > image.Length)
                throw new Exception(label + ": truncated program header table");
            if (U32(image, at) != PT_LOAD) continue;
            var segment = new ElfSegment
            {
                Offset = U32(image, at + 4),
                Vaddr = U32(image, at + 8),
                FileSize = U32(image, at + 16),
                MemSize = U32(image, at + 20),
                Flags = U32(image, at + 24)
            };
            if (segment.FileSize > segment.MemSize)
                throw new Exception(label + ": segment file size exceeds memory size");
            if ((ulong)segment.Offset + segment.FileSize > (ulong)image.Length)
                throw new Exception(label + ": segment extends past the end of the file");
            segments.Add(segment);
            var end = segment.Vaddr + segment.MemSize;
            if (end > span) span = end;
        }
        if (segments.Count == 0) throw new Exception(label + ": no loadable segments");

        uint imageBase;
        if (type == ET_EXEC)
        {
            imageBase = 0;
            if (requestedBase != 0)
                throw new Exception(label + ": a non-PIE image cannot be relocated");
        }
        else
        {
            imageBase = requestedBase != 0 ? requestedBase : Reserve(span);
        }

        foreach (var segment in segments)
        {
            var mapStart = PageDown(segment.Vaddr);
            var delta = segment.Vaddr - mapStart;
            var mapLen = AlignUp(delta + segment.MemSize, 4096);
            var guestBase = imageBase + mapStart;
            IntPtr h = mmap(Ptr(guestBase), (UIntPtr)mapLen,
                PROT_READ | PROT_WRITE | PROT_EXEC,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED | MAP_32BIT, -1, Zero);
            if (h == Invalid)
                throw new Exception(label + ": mmap failed at 0x" + guestBase.ToString("x8"));
            if (segment.FileSize > 0)
                Marshal.Copy(image, (int)segment.Offset, IntPtr.Add(h, (int)(segment.Vaddr - mapStart)),
                    (int)segment.FileSize);
            ep.Segments.Add(new Segment
            {
                GuestBase = guestBase,
                Host = h,
                Size = mapLen,
                Prot = PROT_READ | PROT_WRITE | PROT_EXEC
            });
        }

        // Apply segment protections.
        foreach (var segment in segments)
        {
            var mapStart = PageDown(segment.Vaddr);
            var delta = segment.Vaddr - mapStart;
            var mapLen = AlignUp(delta + segment.MemSize, 4096);
            int prot = 0;
            if ((segment.Flags & PF_R) != 0) prot |= PROT_READ;
            if ((segment.Flags & PF_W) != 0) prot |= PROT_WRITE;
            if ((segment.Flags & PF_X) != 0) prot |= PROT_EXEC;
            if (prot == 0) prot = PROT_READ;
            mprotect(IntPtr.Add(Ptr(imageBase + mapStart), 0), (UIntPtr)mapLen, prot);
        }

        uint phdr = 0;
        foreach (var segment in segments)
        {
            if (phoff >= segment.Offset && phoff < segment.Offset + segment.FileSize)
            {
                phdr = imageBase + segment.Vaddr + (phoff - segment.Offset);
                break;
            }
        }
        if (phdr == 0) phdr = imageBase + segments[0].Vaddr + phoff;

        ep.Brk = AlignUp(imageBase + span, 4096);

        return new LoadResult
        {
            Base = imageBase,
            Entry = imageBase + U32(image, 24),
            Phdr = phdr,
            PhEntSize = phentsize,
            PhNum = phnum
        };
    }

    private static uint Reserve(uint length)
    {
        var reservation = mmap(Zero, (UIntPtr)AlignUp(length, 4096), PROT_NONE,
            MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, Zero);
        if (reservation == Invalid)
            throw new Exception("cannot reserve address space");
        return (uint)reservation;
    }

    private static void UnmapSegments(EmulatedProcess ep)
    {
        foreach (var seg in ep.Segments)
            munmap(seg.Host, (UIntPtr)seg.Size);
        ep.Segments.Clear();
    }

    private static string InterpPath(byte[] image)
    {
        var phoff = U32(image, 28);
        var phentsize = U16(image, 42);
        var phnum = U16(image, 44);
        for (var i = 0; i < phnum; i++)
        {
            var at = (int)(phoff + (uint)i * phentsize);
            if (U32(image, at) != PT_INTERP) continue;
            var offset = (int)U32(image, at + 4);
            var size = (int)U32(image, at + 16);
            if (offset < 0 || size <= 0 || offset + size > image.Length) return null;
            return Encoding.UTF8.GetString(image, offset, size).TrimEnd('\0');
        }
        return null;
    }

    private static string ResolveInterp(string requested)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrEmpty(requested)) candidates.Add(requested);
        candidates.Add("/lib/ld-linux.so.3");
        candidates.Add("/lib/ld-linux-armhf.so.3");
        candidates.Add("/lib/ld-2.30.so");
        foreach (var candidate in candidates)
        {
            var p = ResolveHostPath(null, candidate);
            if (p != null) return p;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Emulated process setup / teardown
    // ------------------------------------------------------------------

    private static int AllocFd(EmulatedProcess ep, Stream stream, string path, bool cloexec)
    {
        for (var i = 0; i < ep.Fds.Count; i++)
            if (ep.Fds[i] == null) { ep.Fds[i] = new FdEntry { Stream = stream, Path = path, Cloexec = cloexec }; return i; }
        ep.Fds.Add(new FdEntry { Stream = stream, Path = path, Cloexec = cloexec });
        return ep.Fds.Count - 1;
    }

    private static FdEntry GetFd(EmulatedProcess ep, int fd)
    {
        if (fd < 0 || fd >= ep.Fds.Count) return null;
        return ep.Fds[fd];
    }

    private static string ResolveHostPath(EmulatedProcess ep, string path)
    {
        if (string.IsNullOrEmpty(path)) return null;
        var candidates = new List<string>();
        if (path.Length > 0 && path[0] == '/')
        {
            candidates.Add(path);
            if (!string.IsNullOrEmpty(Rootfs)) candidates.Add(Rootfs + path);
        }
        else
        {
            var cwd = Environment.CurrentDirectory;
            candidates.Add(Path.Combine(cwd, path));
            if (!string.IsNullOrEmpty(Rootfs)) candidates.Add(Path.Combine(Rootfs, Path.Combine(cwd, path)));
        }
        foreach (var c in candidates)
        {
            try
            {
                if (File.Exists(c) || Directory.Exists(c)) return c;
            }
            catch { }
        }
        return null;
    }

    // Build the initial user stack: argc, argv[], envp[], auxv, plus the
    // argument/environment strings themselves. Returns the initial sp.
    private static uint SetupStack(EmulatedProcess ep, string[] argv, string[] envp,
                                   LoadResult main, LoadResult interpreter)
    {
        const uint stackSize = 8 * 1024 * 1024;
        var stackBase = mmap(Zero, (UIntPtr)stackSize, PROT_READ | PROT_WRITE,
            MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, Zero);
        if (stackBase == Invalid) throw new Exception("cannot allocate stack");
        var stackTop = (uint)stackBase + stackSize;
        ep.Segments.Add(new Segment { GuestBase = stackTop - stackSize, Host = stackBase, Size = stackSize, Prot = PROT_READ | PROT_WRITE });

        uint sp = stackTop;

        Func<byte[], uint> pushBytes = bytes =>
        {
            sp = (sp - (uint)bytes.Length) & 0xfffffffcu;
            for (int i = 0; i < bytes.Length; i++) WriteU8(ep, sp + (uint)i, bytes[i]);
            return sp;
        };

        Func<string, uint> pushString = value =>
        {
            var bytes = Encoding.UTF8.GetBytes(value + "\0");
            return pushBytes(bytes);
        };

        var argvPtrs = new uint[argv.Length];
        for (var i = 0; i < argv.Length; i++) argvPtrs[i] = pushString(argv[i]);

        var environment = new List<string>();
        foreach (System.Collections.DictionaryEntry item in Environment.GetEnvironmentVariables())
            environment.Add(item.Key + "=" + item.Value);
        if (envp != null)
            foreach (var e in envp) environment.Add(e);
        var envPtrs = new uint[environment.Count];
        for (var i = 0; i < environment.Count; i++) envPtrs[i] = pushString(environment[i]);

        var random = new byte[16];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
        var randomPtr = pushBytes(random);

        var platformPtr = pushString("v7l");

        var aux = new List<uint>
        {
            AT_PHDR, main.Phdr,
            AT_PHENT, main.PhEntSize,
            AT_PHNUM, main.PhNum,
            AT_PAGESZ, 4096,
            AT_BASE, interpreter.Base,
            AT_FLAGS, 0,
            AT_ENTRY, main.Entry,
            AT_UID, getuid(),
            AT_EUID, geteuid(),
            AT_GID, getgid(),
            AT_EGID, getegid(),
            AT_PLATFORM, platformPtr,
            AT_HWCAP, getauxval(AT_HWCAP),
            AT_CLKTCK, 100,
            AT_SECURE, 0,
            AT_RANDOM, randomPtr,
            AT_EXECFN, argvPtrs.Length > 0 ? argvPtrs[0] : pushString("/bin/elf-run"),
            AT_NULL, 0
        };

        var words = 1 + argvPtrs.Length + 1 + envPtrs.Length + 1 + aux.Count;
        sp = (sp - (uint)(words * 4)) & 0xfffffff8u;

        var cursor = sp;
        Action<uint> put = value =>
        {
            WriteU32(ep, cursor, value);
            cursor += 4;
        };
        put((uint)argvPtrs.Length);
        foreach (var value in argvPtrs) put(value);
        put(0);
        foreach (var value in envPtrs) put(value);
        put(0);
        foreach (var value in aux) put(value);

        return sp;
    }

    private sealed class LoadedElf
    {
        public byte[] Image;
        public uint Base;
        public uint Entry;
        public uint Phdr;
        public ushort PhEntSize;
        public ushort PhNum;
    }

    // Replace ep's entire image with a new ELF (execve semantics). pid and
    // fds are preserved; registers are reset.
    private static void ExecImage(EmulatedProcess ep, string path, string[] argv, string[] envp)
    {
        string hostPath = ResolveHostPath(ep, path);
        if (hostPath == null) throw new FileNotFoundException("execve: " + path);
        byte[] image;
        try { image = File.ReadAllBytes(hostPath); }
        catch (Exception ex) { throw new Exception("cannot read " + hostPath + ": " + ex.Message); }

        Validate(image, hostPath);
        var interpPath = InterpPath(image);
        LoadedElf interpreter = null;
        uint interpEntry = 0;
        if (!string.IsNullOrEmpty(interpPath))
        {
            var resolved = ResolveInterp(interpPath);
            if (resolved == null) throw new Exception("dynamic linker not found: " + interpPath);
            byte[] interpImage = File.ReadAllBytes(resolved);
            interpreter = new LoadedElf { Image = interpImage };
        }

        // Load the main image first, then the interpreter into the same
        // address space (mirroring how a real dynamic loader works).
        var main = LoadImageInto(ep, image, hostPath, 0, true);
        uint mainEntry = main.Entry;
        uint mainPhdr = main.Phdr;
        ushort mainPhEntSize = main.PhEntSize;
        ushort mainPhNum = main.PhNum;

        if (interpreter != null)
        {
            var ires = LoadImageInto(ep, interpreter.Image, interpPath, 0, false);
            interpEntry = ires.Entry;
            interpreter.Base = ires.Base;
            interpreter.Entry = ires.Entry;
            interpreter.Phdr = ires.Phdr;
            interpreter.PhEntSize = ires.PhEntSize;
            interpreter.PhNum = ires.PhNum;
        }

        // Reset CPU state.
        for (var i = 0; i < 16; i++) ep.R[i] = 0;
        ep.Cpsr = 0;
        ep.Brk = AlignUp(ep.Brk, 4096);
        ep.TcbBase = 0;
        ep.ItRemaining = 0;

        var sp = SetupStack(ep, argv, envp,
            new LoadResult { Base = 0, Entry = mainEntry, Phdr = mainPhdr, PhEntSize = mainPhEntSize, PhNum = mainPhNum },
            interpreter != null
                ? new LoadResult { Base = interpreter.Base, Entry = interpEntry, Phdr = interpreter.Phdr, PhEntSize = interpreter.PhEntSize, PhNum = interpreter.PhNum }
                : new LoadResult { Base = 0, Entry = 0, Phdr = 0, PhEntSize = 0, PhNum = 0 });

        var entry = interpreter != null ? interpEntry : mainEntry;
        ep.R[13] = sp;
        ep.R[14] = 0xFFFFFFFFu;
        ep.R[15] = entry; // bit0 selects Thumb vs ARM
        ep.State = EmulatedProcess.EpState.Running;

        // Close fds marked close-on-exec.
        for (var i = 0; i < ep.Fds.Count; i++)
        {
            var fe = ep.Fds[i];
            if (fe != null && fe.Cloexec) { fe.Stream.Dispose(); ep.Fds[i] = null; }
        }
    }

    // ------------------------------------------------------------------
    // ARM condition codes
    // ------------------------------------------------------------------

    private static bool CondPassed(uint cond, uint cpsr)
    {
        var N = (cpsr >> 31) & 1u;
        var Z = (cpsr >> 30) & 1u;
        var C = (cpsr >> 29) & 1u;
        var V = (cpsr >> 28) & 1u;
        switch (cond)
        {
            case 0: return Z == 1;   // EQ
            case 1: return Z == 0;   // NE
            case 2: return C == 1;   // HS/CS
            case 3: return C == 0;   // LO/CC
            case 4: return N == 1;   // MI
            case 5: return N == 0;   // PL
            case 6: return V == 1;   // VS
            case 7: return V == 0;   // VC
            case 8: return C == 1 && Z == 0; // HI
            case 9: return C == 0 || Z == 1; // LS
            case 10: return N == V;  // GE
            case 11: return N != V;  // LT
            case 12: return Z == 0 && N == V; // GT
            case 13: return Z == 1 || N != V; // LE
            case 14: return true;    // AL
            default: return false;   // NV (unpredictable)
        }
    }

    // ------------------------------------------------------------------
    // Flag helpers
    // ------------------------------------------------------------------

    private static void SetNzcv(EmulatedProcess ep, uint result, bool carry, bool overflow)
    {
        ep.Cpsr &= 0x0FFFFFFFu;
        if ((result & 0x80000000u) != 0) ep.Cpsr |= 0x80000000u;
        if (result == 0) ep.Cpsr |= 0x40000000u;
        if (carry) ep.Cpsr |= 0x20000000u;
        if (overflow) ep.Cpsr |= 0x10000000u;
    }

    private static void SetNz(EmulatedProcess ep, uint result)
    {
        ep.Cpsr &= 0x3FFFFFFFu; // keep C, V
        if ((result & 0x80000000u) != 0) ep.Cpsr |= 0x80000000u;
        if (result == 0) ep.Cpsr |= 0x40000000u;
    }

    private static uint SubFull(uint a, uint b, out bool carry, out bool overflow)
    {
        unchecked
        {
            uint r = a - b;
            carry = a >= b;
            overflow = (((a ^ r) & (~b ^ r)) & 0x80000000u) != 0;
            return r;
        }
    }

    // ------------------------------------------------------------------
    // Thumb-16 decode / execute
    // ------------------------------------------------------------------

    private static StepResult StepThumb16(EmulatedProcess ep, ushort instr, uint nextPc)
    {
        // LSL/LSR/ASR immediate: 00000/00001/00010 imm5 Rd Rn
        if ((instr & 0xF800) == 0x0000)
        {
            uint op = (uint)((instr >> 13) & 3u);
            uint imm5 = (uint)((instr >> 6) & 0x1Fu);
            uint Rd = (uint)((instr >> 3) & 7u);
            uint Rn = (uint)(instr & 7u);
            uint val = ep.R[Rn];
            if (imm5 != 0)
            {
                uint result;
                bool carry;
                switch (op)
                {
                    case 0: result = val << (int)imm5; carry = (val & (1u << (32 - (int)imm5))) != 0; break;
                    case 1: result = val >> (int)imm5; carry = (val & (1u << ((int)imm5 - 1))) != 0; break;
                    default: result = (uint)((int)val >> (int)imm5); carry = (val & (1u << ((int)imm5 - 1))) != 0; break;
                }
                ep.R[Rd] = result;
                SetNzcv(ep, result, carry, false);
            }
            // imm5 == 0: MOV-like, flags unchanged
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // SVC
        if ((instr & 0xFF00) == 0xDF00)
        {
            ep.Pc = nextPc;
            return StepResult.Syscall;
        }
        // Conditional branch
        if ((instr & 0xF000) == 0xD000)
        {
            uint cond = (uint)((instr >> 8) & 0xF);
            sbyte imm = (sbyte)(instr & 0xFF);
            uint target = (nextPc & 0xFFFFFFFCu) + 4u + (uint)(imm << 1);
            ep.Pc = CondPassed(cond, ep.Cpsr) ? (target | 1u) : nextPc;
            return StepResult.Continue;
        }
        // Unconditional branch
        if ((instr & 0xF800) == 0xE000)
        {
            uint imm11 = (uint)(instr & 0x7FF);
            int off = (int)((imm11 << 21) >> 21); // sign extend 11 bits
            uint target = (nextPc & 0xFFFFFFFCu) + 4u + (uint)(off << 1);
            ep.Pc = target | 1u;
            return StepResult.Continue;
        }
        // BL (32-bit Thumb-2 pair)
        if ((instr & 0xF800) == 0xF000)
        {
            uint s = (uint)((instr >> 10) & 1u);
            uint imm10 = instr & 0x3FFu;
            // second half word lives at fetchVa+2 == nextPc (thumb size-2 insn)
            ushort w2 = ReadU16(ep, nextPc & 0xFFFFFFFEu);
            if ((w2 & 0xF800) != 0xF800) { Crash(ep, "malformed BL"); return StepResult.Stop; }
            uint j = (uint)((w2 >> 10) & 1u);
            uint imm11 = (uint)(w2 & 0x7FF);
            unchecked
            {
                uint imm24 = (s << 23) | (j << 22) | (imm10 << 12) | (imm11 << 1);
                int off = (int)(imm24 << 7 >> 7); // sign extend from bit 24
                uint target = (nextPc & 0xFFFFFFFCu) + 4u + (uint)(off << 1);
                ep.R[14] = nextPc + 2u | 1u; // return address (Thumb, after the 4-byte BL pair)
                ep.Pc = target | 1u;
                return StepResult.Continue;
            }
        }
        // BX Rm
        if ((instr & 0xFF00) == 0x4700)
        {
            ep.Pc = ep.R[instr & 7];
            return StepResult.Continue;
        }
        // BLX Rm
        if ((instr & 0xFF00) == 0x4780)
        {
            ep.R[14] = nextPc | 1u;
            ep.Pc = ep.R[instr & 7];
            return StepResult.Continue;
        }
        // PUSH {regs}
        if ((instr & 0xFE00) == 0xB400)
        {
            uint regs = instr & 0x1FFu;
            uint sp = ep.R[13];
            for (int i = 0; i < 8; i++)
                if ((regs & (1u << i)) != 0) { sp -= 4; WriteU32(ep, sp, ep.R[i]); }
            if ((regs & 0x100u) != 0) { sp -= 4; WriteU32(ep, sp, ep.R[14]); }
            ep.R[13] = sp;
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // POP {regs}
        if ((instr & 0xFE00) == 0xBC00)
        {
            uint regs = instr & 0x1FFu;
            uint sp = ep.R[13];
            bool loadPc = false;
            uint pcValue = 0;
            for (int i = 0; i < 8; i++)
                if ((regs & (1u << i)) != 0) { ep.R[i] = ReadU32(ep, sp); sp += 4; }
            if ((regs & 0x100u) != 0) { pcValue = ReadU32(ep, sp); sp += 4; loadPc = true; }
            ep.R[13] = sp;
            ep.Pc = loadPc ? pcValue : nextPc;
            return StepResult.Continue;
        }
        // MOV Rd, #imm8
        if ((instr & 0xF800) == 0x2000)
        {
            uint Rd = (uint)(instr & 7);
            ep.R[Rd] = (uint)((instr >> 3) & 0xFF);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // CMP Rd, #imm8
        if ((instr & 0xF800) == 0x2800)
        {
            uint Rd = (uint)(instr & 7);
            uint imm = (uint)((instr >> 3) & 0xFF);
            uint res = SubFull(ep.R[Rd], imm, out bool c, out bool v);
            SetNzcv(ep, res, c, v);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // ADD Rd, Rn, #imm3  (00011 0 imm3 Rn Rd)
        if ((instr & 0xFC00) == 0x1800)
        {
            uint Rd = (uint)(instr & 0xF);
            uint Rn = (uint)((instr >> 4) & 0xF);
            uint imm3 = (uint)((instr >> 6) & 7);
            unchecked { ep.R[Rd] = ep.R[Rn] + imm3; }
            SetNz(ep, ep.R[Rd]);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // SUB Rd, Rn, #imm3
        if ((instr & 0xFC00) == 0x1C00)
        {
            uint Rd = (uint)(instr & 0xF);
            uint Rn = (uint)((instr >> 4) & 0xF);
            uint imm3 = (uint)((instr >> 6) & 7);
            uint res = SubFull(ep.R[Rn], imm3, out bool c, out bool v);
            ep.R[Rd] = res;
            SetNzcv(ep, res, c, v);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // CMP Rn, Rm  (encoding under verification)
        if ((instr & 0xFFC0) == 0x1900)
        {
            uint Rm = (uint)((instr >> 3) & 7);
            uint Rn = (uint)(instr & 7);
            uint res = SubFull(ep.R[Rn], ep.R[Rm], out bool c, out bool v);
            SetNzcv(ep, res, c, v);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // LDR Rd, [Rn, #imm5]  (01000 imm5 Rd Rn), offset = imm5*4
        if ((instr & 0xF800) == 0x4000)
        {
            uint imm5 = (uint)((instr >> 6) & 0x1F);
            uint Rd = (uint)((instr >> 3) & 7);
            uint Rn = (uint)(instr & 7);
            uint va = ep.R[Rn] + imm5 * 4;
            ep.R[Rd] = ReadU32(ep, va);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // STR Rd, [Rn, #imm5]  (encoding under verification)
        if ((instr & 0xF800) == 0x4800)
        {
            uint imm5 = (uint)((instr >> 6) & 0x1F);
            uint Rd = (uint)((instr >> 3) & 7);
            uint Rn = (uint)(instr & 7);
            uint va = ep.R[Rn] + imm5 * 4;
            WriteU32(ep, va, ep.R[Rd]);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // LDRB Rd, [Rn, #imm5]
        if ((instr & 0xF800) == 0x5000)
        {
            uint imm5 = (uint)((instr >> 6) & 0x1F);
            uint Rd = (uint)((instr >> 3) & 7);
            uint Rn = (uint)(instr & 7);
            ep.R[Rd] = ReadU8(ep, ep.R[Rn] + imm5);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // STRB Rd, [Rn, #imm5]
        if ((instr & 0xF800) == 0x5800)
        {
            uint imm5 = (uint)((instr >> 6) & 0x1F);
            uint Rd = (uint)((instr >> 3) & 7);
            uint Rn = (uint)(instr & 7);
            WriteU8(ep, ep.R[Rn] + imm5, (byte)ep.R[Rd]);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // IT mask cond  (10111111 mask cond)
        if ((instr & 0xFF00) == 0xBF00)
        {
            ep.ItMask = (uint)((instr >> 4) & 0xF);
            ep.ItCond = (uint)(instr & 0xF);
            ep.ItRemaining = BitCount(ep.ItMask);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // MOV Rd, Rn  (encoding under verification)
        if ((instr & 0xFFC0) == 0x4600)
        {
            uint Rm = (uint)((instr >> 3) & 7);
            uint Rd = (uint)(instr & 7);
            ep.R[Rd] = ep.R[Rm];
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // ADD Rd, Rn, Rm  (encoding under verification)
        if ((instr & 0xFFE0) == 0x4400)
        {
            uint Rm = (uint)((instr >> 6) & 7);
            uint Rn = (uint)((instr >> 3) & 7);
            uint Rd = (uint)(instr & 7);
            unchecked { ep.R[Rd] = ep.R[Rn] + ep.R[Rm]; }
            SetNz(ep, ep.R[Rd]);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        // CMP Rn, Rm  (encoding under verification)
        if ((instr & 0xFFE0) == 0x4500)
        {
            uint Rm = (uint)((instr >> 6) & 7);
            uint Rn = (uint)((instr >> 3) & 7);
            uint res = SubFull(ep.R[Rn], ep.R[Rm], out bool c, out bool v);
            SetNzcv(ep, res, c, v);
            ep.Pc = nextPc;
            return StepResult.Continue;
        }
        Crash(ep, "undefined Thumb-16 instruction 0x" + instr.ToString("x4"));
        return StepResult.Stop;
    }

    private static int BitCount(uint v)
    {
        int c = 0;
        while (v != 0) { c += (int)(v & 1u); v >>= 1; }
        return c;
    }

    // Apply IT condition to the instruction about to execute.
    private static bool ItCheck(EmulatedProcess ep)
    {
        if (ep.ItRemaining <= 0) return true;
        uint invert = (ep.ItMask >> (ep.ItRemaining - 1)) & 1u;
        bool pass = CondPassed(ep.ItCond, ep.Cpsr);
        if (invert != 0) pass = !pass;
        ep.ItRemaining--;
        return pass;
    }

    // ------------------------------------------------------------------
    // Thumb-32 decode / execute
    // ------------------------------------------------------------------

    private static StepResult StepThumb32(EmulatedProcess ep, uint instr, uint nextPc, uint fetchVa)
    {
        uint w1 = instr >> 16;
        uint w2 = instr & 0xFFFF;

        // BL: first half 11110, second half 11111
        if ((w1 & 0xF800) == 0xF000 && (w2 & 0xF800) == 0xF800)
        {
            uint s = (w1 >> 10) & 1u;
            uint imm10 = w1 & 0x3FFu;
            uint j = (w2 >> 10) & 1u;
            uint imm11 = w2 & 0x7FFu;
            unchecked
            {
                uint imm24 = (s << 23) | (j << 22) | (imm10 << 12) | (imm11 << 1);
                int off = (int)(imm24 << 7 >> 7);
                uint target = (fetchVa + 4u) + (uint)(off << 1);
                ep.R[14] = nextPc | 1u;
                ep.Pc = target | 1u;
                return StepResult.Continue;
            }
        }

        // T32 data-processing group: first halfword bits[15:12] = 1111, bit11 = 0.
        // Rd = second halfword bits[11:8]. Opcode in first halfword bits[7:4] (and bits[11:8]).
        if ((w1 & 0xF000) == 0xF000)
        {
            uint Rd = (w2 >> 8) & 0xF;
            uint opLo = (w1 >> 4) & 0xF;   // first halfword bits[7:4]
            uint w1hi = (w1 >> 8) & 0xF;   // first halfword bits[11:8]
            uint imm16 = (w1 & 0xFu) << 12 | ((w1 >> 10) & 1u) << 11 | ((w2 >> 12) & 7u) << 8 | (w2 & 0xFFu);

            if (opLo == 0xC) // MOVT Rd, #imm16
            {
                ep.R[Rd] = (ep.R[Rd] & 0xFFFFu) | (imm16 << 16);
                ep.Pc = nextPc;
                return StepResult.Continue;
            }
            if (opLo == 0x6) // MVN.W Rd, #imm16
            {
                ep.R[Rd] = ~imm16;
                ep.Pc = nextPc;
                return StepResult.Continue;
            }
            if (opLo == 0x4)
            {
                if (w1hi == 0) // MOV.W Rd, #imm8
                {
                    ep.R[Rd] = w2 & 0xFFu;
                    ep.Pc = nextPc;
                    return StepResult.Continue;
                }
                if (w1hi == 2 || w1hi == 6) // MOVW Rd, #imm16
                {
                    ep.R[Rd] = imm16;
                    ep.Pc = nextPc;
                    return StepResult.Continue;
                }
            }
            if (opLo == 0xA) // SUBW Rd, Rn, #imm12
            {
                uint Rn = w1 & 0xF;
                uint imm12 = ((w2 >> 12) & 0xFu) << 8 | (w2 & 0xFFu);
                uint res = SubFull(ep.R[Rn], imm12, out bool c, out bool v);
                ep.R[Rd] = res;
                SetNzcv(ep, res, c, v);
                ep.Pc = nextPc;
                return StepResult.Continue;
            }
            if (opLo == 0x0) // ADDW Rd, Rn, #imm12  (first halfword bits[11:8] == 2)
            {
                uint hi = (w1 >> 8) & 0xF;
                if (hi == 2)
                {
                    uint Rn = w1 & 0xF;
                    uint imm12 = ((w2 >> 12) & 0xFu) << 8 | (w2 & 0xFFu);
                    unchecked { ep.R[Rd] = ep.R[Rn] + imm12; }
                    ep.Pc = nextPc;
                    return StepResult.Continue;
                }
            }
            Crash(ep, "undefined Thumb-32 data-processing opLo 0x" + opLo.ToString("x"));
            return StepResult.Stop;
        }
        Crash(ep, "undefined Thumb-32 instruction 0x" + instr.ToString("x8"));
        return StepResult.Stop;
    }

    // ------------------------------------------------------------------
    // ARM (32-bit) decode / execute
    // ------------------------------------------------------------------

    private static StepResult StepArm(EmulatedProcess ep, uint instr, uint nextPc, uint fetchVa)
    {
        uint cond = instr >> 28;
        if (cond == 0xF)
        {
            // System / coprocessor / unconditional
            if ((instr & 0xFF000000) == 0xEF000000) // SVC
            {
                ep.Pc = nextPc;
                return StepResult.Syscall;
            }
            if ((instr & 0x0FFFFFF0) == 0x012FFF10) // BX Rm
            {
                ep.Pc = ep.R[instr & 0xF];
                return StepResult.Continue;
            }
            Crash(ep, "undefined ARM system instruction 0x" + instr.ToString("x8"));
            return StepResult.Stop;
        }
        if (!CondPassed(cond, ep.Cpsr))
        {
            ep.Pc = nextPc;
            return StepResult.Continue;
        }

        // Data processing: cond 00 op S Rn Rd operand2
        if ((instr & 0x0C000000) == 0x00000000)
        {
            uint opcode = (instr >> 21) & 0xF;
            bool setS = ((instr >> 20) & 1) != 0;
            uint Rn = (instr >> 16) & 0xF;
            uint Rd = (instr >> 12) & 0xF;
            uint op2;
            bool carry;
            if (((instr >> 25) & 1) == 0)
            {
                uint imm8 = instr & 0xFF;
                uint rot = (instr >> 7) & 0x1E;
                if (rot == 0) { op2 = imm8; carry = ((ep.Cpsr >> 29) & 1) != 0; }
                else { op2 = Ror(imm8, rot); carry = (op2 & 1u) != 0; }
            }
            else
            {
                uint Rs = instr & 0xF;
                uint shift = (instr >> 5) & 3;
                uint rm = instr & 0xF;
                uint amt = ep.R[Rs] & 0xFF;
                op2 = ShiftReg(ep.R[rm], shift, amt, ep.Cpsr, out carry);
            }
            uint res;
            bool fullFlags;
            switch (opcode)
            {
                case 0: res = ep.R[Rn] & op2; fullFlags = false; break;   // AND
                case 1: res = ep.R[Rn] ^ op2; fullFlags = false; break;  // EOR
                case 2: res = SubFull(ep.R[Rn], op2, out bool c2, out bool v2); carry = c2; fullFlags = true; break; // SUB
                case 3: res = SubFull(op2, ep.R[Rn], out bool c3, out bool v3); carry = c3; fullFlags = true; break; // RSB
                case 4: unchecked { res = ep.R[Rn] + op2; } fullFlags = true; break; // ADD
                case 12: res = ep.R[Rn] | op2; fullFlags = false; break; // ORR
                case 14: res = op2; fullFlags = false; break; // MOV
                case 15: res = ep.R[Rn] & ~op2; fullFlags = false; break; // BIC
                default: res = 0; fullFlags = false; break;
            }
            if (fullFlags)
            {
                bool ov = opcode == 2 ? (((ep.R[Rn] ^ res) & (~op2 ^ res)) & 0x80000000u) != 0 :
                          opcode == 3 ? (((op2 ^ res) & (ep.R[Rn] ^ res)) & 0x80000000u) != 0 :
                          ((((ep.R[Rn] ^ res) & (op2 ^ res)) & 0x80000000u) != 0);
                SetNzcv(ep, res, carry, ov);
            }
            else
            {
                SetNz(ep, res);
            }
            ep.Pc = (Rd == 15) ? res : nextPc;
            if (Rd != 15) ep.R[Rd] = res;
            return StepResult.Continue;
        }

        // LDM/STM: cond 100 P U S W L Rn regs
        if ((instr & 0x0E000000) == 0x08000000)
        {
            uint P = (instr >> 24) & 1;
            uint U = (instr >> 23) & 1;
            uint S = (instr >> 22) & 1;
            uint W = (instr >> 21) & 1;
            uint L = (instr >> 20) & 1;
            uint Rn = (instr >> 16) & 0xF;
            uint regs = instr & 0xFFFF;
            uint addr = ep.R[Rn];
            int n = BitCount16(regs);
            if (P == 1 && U == 0) addr = (uint)(addr - 4 * n);
            for (int i = 0; i < 16; i++)
            {
                if ((regs & (1u << i)) == 0) continue;
                if (L != 0) ep.R[i] = ReadU32(ep, addr);
                else WriteU32(ep, addr, ep.R[i]);
                addr += 4;
            }
            if (W != 0) ep.R[Rn] = addr;
            ep.Pc = (L != 0 && ((regs >> 15) & 1) != 0) ? ep.R[15] : nextPc;
            return StepResult.Continue;
        }

        // LDR/STR (immediate/pre/post-indexed): cond 01 I P U B W L Rn Rd offset12
        if ((instr & 0x0C000000) == 0x04000000)
        {
            uint I = (instr >> 25) & 1;
            uint P = (instr >> 24) & 1;
            uint U = (instr >> 23) & 1;
            uint B = (instr >> 22) & 1;
            uint W = (instr >> 21) & 1;
            uint L = (instr >> 20) & 1;
            uint Rn = (instr >> 16) & 0xF;
            uint Rd = (instr >> 12) & 0xF;
            uint baseVa;
            if (Rn == 15) baseVa = (fetchVa & 0xFFFFFFFCu) + 8; // literal pool
            else baseVa = ep.R[Rn];
            uint offset = I != 0 ? DecodeArmShiftedOperand(instr, out _) : (instr & 0xFFF);
            uint addr;
            if (P != 0) addr = baseVa + (U != 0 ? offset : (uint)(-(int)offset));
            else addr = baseVa;
            if (L != 0)
            {
                if (B != 0) ep.R[Rd] = ReadU8(ep, addr);
                else ep.R[Rd] = ReadU32(ep, addr);
            }
            else
            {
                if (B != 0) WriteU8(ep, addr, (byte)ep.R[Rd]);
                else WriteU32(ep, addr, ep.R[Rd]);
            }
            if (W != 0 && P != 0) ep.R[Rn] = addr;
            ep.Pc = nextPc;
            return StepResult.Continue;
        }

        // B / BL: cond 1010 imm24
        if ((instr & 0x0F000000) == 0x0A000000)
        {
            uint imm24 = instr & 0xFFFFFF;
            int off = (int)(imm24 << 8 >> 8) << 2; // sign extend 24 bits, word offset
            uint target = (nextPc & 0xFFFFFFFCu) + 8u + (uint)off;
            if (((instr >> 24) & 1) != 0) ep.R[14] = nextPc + 4; // link
            ep.Pc = target;
            return StepResult.Continue;
        }

        Crash(ep, "undefined ARM instruction 0x" + instr.ToString("x8"));
        return StepResult.Stop;
    }

    private static uint Ror(uint value, uint rot)
    {
        rot &= 31;
        return rot == 0 ? value : (value >> (int)rot) | (value << (32 - (int)rot));
    }

    private static uint ShiftReg(uint value, uint shift, uint amt, uint cpsr, out bool carry)
    {
        carry = ((cpsr >> 29) & 1) != 0;
        if (amt == 0)
        {
            switch (shift)
            {
                case 0: return value; // LSL #0
                case 1: carry = (value & 0x80000000u) != 0; return 0u; // LSR #32
                case 2: carry = (value & 0x80000000u) != 0; return (uint)(value >> 31); // ASR #32
                case 3: carry = (value & 1u) != 0; return Ror(value, 1); // ROR #0 -> RRX
            }
        }
        amt &= 31;
        switch (shift)
        {
            case 0: carry = (value & (1u << (32 - (int)amt))) != 0; return value << (int)amt;
            case 1: carry = (value & (1u << ((int)amt - 1))) != 0; return value >> (int)amt;
            case 2:
                carry = (value & (1u << ((int)amt - 1))) != 0;
                uint r = (uint)((int)value >> (int)amt);
                if ((value & 0x80000000u) != 0) r |= 0xFFFFFFFFu << (32 - (int)amt);
                return r;
            case 3: return Ror(value, amt);
        }
        return value;
    }

    private static uint DecodeArmShiftedOperand(uint instr, out bool carry)
    {
        uint imm8 = instr & 0xFF;
        uint rot = (instr >> 7) & 0x1E;
        if (rot == 0) { carry = false; return imm8; }
        uint op2 = Ror(imm8, rot);
        carry = (op2 & 1u) != 0;
        return op2;
    }

    private static int BitCount16(uint v)
    {
        int c = 0;
        while (v != 0) { c += (int)(v & 1u); v >>= 1; }
        return c;
    }

    // ------------------------------------------------------------------
    // Instruction step
    // ------------------------------------------------------------------

    private enum StepResult { Continue, Branch, Syscall, Stop }

    private static StepResult Step(EmulatedProcess ep)
    {
        uint pc = ep.R[15];
        bool thumb = (pc & 1u) != 0;
        uint fetchVa = thumb ? pc & 0xFFFFFFFEu : pc & 0xFFFFFFFCu;

        uint instr;
        int size;
        if (thumb)
        {
            ushort w1 = ReadU16(ep, fetchVa);       // first halfword in memory = instr bits[15:0]
            bool thumb32 = (w1 & 0xF800) == 0xF000 || (w1 & 0xF800) == 0xF800;
            if (thumb32)
            {
                ushort w2 = ReadU16(ep, fetchVa + 2); // second halfword = instr bits[31:16]
                instr = ((uint)w2 << 16) | w1;
                size = 4;
            }
            else
            {
                instr = w1;
                size = 2;
            }
        }
        else
        {
            instr = ReadU32(ep, fetchVa);
            size = 4;
        }

        uint nextPc = pc + (uint)size;
        if (thumb) nextPc |= 1u;

        if (thumb && ep.ItRemaining > 0)
        {
            bool isBranch = (instr & 0xF800) == 0xE000 || (instr & 0xF800) == 0xF000 ||
                            (instr & 0xFF00) == 0x4700 || (instr & 0xFF00) == 0x4780;
            if (!isBranch && !ItCheck(ep))
            {
                ep.Pc = nextPc;
                return StepResult.Continue;
            }
        }

        if (thumb && size == 4) return StepThumb32(ep, instr, nextPc, fetchVa);
        return StepThumb16(ep, (ushort)(instr & 0xFFFF), nextPc);
    }

    // ------------------------------------------------------------------
    // Syscall emulation
    // ------------------------------------------------------------------

    private static int DispatchSyscall(EmulatedProcess ep)
    {
        uint nr = ep.R[7];
        uint a1 = ep.R[0], a2 = ep.R[1], a3 = ep.R[2], a4 = ep.R[3], a5 = ep.R[4], a6 = ep.R[5];
        int result;
        switch (nr)
        {
            case SYS_exit: result = SysExit(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_exit_group: result = SysExitGroup(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_fork: result = SysFork(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_execve: result = SysExecve(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_read: result = SysRead(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_write: result = SysWrite(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_open: result = SysOpen(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_openat: result = SysOpenat(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_close: result = SysClose(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_wait4: result = SysWait4(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_chdir: result = SysChdir(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_time: result = SysTime(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getpid: result = SysGetpid(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getuid: result = SysGetuid(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_geteuid: result = SysGeteuid(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getgid: result = SysGetgid(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getegid: result = SysGetegid(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_access: result = SysAccess(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_mkdir: result = SysMkdir(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_unlink: result = SysUnlink(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_link: result = SysLink(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_creat: result = SysCreat(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sync: result = SysSync(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_lseek: result = SysLseek(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_fstat: result = SysFstat(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_newfstatat: result = SysNewFstatAt(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_ioctl: result = SysIoctl(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_dup: result = SysDup(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_dup2: result = SysDup2(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_pipe: result = SysPipe(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_fcntl: result = SysFcntl(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_brk: result = SysBrk(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_mmap: result = SysMmap(ep, a1, a2, a3, a4, a5, a6, 0); break;
            case SYS_mmap2: result = SysMmap2(ep, a1, a2, a3, a4, a5, a6, 0); break;
            case SYS_mprotect: result = SysMprotect(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_munmap: result = SysMunmap(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_rt_sigaction: result = SysRtSigaction(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_rt_sigprocmask: result = SysRtSigprocmask(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_rt_sigreturn: result = SysRtSigreturn(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sigaltstack: result = SysSigaltstack(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sigprocmask: result = SigProcMaskStub(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sigpending: result = SigPendingStub(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sigsuspend: result = SigSuspendStub(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getrlimit: result = SysGetrlimit(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_setrlimit: result = SysSetrlimit(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getrusage: result = SysGetrusage(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_gettimeofday: result = SysGettimeofday(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_uname: result = SysUname(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_clock_gettime: result = SysClockGettime(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_nanosleep: result = SysNanosleep(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_pause: result = SysPause(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getdents64: result = SysGetdents64(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_prctl: result = SysPrctl(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_set_robust_list: result = SysSetRobustList(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_futex: result = SysFutex(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_sched_yield: result = SysSchedYield(ep, a1, a2, a3, a4, a5, a6); break;
            case SYS_getrandom: result = SysGetrandom(ep, a1, a2, a3, a4, a5, a6); break;
            default:
                if (!LoggedSyscalls.Contains(nr))
                {
                    LoggedSyscalls.Add(nr);
                    Console.Error.WriteLine("elf-run: pid " + ep.Pid + " unimplemented syscall " + nr +
                        " (r0=0x" + a1.ToString("x8") + ") -> -ENOSYS");
                }
                result = -ENOSYS;
                break;
        }
        ep.R[0] = (uint)result;
        return result;
    }

    private static readonly HashSet<uint> LoggedSyscalls = new HashSet<uint>();

    private static void LogSyscall(EmulatedProcess ep, uint nr, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        if (!Verbose) return;
        Console.Error.WriteLine("elf-run: pid " + ep.Pid + " syscall " + nr +
            " (0x" + a1.ToString("x8") + "," + a2 + "," + a3 + "," + a4 + ")");
    }

    private static void LogSyscall(EmulatedProcess ep, uint nr, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6, string extra)
    {
        if (!Verbose) return;
        Console.Error.WriteLine("elf-run: pid " + ep.Pid + " syscall " + nr +
            " (0x" + a1.ToString("x8") + "," + a2 + "," + a3 + "," + a4 + ") \"" + extra + "\"");
    }

    private static int SysExit(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_exit, a1, a2, a3, a4, a5, a6);
        ep.ExitCode = (int)a1 & 0xFF;
        ep.State = EmulatedProcess.EpState.Exited;
        return 0;
    }

    private static int SysExitGroup(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_exit_group, a1, a2, a3, a4, a5, a6);
        ep.ExitCode = (int)a1 & 0xFF;
        ep.State = EmulatedProcess.EpState.Exited;
        return 0;
    }

    private static int SysRead(EmulatedProcess ep, uint fd, uint buf, uint count, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_read, fd, buf, count, a4, a5, a6);
        var fe = GetFd(ep, (int)fd);
        if (fe == null) return -EBADF;
        var b = new byte[count];
        int n = fe.Stream.Read(b, 0, (int)count);
        for (int i = 0; i < n; i++) WriteU8(ep, buf + (uint)i, b[i]);
        return n;
    }



    private static int SysWrite(EmulatedProcess ep, uint fd, uint buf, uint count, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_write, fd, buf, count, a4, a5, a6);
        var fe = GetFd(ep, (int)fd);
        if (fe == null) return -EBADF;
        var b = new byte[count];
        for (uint i = 0; i < count; i++) b[i] = ReadU8(ep, buf + i);
        fe.Stream.Write(b, 0, (int)count);
        return (int)count;
    }

    private static int SysOpen(EmulatedProcess ep, uint path, uint flags, uint mode, uint a4, uint a5, uint a6)
    {
        var pathStr = ReadCString(ep, path);
        LogSyscall(ep, SYS_open, path, flags, mode, a4, a5, a6, pathStr);
        string hostPath = ResolveHostPath(ep, pathStr);
        if (hostPath == null) return -ENOENT;
        try
        {
            int accBits = (int)(flags & O_ACCMODE);
            FileAccess access = accBits == O_WRONLY ? FileAccess.Write :
                                accBits == O_RDWR ? FileAccess.ReadWrite : FileAccess.Read;
            FileMode fmode;
            bool creat = (flags & O_CREAT) != 0;
            bool trunc = (flags & O_TRUNC) != 0;
            bool append = (flags & O_APPEND) != 0;
            if (creat && trunc) fmode = FileMode.Create;
            else if (creat) fmode = FileMode.OpenOrCreate;
            else if (trunc) fmode = FileMode.Truncate;
            else if (append) fmode = FileMode.Append;
            else fmode = FileMode.Open;
            FileShare share = FileShare.ReadWrite | FileShare.Delete;
            var fs = new FileStream(hostPath, fmode, access, share);
            int fd = AllocFd(ep, fs, pathStr, (flags & O_CLOEXEC) != 0);
            return fd;
        }
        catch (DirectoryNotFoundException) { return -ENOENT; }
        catch (FileNotFoundException) { return -ENOENT; }
        catch (UnauthorizedAccessException) { return -13; }
        catch (Exception) { return -EIO; }
    }



    private static int SysOpenat(EmulatedProcess ep, uint dirfd, uint pathPtr, uint flags, uint mode, uint a5, uint a6)
    {
        string path = pathPtr != 0 ? ReadCString(ep, pathPtr) : "";
        LogSyscall(ep, SYS_openat, dirfd, flags, mode, a5, a6, 0);
        string hostPath = ResolveHostPath(ep, path);
        if (hostPath == null) return -ENOENT;
        try
        {
            int accBits = (int)(flags & O_ACCMODE);
            FileAccess access = accBits == O_WRONLY ? FileAccess.Write :
                                accBits == O_RDWR ? FileAccess.ReadWrite : FileAccess.Read;
            FileMode fmode;
            bool creat = (flags & O_CREAT) != 0;
            bool trunc = (flags & O_TRUNC) != 0;
            if (creat && trunc) fmode = FileMode.Create;
            else if (creat) fmode = FileMode.OpenOrCreate;
            else if (trunc) fmode = FileMode.Truncate;
            else fmode = FileMode.Open;
            var fs = new FileStream(hostPath, fmode, access, FileShare.ReadWrite | FileShare.Delete);
            int fd = AllocFd(ep, fs, path, (flags & O_CLOEXEC) != 0);
            return fd;
        }
        catch (DirectoryNotFoundException) { return -ENOENT; }
        catch (FileNotFoundException) { return -ENOENT; }
        catch (UnauthorizedAccessException) { return -13; }
        catch (Exception) { return -EIO; }
    }

    private static int SysClose(EmulatedProcess ep, uint fd, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_close, fd, a2, a3, a4, a5, a6);
        var fe = GetFd(ep, (int)fd);
        if (fe == null) return -EBADF;
        try { fe.Stream.Dispose(); } catch { }
        ep.Fds[(int)fd] = null;
        return 0;
    }

    private static int SysWait4(EmulatedProcess ep, uint pid, uint statPtr, uint options, uint rusage, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_wait4, pid, statPtr, options, rusage, a5, a6);
        int want = (int)pid;
        EmulatedProcess found = null;
        foreach (var c in ep.Children)
            if (c.State == EmulatedProcess.EpState.Exited && (want == -1 || c.Pid == want)) { found = c; break; }
        if (found != null)
        {
            ep.Children.Remove(found);
            if (statPtr != 0) WriteU16(ep, statPtr, (ushort)((found.ExitCode & 0xFF) << 8));
            return found.Pid;
        }
        bool anyLive = false;
        foreach (var c in ep.Children)
            if (c.State != EmulatedProcess.EpState.Exited) anyLive = true;
        if (!anyLive) return -ECHILD;
        if ((options & 1u) != 0) return 0; // WNOHANG
        ep.State = EmulatedProcess.EpState.Waiting;
        ep.WaitPid = want;
        ep.WaitStatPtr = statPtr;
        return -1; // scheduler patches the real result into R0 when woken
    }

    private static int SysExecve(EmulatedProcess ep, uint pathPtr, uint argvPtr, uint envpPtr, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_execve, pathPtr, argvPtr, envpPtr, a4, a5, a6);
        string path = ReadCString(ep, pathPtr);
        var argv = ReadPtrArray(ep, argvPtr);
        var envp = ReadPtrArray(ep, envpPtr);
        try { ExecImage(ep, path, argv, envp); }
        catch (FileNotFoundException) { return -ENOENT; }
        catch (Exception ex) { Console.Error.WriteLine("elf-run: execve failed: " + ex.Message); return -EINVAL; }
        return 0;
    }



    private static string[] ReadPtrArray(EmulatedProcess ep, uint ptr)
    {
        var list = new List<string>();
        if (ptr == 0) return list.ToArray();
        for (int i = 0; ; i++)
        {
            uint entryPtr = ReadU32(ep, ptr + (uint)(i * 4));
            if (entryPtr == 0) break;
            list.Add(ReadCString(ep, entryPtr));
        }
        return list.ToArray();
    }

    private static int SysChdir(EmulatedProcess ep, uint path, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        var pathStr = ReadCString(ep, path);
        LogSyscall(ep, SYS_chdir, path, a2, a3, a4, a5, a6, pathStr);
        string hostPath = ResolveHostPath(ep, pathStr);
        if (hostPath == null || !Directory.Exists(hostPath)) return -ENOENT;
        try { Environment.CurrentDirectory = hostPath; return 0; }
        catch { return -EINVAL; }
    }

    private static int SysTime(EmulatedProcess ep, uint tloc, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        var now = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        LogSyscall(ep, SYS_time, tloc, a2, a3, a4, a5, a6);
        if (tloc != 0) WriteU32(ep, tloc, (uint)now);
        return now;
    }

    private static int SysGetpid(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { LogSyscall(ep, SYS_getpid, a1, a2, a3, a4, a5, a6); return ep.Pid; }

    private static int SysGetuid(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { LogSyscall(ep, SYS_getuid, a1, a2, a3, a4, a5, a6); return (int)getuid(); }
    private static int SysGeteuid(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { LogSyscall(ep, SYS_geteuid, a1, a2, a3, a4, a5, a6); return (int)geteuid(); }
    private static int SysGetgid(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { LogSyscall(ep, SYS_getgid, a1, a2, a3, a4, a5, a6); return (int)getgid(); }
    private static int SysGetegid(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { LogSyscall(ep, SYS_getegid, a1, a2, a3, a4, a5, a6); return (int)getegid(); }

    private static int SysAccess(EmulatedProcess ep, uint path, uint mode, uint a3, uint a4, uint a5, uint a6)
    {
        var pathStr = ReadCString(ep, path);
        LogSyscall(ep, SYS_access, path, mode, a3, a4, a5, a6, pathStr);
        return ResolveHostPath(ep, pathStr) != null ? 0 : -ENOENT;
    }

    private static int SysMkdir(EmulatedProcess ep, uint path, uint mode, uint a3, uint a4, uint a5, uint a6)
    {
        var pathStr = ReadCString(ep, path);
        try { Directory.CreateDirectory(ResolveHostPath(ep, pathStr) ?? pathStr); return 0; }
        catch { return -EINVAL; }
    }

    private static int SysUnlink(EmulatedProcess ep, uint path, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        var pathStr = ReadCString(ep, path);
        try { File.Delete(ResolveHostPath(ep, pathStr) ?? pathStr); return 0; }
        catch { return -ENOENT; }
    }

    private static int SysLink(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return -ENOSYS; }
    private static int SysCreat(EmulatedProcess ep, uint path, uint mode, uint a3, uint a4, uint a5, uint a6) { return SysOpen(ep, path, (uint)(O_WRONLY | O_CREAT | O_TRUNC), mode, 0, 0, 0); }
    private static int SysSync(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }



    private static int SysLseek(EmulatedProcess ep, uint fd, uint offset, uint whence, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_lseek, fd, offset, whence, a4, a5, a6);
        var fe = GetFd(ep, (int)fd);
        if (fe == null) return -EBADF;
        try
        {
            SeekOrigin origin = whence == 0 ? SeekOrigin.Begin : whence == 1 ? SeekOrigin.Current : SeekOrigin.End;
            long pos = fe.Stream.Seek((long)offset, origin);
            return (int)pos;
        }
        catch { return -ESPIPE; }
    }



    private static int SysFstat(EmulatedProcess ep, uint fd, uint statPtr, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_fstat, fd, statPtr, a3, a4, a5, a6);
        var fe = GetFd(ep, (int)fd);
        if (fe == null) return -EBADF;
        long len = 0;
        try { len = fe.Stream.Length; } catch { }
        FillStat(ep, statPtr, len, false);
        return 0;
    }

    private static int SysNewFstatAt(EmulatedProcess ep, uint dirfd, uint pathPtr, uint statPtr, uint flags, uint a5, uint a6)
    {
        string path = pathPtr != 0 ? ReadCString(ep, pathPtr) : "";
        LogSyscall(ep, SYS_newfstatat, dirfd, statPtr, flags, a5, a6, 0);
        string hostPath = ResolveHostPath(ep, path) ?? path;
        try
        {
            var info = new FileInfo(hostPath);
            if (!info.Exists) return -ENOENT;
            FillStat(ep, statPtr, info.Length, false);
            return 0;
        }
        catch { return -ENOENT; }
    }

    private static int SysIoctl(EmulatedProcess ep, uint fd, uint req, uint arg, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_ioctl, fd, req, arg, a4, a5, a6);
        if (req == TCGETS || req == TCSETS || req == TCSETSW || req == TCSETSF) return -ENOTTY;
        if (req == TIOCGWINSZ && arg != 0)
        {
            WriteU16(ep, arg, 0);
            WriteU16(ep, arg + 2, 0);
            WriteU16(ep, arg + 4, 0);
            WriteU16(ep, arg + 6, 0);
            return 0;
        }
        if (req == FIONREAD) { if (arg != 0) WriteU32(ep, arg, 0); return 0; }
        return 0;
    }

    private static int SysDup(EmulatedProcess ep, uint oldfd, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_dup, oldfd, a2, a3, a4, a5, a6);
        var fe = GetFd(ep, (int)oldfd);
        if (fe == null) return -EBADF;
        return AllocFd(ep, fe.Stream, fe.Path, fe.Cloexec);
    }

    private static int SysDup2(EmulatedProcess ep, uint oldfd, uint newfd, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_dup2, oldfd, newfd, a3, a4, a5, a6);
        var fe = GetFd(ep, (int)oldfd);
        if (fe == null) return -EBADF;
        if ((int)newfd >= 0 && (int)newfd < ep.Fds.Count && ep.Fds[(int)newfd] != null)
        {
            try { ep.Fds[(int)newfd].Stream.Dispose(); } catch { }
        }
        while ((int)newfd >= ep.Fds.Count) ep.Fds.Add(null);
        ep.Fds[(int)newfd] = new FdEntry { Stream = fe.Stream, Path = fe.Path, Cloexec = fe.Cloexec };
        return (int)newfd;
    }

    private static int SysPipe(EmulatedProcess ep, uint pipefdPtr, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_pipe, pipefdPtr, a2, a3, a4, a5, a6);
        var pipe = new Pipe();
        var reader = new PipeStream(pipe, true);
        var writer = new PipeStream(pipe, false);
        int fd0 = AllocFd(ep, reader, "pipe:[0]", false);
        int fd1 = AllocFd(ep, writer, "pipe:[1]", false);
        WriteU32(ep, pipefdPtr, (uint)fd0);
        WriteU32(ep, pipefdPtr + 4, (uint)fd1);
        return 0;
    }

    private static int SysFcntl(EmulatedProcess ep, uint fd, uint cmd, uint arg, uint a4, uint a5, uint a6) { return 0; }
    private static int SysGetrlimit(EmulatedProcess ep, uint resource, uint rlimPtr, uint a3, uint a4, uint a5, uint a6)
    {
        if (rlimPtr != 0) { WriteU32(ep, rlimPtr, 1024); WriteU32(ep, rlimPtr + 4, 1024); }
        return 0;
    }
    private static int SysSetrlimit(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysGetrusage(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysGettimeofday(EmulatedProcess ep, uint tv, uint tz, uint a3, uint a4, uint a5, uint a6)
    {
        if (tv != 0)
        {
            long ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            WriteU32(ep, tv, (uint)(ms / 1000));
            WriteU32(ep, tv + 4, (uint)((ms % 1000) * 1000));
        }
        return 0;
    }
    private static int SysUname(EmulatedProcess ep, uint buf, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        if (buf != 0)
        {
            WriteCString(ep, buf, "tizenhbc");
            WriteCString(ep, buf + 65, "(none)");
            WriteCString(ep, buf + 130, "(none)");
            WriteCString(ep, buf + 195, "(none)");
            WriteCString(ep, buf + 260, "armv7l");
        }
        return 0;
    }
    private static int SysClockGettime(EmulatedProcess ep, uint clockId, uint tp, uint a3, uint a4, uint a5, uint a6)
    {
        if (tp != 0)
        {
            long sec = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long nsec = (DateTime.UtcNow.Ticks % 10000000L) * 100L;
            WriteU32(ep, tp, (uint)sec);
            WriteU32(ep, tp + 4, (uint)nsec);
        }
        return 0;
    }
    private static int SysNanosleep(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return -EINTR; }

    private static int SysAlarm(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysPause(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return -EINTR; }
    private static int SysGetdents64(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysPrctl(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysSetRobustList(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysFutex(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysSchedYield(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysGetrandom(EmulatedProcess ep, uint buf, uint len, uint flags, uint a4, uint a5, uint a6)
    {
        using var rng = RandomNumberGenerator.Create();
        var b = new byte[len];
        rng.GetBytes(b);
        for (uint i = 0; i < len; i++) WriteU8(ep, buf + i, b[i]);
        return (int)len;
    }
    private static int SysRtSigaction(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysRtSigprocmask(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysRtSigreturn(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SysSigaltstack(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SigProcMaskStub(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SigPendingStub(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SigSuspendStub(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }
    private static int SignalStub(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6) { return 0; }

    private static int SysMmap(EmulatedProcess ep, uint addr, uint length, uint prot, uint flags, uint fd, uint offset, uint a7)
    {
        length = AlignUp(length, 4096);
        if (length == 0) return -EINVAL;
        bool fixed_ = (flags & MAP_FIXED) != 0;
        bool anon = (flags & MAP_ANONYMOUS) != 0;
        uint baseVa;
        IntPtr h;
        if (fixed_)
        {
            h = mmap(Ptr(addr), (UIntPtr)length, (int)prot,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED | MAP_32BIT, -1, Zero);
            if (h == Invalid) return -ENOMEM;
            baseVa = addr;
        }
        else
        {
            h = mmap(Zero, (UIntPtr)length, (int)prot,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, Zero);
            if (h == Invalid) return -ENOMEM;
            baseVa = (uint)h;
        }
        ep.Segments.Add(new Segment { GuestBase = baseVa, Host = h, Size = length, Prot = (int)prot });
        if (!anon && fd != 0xFFFFFFFFu)
        {
            var fe = GetFd(ep, (int)fd);
            if (fe != null)
            {
                long pos = fe.Stream.Position;
                try
                {
                    fe.Stream.Position = (long)offset;
                    long n = (long)length < fe.Stream.Length ? (long)length : fe.Stream.Length;
                    var b = new byte[n];
                    int rd = fe.Stream.Read(b, 0, (int)n);
                    for (int i = 0; i < rd; i++) WriteU8(ep, baseVa + (uint)i, b[i]);
                }
                finally { fe.Stream.Position = pos; }
            }
        }
        LogSyscall(ep, SYS_mmap, addr, length, prot, flags, fd, offset);
        return (int)baseVa;
    }



    private static int SysMmap2(EmulatedProcess ep, uint addr, uint length, uint prot, uint flags, uint fd, uint pgoffset, uint a7)
    {
        return SysMmap(ep, addr, (uint)(length * 4096), prot, flags, fd, (uint)(pgoffset * 4096), a7);
    }

    private static int SysMprotect(EmulatedProcess ep, uint addr, uint length, uint prot, uint a4, uint a5, uint a6)
    {
        length = AlignUp(length, 4096);
        int p = (int)prot;
        foreach (var seg in ep.Segments)
        {
            uint segEnd = seg.GuestBase + seg.Size;
            uint overlapStart = Math.Max(addr, seg.GuestBase);
            uint overlapEnd = Math.Min(addr + length, segEnd);
            if (overlapEnd <= overlapStart) continue;
            IntPtr hostAddr = IntPtr.Add(seg.Host, (int)(overlapStart - seg.GuestBase));
            mprotect(hostAddr, (UIntPtr)(overlapEnd - overlapStart), p);
        }
        LogSyscall(ep, SYS_mprotect, addr, length, prot, a4, a5, a6);
        return 0;
    }

    private static int SysMunmap(EmulatedProcess ep, uint addr, uint length, uint a3, uint a4, uint a5, uint a6)
    {
        length = AlignUp(length, 4096);
        var toRemove = new List<Segment>();
        var toAddLeft = new List<Segment>();
        var toAddRight = new List<(Segment orig, Segment right)>();
        foreach (var seg in ep.Segments)
        {
            uint segEnd = seg.GuestBase + seg.Size;
            uint overlapStart = Math.Max(addr, seg.GuestBase);
            uint overlapEnd = Math.Min(addr + length, segEnd);
            if (overlapEnd <= overlapStart) continue;
            toRemove.Add(seg);
            if (overlapStart > seg.GuestBase)
                toAddLeft.Add(new Segment { GuestBase = seg.GuestBase, Host = seg.Host, Size = overlapStart - seg.GuestBase, Prot = seg.Prot });
            if (overlapEnd < segEnd)
            {
                uint rightStart = overlapEnd;
                uint rightSize = segEnd - rightStart;
                IntPtr rightHost = IntPtr.Add(seg.Host, (int)(rightStart - seg.GuestBase));
                toAddRight.Add((seg, new Segment { GuestBase = rightStart, Host = rightHost, Size = rightSize, Prot = seg.Prot }));
            }
            munmap(IntPtr.Add(seg.Host, (int)(overlapStart - seg.GuestBase)), (UIntPtr)(overlapEnd - overlapStart));
        }
        foreach (var seg in toRemove) ep.Segments.Remove(seg);
        foreach (var seg in toAddLeft) ep.Segments.Add(seg);
        foreach (var (orig, right) in toAddRight) ep.Segments.Add(right);
        LogSyscall(ep, SYS_munmap, addr, length, a3, a4, a5, a6);
        return 0;
    }

    private static int SysBrk(EmulatedProcess ep, uint addr, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_brk, addr, a2, a3, a4, a5, a6);
        if (addr == 0) return (int)ep.Brk;
        ep.Brk = addr;
        return (int)addr;
    }

    private static void FillStat(EmulatedProcess ep, uint statPtr, long size, bool isDir)
    {
        int now = (int)((DateTimeOffset.UtcNow.ToUnixTimeSeconds()));
        uint mode = isDir ? 0x41EDu : 0x81A4u; // S_IFDIR|0755 / S_IFREG|0755
        unchecked
        {
            WriteU32(ep, statPtr + 0, 0);       // st_dev
            WriteU32(ep, statPtr + 4, 1);       // st_ino
            WriteU32(ep, statPtr + 8, mode);    // st_mode
            WriteU32(ep, statPtr + 12, 1);      // st_nlink
            WriteU32(ep, statPtr + 16, getuid());
            WriteU32(ep, statPtr + 20, getgid());
            WriteU32(ep, statPtr + 24, 0);      // st_rdev
            WriteU32(ep, statPtr + 28, (uint)size); // st_size
            WriteU32(ep, statPtr + 32, 4096);   // st_blksize
            WriteU32(ep, statPtr + 36, (uint)((size + 511) / 512)); // st_blocks
            WriteU32(ep, statPtr + 40, (uint)now); // st_atim sec
            WriteU32(ep, statPtr + 44, 0);
            WriteU32(ep, statPtr + 48, (uint)now); // st_mtim
            WriteU32(ep, statPtr + 52, 0);
            WriteU32(ep, statPtr + 56, (uint)now); // st_ctim
            WriteU32(ep, statPtr + 60, 0);
            WriteU32(ep, statPtr + 64, 0);
            WriteU32(ep, statPtr + 68, 0);
        }
    }

    // ------------------------------------------------------------------
    // fork
    // ------------------------------------------------------------------

    private static int SysFork(EmulatedProcess ep, uint a1, uint a2, uint a3, uint a4, uint a5, uint a6)
    {
        LogSyscall(ep, SYS_fork, a1, a2, a3, a4, a5, a6);
        var child = new EmulatedProcess { Pid = NextPid(), PPid = ep.Pid };
        Array.Copy(ep.R, child.R, 16);
        child.Cpsr = ep.Cpsr;
        child.TcbBase = ep.TcbBase;
        child.Brk = ep.Brk;
        foreach (var seg in ep.Segments)
        {
            IntPtr h = mmap(Zero, (UIntPtr)seg.Size, PROT_READ | PROT_WRITE | PROT_EXEC,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_32BIT, -1, Zero);
            if (h == Invalid) throw new Exception("fork: cannot map child memory");
            for (uint i = 0; i < seg.Size; i++)
                Marshal.WriteByte(IntPtr.Add(h, (int)i), Marshal.ReadByte(IntPtr.Add(seg.Host, (int)i)));
            mprotect(h, (UIntPtr)seg.Size, seg.Prot);
            child.Segments.Add(new Segment { GuestBase = seg.GuestBase, Host = h, Size = seg.Size, Prot = seg.Prot });
        }
        foreach (var fe in ep.Fds)
        {
            if (fe == null) continue;
            child.Fds.Add(new FdEntry { Stream = fe.Stream, Path = fe.Path, Cloexec = fe.Cloexec });
        }
        child.R[0] = 0;
        ep.R[0] = (uint)child.Pid;
        Scheduler.All.Add(child);
        return child.Pid;
    }

    private static int nextPid = 1;
    private static int NextPid() => nextPid++;

    // ------------------------------------------------------------------
    // Scheduler
    // ------------------------------------------------------------------

    private static class Scheduler
    {
        public static List<EmulatedProcess> All = new List<EmulatedProcess>();
    }

    // Runs until the main process exits. Returns its exit code.
    private static int RunScheduler(EmulatedProcess main)
    {
        Scheduler.All.Add(main);
        try
        {
            while (true)
            {
                if (main.State != EmulatedProcess.EpState.Running) break;
                bool anyRunning = false;
                bool anyWaiting = false;
                for (int i = 0; i < Scheduler.All.Count; i++)
                {
                    var ep = Scheduler.All[i];
                    if (ep.State == EmulatedProcess.EpState.Running)
                    {
                        anyRunning = true;
                        for (int q = 0; q < Quantum && ep.State == EmulatedProcess.EpState.Running; q++)
                        {
                            StepResult sr = Step(ep);
                            if (sr == StepResult.Syscall) DispatchSyscall(ep);
                            if (ep.State == EmulatedProcess.EpState.Exited) WakeWaiters(ep);
                        }
                    }
                    else if (ep.State == EmulatedProcess.EpState.Waiting)
                    {
                        anyWaiting = true;
                    }
                }
                if (!anyRunning)
                {
                    if (!anyWaiting) break;
                    bool progressed = false;
                    for (int i = 0; i < Scheduler.All.Count; i++)
                    {
                        var ep = Scheduler.All[i];
                        if (ep.State != EmulatedProcess.EpState.Waiting) continue;
                        bool anyLive = false;
                        foreach (var c in ep.Children)
                            if (c.State != EmulatedProcess.EpState.Exited) anyLive = true;
                        if (!anyLive)
                        {
                            ep.State = EmulatedProcess.EpState.Running;
                            ep.R[0] = unchecked((uint)(-ECHILD));
                            ep.WaitStatPtr = 0;
                            progressed = true;
                        }
                    }
                    if (!progressed) break; // deadlock
                }
                // Reap exited children and satisfy waits.
                for (int i = 0; i < Scheduler.All.Count; i++)
                {
                    var ep = Scheduler.All[i];
                    if (ep.State != EmulatedProcess.EpState.Waiting) continue;
                    EmulatedProcess found = null;
                    foreach (var c in ep.Children)
                        if (c.State == EmulatedProcess.EpState.Exited && (ep.WaitPid == -1 || c.Pid == ep.WaitPid)) { found = c; break; }
                    if (found != null)
                    {
                        ep.Children.Remove(found);
                        ep.State = EmulatedProcess.EpState.Running;
                        if (ep.WaitStatPtr != 0) WriteU16(ep, ep.WaitStatPtr, (ushort)((found.ExitCode & 0xFF) << 8));
                        ep.R[0] = (uint)found.Pid;
                        ep.WaitStatPtr = 0;
                    }
                }
                // Drop fully-reaped zombies.
                Scheduler.All.RemoveAll(p => p.State == EmulatedProcess.EpState.Exited &&
                    Scheduler.All.FindAll(x => x.Children.Contains(p)).Count == 0);
            }
        }
        finally
        {
            Scheduler.All.Remove(main);
        }
        return main.ExitCode;
    }

    private static void WakeWaiters(EmulatedProcess child)
    {
        foreach (var ep in Scheduler.All)
        {
            if (ep.State != EmulatedProcess.EpState.Waiting) continue;
            if (ep.WaitPid != -1 && ep.WaitPid != child.Pid) continue;
            ep.State = EmulatedProcess.EpState.Running;
            ep.Children.Remove(child);
            if (ep.WaitStatPtr != 0) WriteU16(ep, ep.WaitStatPtr, (ushort)((child.ExitCode & 0xFF) << 8));
            ep.R[0] = (uint)child.Pid;
            ep.WaitStatPtr = 0;
        }
    }

    // ------------------------------------------------------------------
    // Modes
    // ------------------------------------------------------------------

    private static int RunShell(string shellPath)
    {
        var listener = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        listener.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        listener.Bind(new IPEndPoint(IPAddress.Any, 2525));
        listener.Listen(8);
        Console.Error.WriteLine("elf-run: shell listening on port 2525");
        Console.Error.Flush();

        while (true)
        {
            Socket client;
            try { client = listener.Accept(); }
            catch (SocketException ex) { Console.Error.WriteLine("elf-run: accept failed: " + ex.Message); continue; }
            string remote = client.RemoteEndPoint?.ToString() ?? "?";
            Console.Error.WriteLine("elf-run: shell connection from " + remote);
            Console.Error.Flush();

            var ep = new EmulatedProcess { Pid = NextPid() };
            try
            {
                ExecImage(ep, shellPath, new[] { shellPath }, null);
                var ns = new NetworkStream(client, ownsSocket: false);
                ep.Fds.Add(new FdEntry { Stream = ns, Path = "client:" + remote, Cloexec = false });
                ep.Fds.Add(new FdEntry { Stream = ns, Path = "client:" + remote, Cloexec = false });
                ep.Fds.Add(new FdEntry { Stream = ns, Path = "client:" + remote, Cloexec = false });
                int code = RunScheduler(ep);
                Console.Error.WriteLine("elf-run: shell session exited with code " + code);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("elf-run: shell failed to start: " + ex.Message);
            }
            try { client.Close(); } catch { }
            Console.Error.WriteLine("elf-run: shell connection from " + remote + " closed");
            Console.Error.Flush();
        }
    }

    // ------------------------------------------------------------------
    // Main
    // ------------------------------------------------------------------

    public static int Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("MARKER-v2");
            Console.Error.WriteLine("usage: elf-run <arm-elf> [args...]");
            return 64;
        }

        if (args[0] == "--shell")
        {
            string shellPath;
            if (args.Length >= 2 && !string.IsNullOrEmpty(args[1]))
                shellPath = args[1];
            else
                shellPath = Environment.GetEnvironmentVariable("HBC_SHELL");
            if (string.IsNullOrEmpty(shellPath))
            {
                foreach (var candidate in new[] { "/bin/bash", "/usr/bin/bash", "/bin/sh" })
                {
                    if (ResolveHostPath(null, candidate) != null) { shellPath = candidate; break; }
                }
            }
            if (string.IsNullOrEmpty(shellPath))
            {
                Console.Error.WriteLine("elf-run: --shell: no shell binary found (tried /bin/bash, /usr/bin/bash, /bin/sh)");
                return 126;
            }
            RunShell(shellPath);
            return 0; // unreachable
        }

        var target = args[0];
        byte[] image;
        try { image = File.ReadAllBytes(target); }
        catch (Exception ex)
        {
            Console.Error.WriteLine("elf-run: cannot read " + target + ": " + ex.Message);
            return 70;
        }

        var ep = new EmulatedProcess { Pid = NextPid() };
        try
        {
            ExecImage(ep, target, args, null);
        }
        catch (FileNotFoundException ex)
        {
            Console.Error.WriteLine("elf-run: " + ex.Message);
            return 126;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("elf-run: cannot load " + target + ": " + ex.Message);
            return 126;
        }

        // Standard streams are inherited from the host (old behavior).
        ep.Fds.Add(new FdEntry { Stream = Console.OpenStandardInput(), Path = "stdin", Cloexec = false });
        ep.Fds.Add(new FdEntry { Stream = Console.OpenStandardOutput(), Path = "stdout", Cloexec = false });
        ep.Fds.Add(new FdEntry { Stream = Console.OpenStandardError(), Path = "stderr", Cloexec = false });

        int code;
        try { code = RunScheduler(ep); }
        catch (Exception ex)
        {
            Console.Error.WriteLine("elf-run: " + ex.Message);
            return 127;
        }
        Console.Error.WriteLine("elf-run: target exited with code " + code);
        return code;
    }
}

// Minimal pipe stream wired to a shared Pipe.
internal sealed class PipeStream : Stream
{
    private readonly Program.Pipe pipe;
    private readonly bool isReader;

    public PipeStream(Program.Pipe pipe, bool isReader)
    {
        this.pipe = pipe;
        this.isReader = isReader;
    }

    public override bool CanRead => isReader;
    public override bool CanSeek => false;
    public override bool CanWrite => !isReader;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

    public override void Flush() { }

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (!isReader) throw new NotSupportedException();
        return pipe.Read(buffer, offset, count);
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    public override void Write(byte[] buffer, int offset, int count)
    {
        if (isReader) throw new NotSupportedException();
        pipe.Write(buffer, offset, count);
    }
}
