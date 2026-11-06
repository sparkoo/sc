export function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  if (bytes < 1024) return String(bytes) + " B";
  const index = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  return (bytes / 1024 ** index).toFixed(1) + " " + units[index];
}
