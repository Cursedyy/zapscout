export function lerArquivoCarteira(file: File): Promise<{ rows: unknown[][]; hash: string }> {
  if (file.size > 15 * 1024 * 1024) return Promise.reject(Error("Use um arquivo de até 15 MB."));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mimo-carteira-importacao.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      worker.terminate();
      e.data.erro ? reject(Error(e.data.erro)) : resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(Error("Não foi possível ler o arquivo."));
    };
    worker.postMessage(file);
  });
}
