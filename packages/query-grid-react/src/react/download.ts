const REVOKE_DELAY_MS = 10_000;

// The address is released after a pause, not at once: a browser that starts the download a moment after the click would find nothing behind it.
export function saveTextFile(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
