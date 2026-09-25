/** Basename seguro para paths de Storage (sin path traversal ni caracteres raros). */
export function sanitizeStorageBasename(name: string): string {
  const base = (name || "archivo").split(/[/\\]/).pop() || "archivo";
  const cleaned = base
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "archivo";
}

/** Extensión corta a partir del nombre o MIME. */
export function storageExtFromFile(file: File, fallback = "bin"): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const mime = file.type.split("/")[1];
  if (mime && /^[a-z0-9.+-]{1,16}$/i.test(mime)) return mime.split("+")[0];
  return fallback;
}

/**
 * Si el valor es una URL pública legacy, la deja; si es un path de bucket,
 * el caller debe pedir signed URL. Detecta URLs absolutas.
 */
export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value);
}
