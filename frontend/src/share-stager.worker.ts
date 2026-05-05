/// <reference lib="webworker" />

/*
 * Streams an HTTP response into an OPFS file via the worker-only
 * createSyncAccessHandle() API. iOS Safari has shipped this since 15.2 and
 * it's the only reliable OPFS write path on the platform — main-thread
 * createWritable() / pipeTo() is buggy or unimplemented depending on iOS
 * version. Used by IosShareButton so the resulting File is backed by a
 * real OPFS inode (which iOS' share extensions accept) rather than an
 * opaque in-memory Blob (which they silently reject, leaving the user
 * with the degenerate "Add to Shared Album / Find on Amazon" sheet).
 */

interface InitMessage {
  type: "init"
  url: string
  dirName: string
  filename: string
}

interface DoneOk {
  type: "done"
  ok: true
  size: number
}

interface DoneErr {
  type: "done"
  ok: false
  error: string
}

type DoneMessage = DoneOk | DoneErr

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.addEventListener("message", async (e: MessageEvent<InitMessage>) => {
  const msg = e.data
  if (msg?.type !== "init") return

  let access: FileSystemSyncAccessHandle | null = null
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(msg.dirName, { create: true })
    const handle = await dir.getFileHandle(msg.filename, { create: true })
    access = await handle.createSyncAccessHandle()
    access.truncate(0)

    const res = await fetch(msg.url)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    if (!res.body) throw new Error("response has no body")

    const reader = res.body.getReader()
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      access.write(value, { at: size })
      size += value.byteLength
    }
    access.flush()

    const reply: DoneOk = { type: "done", ok: true, size }
    ctx.postMessage(reply)
  } catch (err) {
    const reply: DoneErr = {
      type: "done",
      ok: false,
      error: (err as Error)?.message ?? String(err),
    }
    ctx.postMessage(reply)
  } finally {
    try {
      access?.close()
    } catch {
      /* ignore */
    }
  }
})
