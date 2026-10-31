using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program
{
    private const int PROT_NONE = 0;
    private const int PROT_READ = 1;
    private const int PROT_WRITE = 2;
    private const int PROT_EXEC = 4;
    private const int MAP_PRIVATE = 2;
    private const int MAP_FIXED = 0x10;
    private const int MAP_ANONYMOUS = 0x20;
    private const uint PT_LOAD = 1;
    private const uint PT_INTERP = 3;
    private const uint PF_X = 1;
    private const uint PF_W = 2;
    private const uint PF_R = 4;
    private const int EI_CLASS = 4;
    private const int EI_DATA = 5;
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

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate void StartTrampoline(IntPtr stack, IntPtr entry, IntPtr exitStub);

    private struct Segment
    {
        public uint Offset;
        public uint Vaddr;
        public uint FileSize;
        public uint MemSize;
        public uint Flags;
        public uint MapStart;
        public uint MapLength;
    }

    private sealed class LoadedElf
    {
        public byte[] Image;
        public uint Base;
        public uint Entry;
        public uint Phdr;
        public ushort PhEntSize;
        public ushort PhNum;
        public List<Segment> Segments = new List<Segment>();
    }

    private static uint U32(byte[] data, int offset)
    {
        return BitConverter.ToUInt32(data, offset);
    }

    private static ushort U16(byte[] data, int offset)
    {
        return BitConverter.ToUInt16(data, offset);
    }

    private static IntPtr Ptr(uint value)
    {
        return new IntPtr(unchecked((int)value));
    }

    private static uint AlignUp(uint value, uint align)
    {
        return (value + align - 1) & ~(align - 1);
    }

    private static uint PageDown(uint value)
    {
        return value & 0xfffff000u;
    }

    private static void Fail(string message)
    {
        Console.Error.WriteLine("elf-run: " + message);
        Environment.Exit(126);
    }

    private static void Validate(byte[] image, string label)
    {
        if (image.Length < 52 ||
            image[0] != 0x7f || image[1] != (byte)'E' || image[2] != (byte)'L' || image[3] != (byte)'F')
            Fail(label + ": not an ELF file");
        if (image[EI_CLASS] != ELFCLASS32 || image[EI_DATA] != ELFDATA2LSB)
            Fail(label + ": only little-endian ELF32 is supported");
        if (U16(image, 18) != EM_ARM)
            Fail(label + ": not an ARM ELF (e_machine=" + U16(image, 18) + ")");
        var type = U16(image, 16);
        if (type != ET_EXEC && type != ET_DYN)
            Fail(label + ": unsupported ELF type " + type);
    }

    private static uint Reserve(uint length)
    {
        var reservation = mmap(IntPtr.Zero, (UIntPtr)AlignUp(length, 4096), PROT_NONE,
            MAP_PRIVATE | MAP_ANONYMOUS, -1, IntPtr.Zero);
        if (reservation == new IntPtr(-1))
            Fail("cannot reserve address space (errno " + Marshal.GetLastWin32Error() + ")");
        return (uint)reservation;
    }

    private static LoadedElf Load(byte[] image, string label, uint requestedBase)
    {
        Validate(image, label);

        var type = U16(image, 16);
        var phoff = U32(image, 28);
        var phentsize = U16(image, 42);
        var phnum = U16(image, 44);
        if (phentsize < 32 || phnum == 0)
            Fail(label + ": missing program headers");

        var segments = new List<Segment>();
        uint span = 0;
        for (var i = 0; i < phnum; i++)
        {
            var at = (int)(phoff + (uint)i * phentsize);
            if (at + 32 > image.Length) Fail(label + ": truncated program header table");
            var headerType = U32(image, at);
            if (headerType != PT_LOAD) continue;
            var segment = new Segment
            {
                Offset = U32(image, at + 4),
                Vaddr = U32(image, at + 8),
                FileSize = U32(image, at + 16),
                MemSize = U32(image, at + 20),
                Flags = U32(image, at + 24)
            };
            if (segment.FileSize > segment.MemSize)
                Fail(label + ": segment file size exceeds memory size");
            if ((ulong)segment.Offset + segment.FileSize > (ulong)image.Length)
                Fail(label + ": segment extends past the end of the file");
            var delta = segment.Vaddr - PageDown(segment.Vaddr);
            segment.MapStart = PageDown(segment.Vaddr);
            segment.MapLength = AlignUp(delta + segment.MemSize, 4096);
            if (segment.Vaddr + segment.MemSize > span) span = segment.Vaddr + segment.MemSize;
            segments.Add(segment);
        }
        if (segments.Count == 0) Fail(label + ": no loadable segments");

        uint imageBase;
        if (type == ET_EXEC)
        {
            imageBase = 0;
            if (requestedBase != 0)
                Fail(label + ": a non-PIE image cannot be relocated");
        }
        else
        {
            imageBase = requestedBase != 0 ? requestedBase : Reserve(span);
        }

        foreach (var segment in segments)
        {
            var at = imageBase + segment.MapStart;
            var addr = mmap(Ptr(at), (UIntPtr)segment.MapLength,
                PROT_READ | PROT_WRITE | PROT_EXEC,
                MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, IntPtr.Zero);
            if (addr == new IntPtr(-1))
                Fail(label + ": mmap failed at 0x" + at.ToString("x") +
                     " (errno " + Marshal.GetLastWin32Error() + ")");
            if (segment.FileSize > 0)
                Marshal.Copy(image, (int)segment.Offset, Ptr(at + (segment.Vaddr - segment.MapStart)),
                    (int)segment.FileSize);
        }

        foreach (var segment in segments)
        {
            var prot = 0;
            if ((segment.Flags & PF_R) != 0) prot |= PROT_READ;
            if ((segment.Flags & PF_W) != 0) prot |= PROT_WRITE;
            if ((segment.Flags & PF_X) != 0) prot |= PROT_EXEC;
            if (prot == 0) prot = PROT_READ;
            mprotect(Ptr(imageBase + segment.MapStart), (UIntPtr)segment.MapLength, prot);
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

        return new LoadedElf
        {
            Image = image,
            Base = imageBase,
            Entry = imageBase + U32(image, 24),
            Phdr = phdr,
            PhEntSize = phentsize,
            PhNum = phnum,
            Segments = segments
        };
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
            try { if (File.Exists(candidate)) return candidate; } catch { }
        }
        return null;
    }

    public static int Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("usage: elf-run <arm-elf> [args...]");
            return 64;
        }

        var target = args[0];
        byte[] image;
        try
        {
            image = File.ReadAllBytes(target);
        }
        catch (Exception ex)
        {
            Fail("cannot read " + target + ": " + ex.Message);
            return 70;
        }

        Validate(image, target);
        var main = Load(image, target, 0);

        LoadedElf interpreter = null;
        var interpPath = InterpPath(image);
        if (!string.IsNullOrEmpty(interpPath))
        {
            var resolved = ResolveInterp(interpPath);
            if (resolved == null) Fail("dynamic linker not found: " + interpPath);
            byte[] interpImage;
            try
            {
                interpImage = File.ReadAllBytes(resolved);
            }
            catch (Exception ex)
            {
                Fail("cannot read dynamic linker " + resolved + ": " + ex.Message);
                return 70;
            }
            interpreter = Load(interpImage, resolved, 0);
        }

        const uint stackSize = 8 * 1024 * 1024;
        var stackBase = mmap(IntPtr.Zero, (UIntPtr)stackSize, PROT_READ | PROT_WRITE,
            MAP_PRIVATE | MAP_ANONYMOUS, -1, IntPtr.Zero);
        if (stackBase == new IntPtr(-1))
            Fail("cannot allocate stack (errno " + Marshal.GetLastWin32Error() + ")");

        var sp = (uint)stackBase + stackSize;

        Func<byte[], uint> pushBytes = bytes =>
        {
            sp = (sp - (uint)bytes.Length) & 0xfffffffcu;
            Marshal.Copy(bytes, 0, Ptr(sp), bytes.Length);
            return sp;
        };

        Func<string, uint> pushString = value =>
        {
            var bytes = Encoding.UTF8.GetBytes(value + "\0");
            return pushBytes(bytes);
        };

        var argv = args;
        var argvPtrs = new uint[argv.Length];
        for (var i = 0; i < argv.Length; i++) argvPtrs[i] = pushString(argv[i]);

        var environment = new List<string>();
        foreach (System.Collections.DictionaryEntry item in Environment.GetEnvironmentVariables())
            environment.Add(item.Key + "=" + item.Value);
        var envPtrs = new uint[environment.Count];
        for (var i = 0; i < environment.Count; i++) envPtrs[i] = pushString(environment[i]);

        var random = new byte[16];
        using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(random);
        var randomPtr = pushBytes(random);

        var platformPtr = pushString("v7l");

        var aux = new List<uint>
        {
            AT_PHDR, main.Phdr,
            AT_PHENT, main.PhEntSize,
            AT_PHNUM, main.PhNum,
            AT_PAGESZ, 4096,
            AT_BASE, interpreter != null ? interpreter.Base : 0,
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
            AT_EXECFN, argvPtrs.Length > 0 ? argvPtrs[0] : pushString(target),
            AT_NULL, 0
        };

        var words = 1 + argvPtrs.Length + 1 + envPtrs.Length + 1 + aux.Count;
        sp = (sp - (uint)(words * 4)) & 0xfffffff8u;

        var cursor = sp;
        Action<uint> put = value =>
        {
            Marshal.WriteInt32(Ptr(cursor), unchecked((int)value));
            cursor += 4;
        };
        put((uint)argvPtrs.Length);
        foreach (var value in argvPtrs) put(value);
        put(0);
        foreach (var value in envPtrs) put(value);
        put(0);
        foreach (var value in aux) put(value);

        /* ARM trampoline: r0 = stack, r1 = entry, r2 = exit stub. */
        var trampoline = new byte[]
        {
            0x00, 0xd0, 0xa0, 0xe1,   /* mov sp, r0 */
            0x02, 0xe0, 0xa0, 0xe1,   /* mov lr, r2 */
            0x11, 0xff, 0x2f, 0xe1,   /* bx  r1   */
            0x01, 0x70, 0xa0, 0xe3,   /* mov r7, #1 (exit) */
            0x00, 0x00, 0x00, 0xef    /* svc #0   */
        };
        var code = mmap(IntPtr.Zero, (UIntPtr)4096, PROT_READ | PROT_WRITE | PROT_EXEC,
            MAP_PRIVATE | MAP_ANONYMOUS, -1, IntPtr.Zero);
        if (code == new IntPtr(-1))
            Fail("cannot allocate trampoline (errno " + Marshal.GetLastWin32Error() + ")");
        Marshal.Copy(trampoline, 0, code, trampoline.Length);

        var entry = interpreter != null ? interpreter.Entry : main.Entry;
        var start = (StartTrampoline)Marshal.GetDelegateForFunctionPointer(code, typeof(StartTrampoline));
        Console.Out.Flush();
        Console.Error.Flush();
        start(Ptr(sp), Ptr(entry), Ptr((uint)code + 12));

        Console.Error.WriteLine("elf-run: target returned");
        return 127;
    }
}
