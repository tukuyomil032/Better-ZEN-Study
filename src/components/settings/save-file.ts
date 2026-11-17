// Saves text as a file the person chooses where to keep. An extension page can do this with a
// download link alone, so no download permission is needed.
export function saveTextFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the download has had time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
